import { DOCTRINES, sanitizeDoctrineRanks, type DoctrineId, type DoctrineRanks } from './doctrines';
import { isChallengeMode, isRuleChallenge } from './challenges';
import type { ChallengeMode, Difficulty } from './types';

/** Campaign records and an independent resumable battle for each level, stored in this browser. */
export const PROGRESS_KEY = 'verdant-campaign-v1';
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface LevelRecord {
  stars: number; bestLives: number; victories: number;
  challengeStars?: { veteran?: number; heroic?: number };
}
export interface RuleRecord { medal: number; bestLives: number; victories: number }
export interface CampaignProgress {
  version: 1; updatedAt: number; selectedLevelId: string;
  completed: Record<string, LevelRecord>; checkpoint: unknown | null; checkpoints: Record<string, unknown>;
  doctrines: DoctrineRanks;
  selectedChallenge?: ChallengeMode;
  challengeCheckpoints: Record<string, unknown>;
  ruleRecords: Record<string, Partial<Record<Difficulty, RuleRecord>>>;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const difficultyValid = (value: unknown): value is Difficulty => value === 'normal' || value === 'veteran' || value === 'heroic';
const ruleKey = (id: string, mode: ChallengeMode): string => `${id}::${mode}`;
/** Full simulation validation belongs to the engine; storage verifies the slot's identity. */
function checkpointMatches(value: unknown, id: string, mode: ChallengeMode): boolean {
  if (!object(value)) return false;
  if (Object.hasOwn(value, 'levelId') && value.levelId !== id) return false;
  if (mode === 'standard') return !Object.hasOwn(value, 'challenge') || value.challenge === 'standard';
  return Object.hasOwn(value, 'challenge') && value.challenge === mode && value.levelId === id;
}
export function victoryStars(lives: number, startingLives = 20): number {
  return lives >= startingLives * .9 ? 3 : lives >= startingLives * .5 ? 2 : 1;
}
export class ProgressStore {
  progress: CampaignProgress;
  available = true;
  constructor(private storage: SaveStorage | null, private levelIds: readonly string[]) {
    this.progress = this.empty(); this.available = !!storage;
    try {
      const raw = storage?.getItem(PROGRESS_KEY);
      if (raw && raw.length < 2_000_000) this.progress = this.read(JSON.parse(raw));
      if (!raw && this.levelIds[0] === 'forest') {
        const legacyStars = Number(storage?.getItem('verdant-best'));
        if (Number.isInteger(legacyStars) && legacyStars >= 1 && legacyStars <= 3) {
          this.progress.completed.forest = { stars: legacyStars, bestLives: 0, victories: 1 };
        }
      }
    } catch { this.available = false; }
  }
  private empty(): CampaignProgress {
    return { version: 1, updatedAt: 0, selectedLevelId: this.levelIds[0], selectedChallenge: 'standard', completed: {}, checkpoint: null, checkpoints: {}, challengeCheckpoints: {}, ruleRecords: {}, doctrines: {} };
  }
  private read(value: unknown): CampaignProgress {
    const fresh = this.empty();
    if (!object(value) || value.version !== 1) return fresh;
    const source = value as unknown as CampaignProgress;
    if (Number.isFinite(source.updatedAt) && source.updatedAt > 0) fresh.updatedAt = source.updatedAt;
    if (this.levelIds.includes(source.selectedLevelId)) fresh.selectedLevelId = source.selectedLevelId;
    for (const id of this.levelIds) {
      // A later level cannot supply stars when its prerequisite records are missing or invalid.
      if (!this.isUnlocked(id, fresh)) continue;
      const record = source.completed && Object.hasOwn(source.completed, id) ? source.completed[id] : undefined;
      if (!record || !Number.isInteger(record.stars) || record.stars < 1 || record.stars > 3) continue;
      fresh.completed[id] = { stars: record.stars,
        bestLives: Number.isInteger(record.bestLives) && record.bestLives >= 0 && record.bestLives <= 100 ? record.bestLives : 0,
        victories: Number.isInteger(record.victories) && record.victories > 0 ? Math.min(record.victories, 1_000_000) : 1 };
      const badges: NonNullable<LevelRecord['challengeStars']> = {};
      for (const difficulty of ['veteran', 'heroic'] as const) {
        const stars = record.challengeStars && Object.hasOwn(record.challengeStars, difficulty) ? record.challengeStars[difficulty] : undefined;
        if (typeof stars === 'number' && Number.isInteger(stars) && stars >= 1 && stars <= 3) badges[difficulty] = stars;
      }
      if (Object.keys(badges).length) fresh.completed[id].challengeStars = badges;
    }
    if (!this.isUnlocked(fresh.selectedLevelId, fresh)) fresh.selectedLevelId = this.levelIds[0];
    if (isChallengeMode(source.selectedChallenge) && this.isChallengeUnlocked(fresh.selectedLevelId, source.selectedChallenge, fresh)) fresh.selectedChallenge = source.selectedChallenge;
    // Every rule challenge has its own resume slot and difficulty-specific record.
    for (const id of this.levelIds) {
      if (!this.isUnlocked(id, fresh)) continue;
      const checkpoint = source.checkpoints && Object.hasOwn(source.checkpoints, id) ? source.checkpoints[id] : null;
      if (checkpointMatches(checkpoint, id, 'standard')) fresh.checkpoints[id] = checkpoint;
      if (!this.isChallengeUnlocked(id, 'four-towers', fresh)) continue;
      for (const mode of ['four-towers', 'no-meteor'] as const) {
        const key = ruleKey(id, mode);
        const snapshot = object(source.challengeCheckpoints) && Object.hasOwn(source.challengeCheckpoints, key) ? source.challengeCheckpoints[key] : null;
        if (checkpointMatches(snapshot, id, mode)) fresh.challengeCheckpoints[key] = snapshot;
        const records = object(source.ruleRecords) && Object.hasOwn(source.ruleRecords, key) ? source.ruleRecords[key] : null;
        if (!object(records)) continue;
        const valid: Partial<Record<Difficulty, RuleRecord>> = {};
        for (const difficulty of ['normal', 'veteran', 'heroic'] as const) {
          const record = Object.hasOwn(records, difficulty) ? records[difficulty] : null;
          if (!object(record) || !Number.isInteger(record.medal) || (record.medal as number) < 1 || (record.medal as number) > 3
            || !Number.isInteger(record.bestLives) || (record.bestLives as number) < 1 || (record.bestLives as number) > 100
            || !Number.isInteger(record.victories) || (record.victories as number) < 1) continue;
          valid[difficulty] = { medal: record.medal as number, bestLives: record.bestLives as number, victories: Math.min(record.victories as number, 1_000_000) };
        }
        if (Object.keys(valid).length) fresh.ruleRecords[key] = valid;
      }
    }
    const selectedMode = fresh.selectedChallenge ?? 'standard', selectedKey = ruleKey(fresh.selectedLevelId, selectedMode);
    if (checkpointMatches(source.checkpoint, fresh.selectedLevelId, selectedMode)) {
      if (selectedMode === 'standard' && !fresh.checkpoints[fresh.selectedLevelId]) fresh.checkpoints[fresh.selectedLevelId] = source.checkpoint;
      else if (selectedMode !== 'standard' && !fresh.challengeCheckpoints[selectedKey]) fresh.challengeCheckpoints[selectedKey] = source.checkpoint;
    }
    fresh.checkpoint = (selectedMode === 'standard' ? fresh.checkpoints[fresh.selectedLevelId] : fresh.challengeCheckpoints[selectedKey]) ?? null;
    const ranks = sanitizeDoctrineRanks(source.doctrines);
    // An overdrawn allocation is discarded instead of granting an arbitrary subset of bonuses.
    if (this.countSpentStars(ranks) <= this.countEarnedStars(fresh)) fresh.doctrines = ranks;
    return fresh;
  }
  isUnlocked(id: string, progress = this.progress): boolean {
    const index = this.levelIds.indexOf(id);
    return index === 0 || index > 0 && this.levelIds.slice(0, index).every(previous => !!progress.completed[previous]);
  }
  isChallengeUnlocked(id: string, mode: ChallengeMode = 'standard', progress = this.progress): boolean {
    return isChallengeMode(mode) && this.isUnlocked(id, progress) && (mode === 'standard' || !!progress.completed[id]);
  }
  getRuleRecord(id: string, mode: ChallengeMode, difficulty: Difficulty = 'normal'): RuleRecord | null {
    if (!isRuleChallenge(mode) || !difficultyValid(difficulty) || !this.isChallengeUnlocked(id, mode)) return null;
    return this.progress.ruleRecords[ruleKey(id, mode)]?.[difficulty] ?? null;
  }
  recordRuleVictory(id: string, mode: ChallengeMode, lives: number, startingLives = 20, restoring = false, difficulty: Difficulty = 'normal'): RuleRecord | null {
    if (!isRuleChallenge(mode) || !difficultyValid(difficulty) || !this.isChallengeUnlocked(id, mode)
      || !Number.isInteger(lives) || lives < 1 || !Number.isInteger(startingLives) || startingLives < 1 || startingLives > 100 || lives > startingLives) return null;
    const key = ruleKey(id, mode), old = this.getRuleRecord(id, mode, difficulty);
    const record: RuleRecord = { medal: Math.max(old?.medal ?? 0, victoryStars(lives, startingLives)),
      bestLives: Math.max(old?.bestLives ?? 0, lives), victories: restoring ? Math.max(old?.victories ?? 0, 1) : Math.min((old?.victories ?? 0) + 1, 1_000_000) };
    this.progress.ruleRecords[key] = { ...this.progress.ruleRecords[key], [difficulty]: record };
    this.write(); return record;
  }
  recordVictory(id: string, lives: number, startingLives = 20, restoring = false, difficulty: 'normal' | 'veteran' | 'heroic' = 'normal'): LevelRecord | null {
    if (!this.isUnlocked(id) || !Number.isFinite(lives) || lives < 0 || !Number.isFinite(startingLives) || startingLives <= 0) return null;
    const old = this.progress.completed[id];
    const stars = victoryStars(lives, startingLives);
    const record: LevelRecord = { stars: Math.max(old?.stars ?? 0, stars),
      bestLives: Math.max(old?.bestLives ?? 0, lives),
      // A restored victory can repair a missing result without counting the same battle twice.
      victories: restoring ? Math.max(old?.victories ?? 0, 1) : (old?.victories ?? 0) + 1 };
    if (old?.challengeStars) record.challengeStars = { ...old.challengeStars };
    if (difficulty === 'veteran' || difficulty === 'heroic') {
      record.challengeStars ??= {};
      record.challengeStars[difficulty] = Math.max(record.challengeStars[difficulty] ?? 0, stars);
    }
    this.progress.completed[id] = record; this.write(); return record;
  }
  private countEarnedStars(progress: CampaignProgress): number {
    let earned = 0;
    for (const id of this.levelIds) {
      const stars = progress.completed[id]?.stars;
      if (!Number.isInteger(stars) || stars < 1 || stars > 3) break;
      earned += stars;
    }
    return earned;
  }
  private countSpentStars(ranks: DoctrineRanks): number {
    return Object.values(DOCTRINES).reduce((spent, doctrine) => spent + (ranks[doctrine.id] ?? 0) * doctrine.cost, 0);
  }
  earnedStars(): number { return this.countEarnedStars(this.progress); }
  spentStars(): number { return this.countSpentStars(sanitizeDoctrineRanks(this.progress.doctrines)); }
  availableStars(): number { return Math.max(0, this.earnedStars() - this.spentStars()); }
  learnDoctrine(id: DoctrineId): { ok: boolean; message: string } {
    if (!Object.hasOwn(DOCTRINES, id)) return { ok: false, message: '无法识别此项天赋。' };
    const doctrine = DOCTRINES[id], ranks = sanitizeDoctrineRanks(this.progress.doctrines);
    const rank = ranks[id] ?? 0;
    if (rank >= doctrine.maxRank) return { ok: false, message: `${doctrine.name}已升至最高阶。` };
    if (this.countSpentStars(ranks) + doctrine.cost > this.earnedStars()) return { ok: false, message: '可用星星不足，提升关卡最高星级可获得更多星星。' };
    this.progress.doctrines = { ...ranks, [id]: rank + 1 };
    this.write();
    return { ok: true, message: `${doctrine.name}已提升至 ${rank + 1} 阶，重新部署关卡后生效。` };
  }
  resetDoctrines(): { ok: boolean; message: string } {
    this.progress.doctrines = {}; this.write();
    return { ok: true, message: '天赋已免费重置，全部星星可重新分配；重新部署后生效。' };
  }
  checkpoint(snapshot: unknown, levelId: string, mode: ChallengeMode = 'standard'): boolean {
    if (!this.isChallengeUnlocked(levelId, mode) || !checkpointMatches(snapshot, levelId, mode)) return false;
    this.progress.selectedLevelId = levelId; this.progress.selectedChallenge = mode; this.progress.checkpoint = snapshot;
    if (mode === 'standard') this.progress.checkpoints[levelId] = snapshot;
    else this.progress.challengeCheckpoints[ruleKey(levelId, mode)] = snapshot;
    return this.write();
  }
  discardCheckpoint(levelId = this.progress.selectedLevelId, mode: ChallengeMode = this.progress.selectedChallenge ?? 'standard'): boolean {
    if (!isChallengeMode(mode) || !this.levelIds.includes(levelId)) return false;
    if (mode === 'standard') delete this.progress.checkpoints[levelId];
    else delete this.progress.challengeCheckpoints[ruleKey(levelId, mode)];
    if (levelId === this.progress.selectedLevelId && mode === (this.progress.selectedChallenge ?? 'standard')) this.progress.checkpoint = null;
    return this.write();
  }
  getCheckpoint(levelId: string, mode: ChallengeMode = 'standard'): unknown | null {
    if (!this.isChallengeUnlocked(levelId, mode)) return null;
    return (mode === 'standard' ? this.progress.checkpoints[levelId] : this.progress.challengeCheckpoints[ruleKey(levelId, mode)]) ?? null;
  }
  private write(): boolean {
    this.progress.updatedAt = Date.now();
    try { if (!this.storage) return false; this.storage.setItem(PROGRESS_KEY, JSON.stringify(this.progress)); this.available = true; return true; }
    catch { this.available = false; return false; }
  }
}
