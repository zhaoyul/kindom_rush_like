import { damageAfterResistance, ENEMY_STATS, getLevelForRules, getTowerStats, HERO_STATS, LEVELS, MAP_HEIGHT, MAP_WIDTH, SKILLS, TOWER_ABILITIES } from './data';
import type { ActionResult, Ally, ChallengeMode, CombatPose, Difficulty, EarlyWaveOffer, Effect, Enemy, EnemyKind, GameSave, GameState, LevelDefinition, LevelId, MapEventStatus, Point, SkillKind, Tower, TowerAbilityKind, TowerBranchId, TowerKind, TowerPriority, WaveBattleReport } from './types';
import { nearestLevelPathPoint, sampleLevelPath } from './campaign';
import { deriveBattleUpgrades, type BattleUpgrades } from './doctrines';
import { getBranchChoiceCost, getTowerBranch, getTowerCombatStats, getTowerInvestment, TOWER_BRANCHES } from './tower-branches';
import { createBattleReport, isValidBattleReport } from './battle-report';
import { getMapEventDefinition } from './map-events';

import { DIFFICULTY_MULTIPLIERS, isDifficulty } from './difficulties';
export { DIFFICULTY_MULTIPLIERS } from './difficulties';
export interface GameOptions { difficulty?: Difficulty; upgrades?: BattleUpgrades; rulesVersion?: 1 | 2; challenge?: ChallengeMode }
const challengeModes: ChallengeMode[] = ['standard', 'four-towers', 'no-meteor'];
const priorities: TowerPriority[] = ['first', 'strong', 'weak'];
const waveQueue = (level: LevelDefinition, waveIndex: number, difficulty: Difficulty): GameState['spawnQueue'] => {
  let cursor = 0;
  return level.waves[waveIndex].enemies.flatMap(group => {
    const start = group.delay ?? cursor;
    cursor = Math.max(cursor, start + group.count * group.interval);
    return Array.from({ length: group.count }, (_, i) => ({ kind: group.kind, time: (start + i * group.interval) * DIFFICULTY_MULTIPLIERS[difficulty].spawnInterval }));
  }).sort((a, b) => a.time - b.time);
};
const validUpgrades = (value: unknown): value is BattleUpgrades => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const upgrades = value as BattleUpgrades;
  return Object.keys(upgrades).length === 4 && ['rangedDamageMultiplier', 'soldierHpMultiplier', 'heroHpMultiplier', 'skillCooldownMultiplier']
    .every(key => Object.hasOwn(upgrades, key)) && [
    [upgrades.rangedDamageMultiplier, 1, 1.12], [upgrades.soldierHpMultiplier, 1, 1.18],
    [upgrades.heroHpMultiplier, 1, 1.18], [upgrades.skillCooldownMultiplier, 0.88, 1],
  ].every(([actual, minimum, maximum]) => typeof actual === 'number' && Number.isFinite(actual) && actual >= minimum - 1e-9 && actual <= maximum + 1e-9);
};

const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const success = (message: string): ActionResult => ({ ok: true, message });
const failure = (message: string): ActionResult => ({ ok: false, message });
const insideMap = (x: number, y: number): Point => ({ x: Math.max(20, Math.min(MAP_WIDTH - 20, x)), y: Math.max(65, Math.min(MAP_HEIGHT - 35, y)) });
const segmentDistanceSquared = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const ratio = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return distanceSquared(point, { x: start.x + dx * ratio, y: start.y + dy * ratio });
};
const ENEMY_ATTACK_ANIMATION: Record<EnemyKind, number> = {
  goblin: 0.45, wolf: 0.38, orc: 0.45, shaman: 0.52, golem: 0.64, chieftain: 0.62,
  bogling: 0.45, serpent: 0.38, icewolf: 0.38, frostguard: 0.45, imp: 0.52, juggernaut: 0.64,
};
const BOSS_SLAMS = Object.freeze({
  chieftain: Object.freeze({ kind: 'chieftain-slam' as const, duration: 1.8, radius: 82, damage: 112, cooldown: 10, recover: 0.8, engageRange: 125, initial: 6 }),
  juggernaut: Object.freeze({ kind: 'juggernaut-slam' as const, duration: 2.1, radius: 92, damage: 148, cooldown: 12, recover: 1, engageRange: 145, initial: 7 }),
});
const bossSpec = (enemy: Pick<Enemy, 'kind'>) => enemy.kind === 'chieftain' || enemy.kind === 'juggernaut' ? BOSS_SLAMS[enemy.kind] : undefined;

/** Deterministic simulation, with time expressed in seconds and path progress in pixels. */
export class GameEngine {
  state!: GameState;
  level: LevelDefinition;
  private nextId = 1;
  private shamanTimers = new Map<number, number>();
  private commandedMovement = new Set<number>();
  private randomState = 1;
  private slowEffects = new Map<number, Map<string, { amount: number; remaining: number }>>();
  private rootFollowups = new Map<number, { amount: number; duration: number }>();
  private frostZones: (Point & { sourceId: number; remaining: number; amount: number; radius: number })[] = [];
  private soldierStrikes = new Map<number, number>();
  private battleDifficulty: Difficulty;
  private battleUpgrades: Readonly<BattleUpgrades>;
  private ruleVersion: 1 | 2;
  private battleChallenge: ChallengeMode;

  constructor(private seed = 0x51f0a7, levelId: LevelId = 'forest', options: GameOptions = {}) {
    this.ruleVersion = options.rulesVersion ?? 2;
    this.level = getLevelForRules(levelId, this.ruleVersion);
    this.battleChallenge = options.challenge ?? 'standard';
    if (!challengeModes.includes(this.battleChallenge)) throw new Error('未知规则挑战。');
    this.battleDifficulty = options.difficulty ?? 'normal';
    if (!isDifficulty(this.battleDifficulty)) throw new Error('未知难度。');
    const upgrades = options.upgrades ?? deriveBattleUpgrades();
    if (!validUpgrades(upgrades)) throw new Error('永久天赋参数无效。');
    this.battleUpgrades = Object.freeze({ ...upgrades });
    this.reset();
  }

  get difficulty(): Difficulty { return this.battleDifficulty; }
  get upgrades(): Readonly<BattleUpgrades> { return this.battleUpgrades; }
  get rulesVersion(): 1 | 2 { return this.ruleVersion; }
  get challenge(): ChallengeMode { return this.battleChallenge; }
  get pathLength(): number { return this.level.pathLength; }
  samplePath(progress: number): Point { return sampleLevelPath(this.level, progress); }
  nearestPathPoint(point: Point): Point & { progress: number } { return nearestLevelPathPoint(this.level, point); }

  exportSave(): GameSave {
    return JSON.parse(JSON.stringify({
      version: 1, levelId: this.level.id, seed: this.seed >>> 0, state: this.state,
      difficulty: this.difficulty, upgrades: this.upgrades, rulesVersion: this.rulesVersion, challenge: this.challenge,
      runtime: {
        nextId: this.nextId, randomState: this.randomState,
        shamanTimers: [...this.shamanTimers], commandedMovement: [...this.commandedMovement],
        soldierStrikes: [...this.soldierStrikes],
        slowEffects: [...this.slowEffects].map(([id, effects]) => [id, [...effects]]),
        rootFollowups: [...this.rootFollowups], frostZones: this.frostZones,
      },
    })) as GameSave;
  }

  /** Import is atomic: invalid data never alters the current level or simulation. */
  importSave(input: unknown): ActionResult {
    try {
      const serialized = JSON.stringify(input);
      if (!serialized || serialized.length > 2_000_000) return failure('存档过大或格式损坏。');
      const save: unknown = JSON.parse(serialized);
      if (!validSave(save)) return failure('存档校验失败，请重新开始关卡。');
      const checkpoint = save as GameSave;
      const ruleVersion = checkpoint.rulesVersion ?? 1;
      const level = getLevelForRules(checkpoint.levelId, ruleVersion);
      this.level = level;
      this.ruleVersion = ruleVersion;
      this.seed = checkpoint.seed;
      this.battleDifficulty = checkpoint.difficulty ?? 'normal';
      this.battleChallenge = checkpoint.challenge ?? 'standard';
      this.battleUpgrades = Object.freeze({ ...(checkpoint.upgrades ?? deriveBattleUpgrades()) });
      this.state = checkpoint.state;
      const partialReport = this.state.report === undefined;
      this.state.report ??= createBattleReport(this.state, true);
      if (getMapEventDefinition(this.level.id, this.rulesVersion)) this.state.mapEvent ??= { id: 'marsh-floodgate', activeRemaining: 0, cooldownRemaining: 0, activations: 0 };
      for (const tower of this.state.towers) tower.targetPriority ??= 'first';
      this.state.stats.earlyWavesCalled ??= 0;
      this.state.stats.earlyWaveGold ??= 0;
      this.nextId = checkpoint.runtime.nextId;
      this.randomState = checkpoint.runtime.randomState;
      this.shamanTimers = new Map(checkpoint.runtime.shamanTimers);
      this.commandedMovement = new Set(checkpoint.runtime.commandedMovement);
      this.soldierStrikes = new Map(checkpoint.runtime.soldierStrikes);
      this.slowEffects = new Map(checkpoint.runtime.slowEffects.map(([id, effects]) => [id, new Map(effects)]));
      this.rootFollowups = new Map(checkpoint.runtime.rootFollowups);
      this.frostZones = checkpoint.runtime.frostZones;
      if (partialReport) this.observeReportWave();
      return success(`已恢复${this.level.name} · 第 ${this.state.wave} 波进度。`);
    } catch { return failure('存档无法读取，请重新开始关卡。'); }
  }

  reset(): void {
    this.nextId = 1;
    this.shamanTimers.clear();
    this.commandedMovement.clear();
    this.randomState = (this.seed >>> 0) || 1;
    this.slowEffects.clear();
    this.rootFollowups.clear();
    this.frostZones = [];
    this.soldierStrikes.clear();
    const heroHp = HERO_STATS.hp * this.upgrades.heroHpMultiplier;
    const hero: Ally = { id: this.nextId++, type: 'hero', ...this.level.heroSpawn, hp: heroHp,
      maxHp: heroHp, damage: HERO_STATS.damage, armor: HERO_STATS.armor, speed: HERO_STATS.speed,
      attackTimer: 0, respawnTimer: 0, targetX: this.level.heroSpawn.x, targetY: this.level.heroSpawn.y, towerId: null, engagedWith: null,
      attackAnimation: 0, hitAnimation: 0, facingX: -1, facingY: 0, attackVariant: 0,
      buffTimer: 0, damageMultiplier: 1, armorBonus: 0 };
    this.state = { time: 0, phase: 'preparation', gold: this.level.startGold, lives: this.level.lives, wave: 0, kills: 0,
      towers: [], enemies: [], allies: [hero], effects: [], spawnQueue: [], waveElapsed: 0,
      skillCooldowns: { meteor: 0, reinforce: 0, hero: 0, 'hero-dash': 0, 'hero-roots': 0, 'hero-oath': 0 }, message: '建造防御塔，然后开始第一波。',
      stats: { goldEarned: 0, damageDealt: 0, skillsUsed: 0, towersBuilt: 0, earlyWavesCalled: 0, earlyWaveGold: 0 } };
    this.state.report = createBattleReport(this.state);
    if (getMapEventDefinition(this.level.id, this.rulesVersion)) this.state.mapEvent = { id: 'marsh-floodgate', activeRemaining: 0, cooldownRemaining: 0, activations: 0 };
  }

  private get finished(): boolean { return this.state.phase === 'victory' || this.state.phase === 'defeat'; }

  build(slotId: number, kind: TowerKind): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    if (!['arrow', 'mage', 'barracks', 'cannon'].includes(kind)) return failure('未知防御塔。');
    const slot = this.level.slots.find(s => s.id === slotId);
    if (!slot) return failure('请选择一个建造位。');
    if (this.state.towers.some(t => t.slotId === slotId)) return failure('这个建造位已被占用。');
    if (this.challenge === 'four-towers' && this.state.towers.length >= 4) return failure('四塔防线最多同时建造 4 座防御塔。出售一座后可换位重建。');
    const stats = getTowerStats(kind, 1);
    if (this.state.gold < stats.cost) return failure(`需要 ${stats.cost} 金币。`);
    const rally = this.nearestPathPoint(slot);
    const tower: Tower = { id: this.nextId++, x: slot.x, y: slot.y, slotId, kind, level: 1, attackTimer: 0,
      rallyX: rally.x, rallyY: rally.y, attackAnimation: 0, hitAnimation: 0, facingX: 1, facingY: 0, attackVariant: 0,
      abilities: {}, abilityTimers: {}, targetPriority: 'first' };
    this.state.gold -= stats.cost;
    this.state.towers.push(tower);
    this.state.report!.towers.push({ id: tower.id, kind, slotId, level: 1, builtAt: this.state.time, damage: 0, kills: 0 });
    this.state.stats.towersBuilt++;
    if (kind === 'barracks') {
      for (let i = 0; i < 3; i++) this.state.allies.push(this.makeSoldier(tower, i));
    }
    return this.announce(success(`${stats.name}已建造。`));
  }

  upgrade(towerId: number): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(t => t.id === towerId);
    if (!tower) return failure('请选择防御塔。');
    if (tower.level >= 3) return failure('已经达到最高等级。');
    const old = getTowerStats(tower.kind, tower.level);
    if (this.state.gold < old.upgradeCost) return failure(`需要 ${old.upgradeCost} 金币。`);
    this.state.gold -= old.upgradeCost;
    tower.level++;
    const reportTower = this.state.report!.towers.find(entry => entry.id === tower.id);
    if (reportTower) reportTower.level = tower.level;
    const stats = getTowerCombatStats(tower);
    if (tower.kind === 'barracks') this.syncSoldiers(tower, 'increase');
    return this.announce(success(`升级为${stats.name}。`));
  }

  buyTowerAbility(towerId: number, kind: TowerAbilityKind): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(t => t.id === towerId);
    if (!tower) return failure('请选择防御塔。');
    const ability = TOWER_ABILITIES[kind];
    if (!ability || ability.towerKind !== tower.kind) return failure('这座塔不能学习该技能。');
    if (tower.level < 3) return failure('防御塔达到三级后才能学习高级技能。');
    const rank = tower.abilities[kind] ?? 0;
    if (rank >= 2) return failure('该技能已经达到最高等级。');
    const cost = ability.costs[rank];
    if (this.state.gold < cost) return failure(`需要 ${cost} 金币。`);
    this.state.gold -= cost;
    tower.abilities[kind] = rank + 1;
    tower.abilityTimers[kind] ??= 0;
    if (kind === 'barracks-fortify') {
      this.syncSoldiers(tower, 'increase');
      this.effect('ring', tower, 0.65, { radius: 52, color: '#e4d391', style: kind, sourceId: tower.id });
    }
    return this.announce(success(`${ability.name} · ${rank + 1} 级已习得。`));
  }

  chooseTowerBranch(towerId: number, id: TowerBranchId): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(candidate => candidate.id === towerId);
    if (!tower) return failure('请选择防御塔。');
    if (!Object.hasOwn(TOWER_BRANCHES, id) || TOWER_BRANCHES[id].towerKind !== tower.kind) return failure('这座塔不能选择该流派。');
    if (tower.level !== 3) return failure('防御塔达到三级后才能选择流派。');
    if (tower.branch === id) return failure('当前已采用这个流派。');
    const cost = getBranchChoiceCost(tower, id);
    if (this.state.gold < cost) return failure(`转型需要 ${cost} 金币。`);
    this.state.gold -= cost;
    tower.branch = id;
    tower.branchGoldSpent = (tower.branchGoldSpent ?? 0) + cost;
    const reportTower = this.state.report!.towers.find(entry => entry.id === tower.id);
    if (reportTower) reportTower.branch = id;
    if (tower.kind === 'barracks') this.syncSoldiers(tower, 'ratio');
    this.effect('ring', tower, 0.65, { radius: 52, color: '#e5d9ab', sourceId: tower.id, style: 'tower-branch' });
    return this.announce(success(`已转型为${TOWER_BRANCHES[id].name}，保留已学专精。`));
  }

  sell(towerId: number): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(t => t.id === towerId);
    if (!tower) return failure('请选择防御塔。');
    const invested = getTowerInvestment(tower);
    const refund = Math.floor(invested * 70 / 100);
    for (const ally of this.state.allies.filter(a => a.towerId === tower.id)) {
      this.disengage(ally);
      this.soldierStrikes.delete(ally.id);
      this.commandedMovement.delete(ally.id);
    }
    this.frostZones = this.frostZones.filter(zone => zone.sourceId !== tower.id);
    this.state.effects = this.state.effects.filter(effect => effect.type !== 'frost-zone' || effect.sourceId !== tower.id);
    this.state.allies = this.state.allies.filter(a => a.towerId !== tower.id);
    this.state.towers = this.state.towers.filter(t => t.id !== tower.id);
    const reportTower = this.state.report!.towers.find(entry => entry.id === tower.id);
    if (reportTower) reportTower.soldAt = this.state.time;
    this.state.gold += refund;
    return this.announce(success(`已出售，返还 ${refund} 金币。`));
  }

  setRally(towerId: number, x: number, y: number): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(t => t.id === towerId);
    if (!tower || tower.kind !== 'barracks') return failure('只有驻兵塔可以设置集结点。');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return failure('请选择有效的位置。');
    if (x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) return failure('集结点必须位于地图内。');
    const rally = this.nearestPathPoint({ x, y });
    if (distanceSquared({ x, y }, rally) > 45 ** 2) return failure('请在道路上或道路旁 45 范围内选择集结点。');
    if (distanceSquared(tower, rally) > getTowerCombatStats(tower).range ** 2) return failure('集结点超出驻兵塔的范围。');
    tower.rallyX = rally.x;
    tower.rallyY = rally.y;
    this.state.allies.filter(a => a.towerId === tower.id).forEach((ally, i) => {
      this.disengage(ally);
      this.cancelAttackPose(ally);
      ally.targetX = rally.x + (i - 1) * 17;
      ally.targetY = rally.y + (i === 1 ? 8 : -5);
      this.commandedMovement.add(ally.id);
    });
    return this.announce(success('卫兵正在前往新的集结点。'));
  }

  setTowerPriority(towerId: number, priority: TowerPriority): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const tower = this.state.towers.find(t => t.id === towerId);
    if (!tower) return failure('请选择防御塔。');
    if (tower.kind === 'barracks') return failure('驻兵塔由卫兵就近拦截敌人。');
    if (!priorities.includes(priority)) return failure('未知火力优先级。');
    tower.targetPriority = priority;
    const name = { first: '最接近出口', strong: '当前生命最多', weak: '当前生命最少' }[priority];
    return this.announce(success(`火力优先攻击${name}的敌人。`));
  }

  moveHero(x: number, y: number): ActionResult {
    if (this.finished) return failure('战斗已经结束。');
    const hero = this.state.allies.find(a => a.type === 'hero')!;
    if (hero.hp <= 0) return failure(`英雄将在 ${Math.ceil(hero.respawnTimer)} 秒后归来。`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return failure('请选择有效的位置。');
    const target = insideMap(x, y);
    this.disengage(hero);
    this.cancelAttackPose(hero);
    hero.targetX = target.x;
    hero.targetY = target.y;
    this.commandedMovement.add(hero.id);
    return this.announce(success('艾琳正在前往指定位置。'));
  }

  getMapEventStatus(): MapEventStatus | null {
    const definition = getMapEventDefinition(this.level.id, this.rulesVersion);
    if (!definition) return null;
    const event = this.state.mapEvent, hero = this.state.allies.find(ally => ally.type === 'hero')!;
    const affectedCount = this.state.enemies.filter(enemy => enemy.hp > 0 && distanceSquared(enemy, definition.areaCenter) <= definition.radius ** 2).length;
    let reason = '';
    if (this.state.phase !== 'battle') reason = '水闸只能在战斗期间启动。';
    else if (hero.hp <= 0) reason = '艾琳阵亡，暂时无法操作水闸。';
    else if ((event?.activeRemaining ?? 0) > 0) reason = '洪流正在持续。';
    else if ((event?.cooldownRemaining ?? 0) > 0) reason = `水闸冷却中：${Math.ceil(event!.cooldownRemaining)} 秒。`;
    else if (distanceSquared(hero, definition.position) > definition.triggerRadius ** 2) reason = '请让艾琳靠近水闸 100 范围内。';
    else if (!affectedCount) reason = '关口洪流范围内没有敌人。';
    return { id: definition.id, name: definition.name, position: { ...definition.position }, areaCenter: { ...definition.areaCenter },
      radius: definition.radius, triggerRadius: definition.triggerRadius, ready: !reason, reason, affectedCount,
      activeRemaining: event?.activeRemaining ?? 0, cooldownRemaining: event?.cooldownRemaining ?? 0 };
  }

  activateMapEvent(): ActionResult {
    const status = this.getMapEventStatus();
    if (!status) return failure('当前战场没有可操作的水闸。');
    if (!status.ready) return failure(status.reason);
    const definition = getMapEventDefinition(this.level.id, this.rulesVersion)!;
    const previous = this.state.mapEvent;
    this.state.mapEvent = { id: definition.id, activeRemaining: definition.duration, cooldownRemaining: definition.cooldown, activations: (previous?.activations ?? 0) + 1 };
    this.state.report!.mapActivations++;
    this.effect('ring', definition.areaCenter, definition.duration, { radius: definition.radius, color: '#91d6d9', style: 'floodgate' });
    for (const enemy of this.state.enemies) if (enemy.hp > 0 && distanceSquared(enemy, definition.areaCenter) <= definition.radius ** 2) {
      this.applySlow(enemy, definition.slowAmount, .1, 'floodgate');
    }
    return this.announce(success('水闸开启！关口洪流持续 6 秒，敌人减速 55%。'));
  }

  castSkill(kind: SkillKind, x: number, y: number): ActionResult {
    if (this.state.phase !== 'battle') return failure('技能在战斗期间使用。');
    if (!Object.hasOwn(SKILLS, kind)) return failure('未知技能。');
    if (this.challenge === 'no-meteor' && kind === 'meteor') return failure('禁陨星挑战中不能使用陨星坠落。');
    if (this.state.skillCooldowns[kind] > 0) return failure(`技能冷却中：${Math.ceil(this.state.skillCooldowns[kind])} 秒。`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return failure('请选择有效的位置。');
    const point = insideMap(x, y);
    if (kind === 'meteor') {
      const targets = this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, point) <= 95 ** 2);
      if (!targets.length) return failure('陨星范围内没有敌人。');
      this.effect('meteor', point, 0.95, { color: '#ffbd69', style: 'meteor' });
      for (const enemy of targets) this.hitEnemy(enemy, 300, 'true', undefined, 'meteor');
    } else if (kind === 'reinforce') {
      const rally = this.nearestPathPoint(point);
      for (let i = 0; i < 2; i++) {
        const position = { x: rally.x + (i ? 11 : -11), y: rally.y + (i ? 7 : -7) };
        this.state.allies.push({ id: this.nextId++, type: 'reinforcement', ...position,
          hp: 185, maxHp: 185, damage: 20, armor: 0.25, speed: 120,
          attackTimer: 0.1, respawnTimer: 0, targetX: position.x, targetY: position.y,
          towerId: null, expiresAt: this.state.time + 24, engagedWith: null,
          attackAnimation: 0, hitAnimation: 0, facingX: -1, facingY: 0, attackVariant: 0 });
      }
      this.effect('ring', rally, 0.6, { color: '#9bd5a0' });
    } else if (kind === 'hero') {
      const hero = this.state.allies.find(a => a.type === 'hero')!;
      if (hero.hp <= 0) return failure('英雄阵亡，暂时无法使用技能。');
      const targets = this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, hero) <= 115 ** 2);
      if (!targets.length && hero.hp === hero.maxHp) return failure('英雄周围没有敌人，且生命已满。');
      const healed = Math.min(200, hero.maxHp - hero.hp);
      hero.hp += healed;
      const closest = targets.reduce<Enemy | undefined>((best, target) => !best || distanceSquared(target, hero) < distanceSquared(best, hero) ? target : best, undefined);
      this.animateAttack(hero, closest ?? { x: hero.x + (hero.facingX ?? -1), y: hero.y + (hero.facingY ?? 0) }, 0.56);
      this.effect('hero-burst', hero, 0.9, { color: '#c0e09b', sourceId: hero.id, style: 'hero' });
      if (healed > 0) this.effect('heal', hero, 0.7, { text: `+${Math.ceil(healed)}`, color: '#aadd88' });
      for (const enemy of targets) this.hitEnemy(enemy, 150, 'true', hero.id, 'hero');
    } else {
      const hero = this.state.allies.find(a => a.type === 'hero')!;
      if (hero.hp <= 0) return failure('英雄阵亡，暂时无法使用技能。');
      if (SKILLS[kind].range !== undefined && distanceSquared(hero, point) > SKILLS[kind].range! ** 2) {
        return failure(`目标超出艾琳的 ${SKILLS[kind].range} 施法距离。`);
      }
      if (kind === 'hero-dash') {
        const start = { x: hero.x, y: hero.y };
        const targets = this.state.enemies.filter(e => e.hp > 0 && segmentDistanceSquared(e, start, point) <= 48 ** 2);
        if (!targets.length) return failure('突袭路线附近没有敌人。');
        this.disengage(hero);
        this.cancelAttackPose(hero);
        this.animateAttack(hero, point, 0.65);
        this.effect('hero-dash', start, 0.65, { toX: point.x, toY: point.y, radius: 48, color: '#cdeefa', sourceId: hero.id, style: kind });
        hero.x = hero.targetX = point.x;
        hero.y = hero.targetY = point.y;
        this.commandedMovement.delete(hero.id);
        for (const enemy of targets) {
          this.interruptBoss(enemy);
          this.hitEnemy(enemy, 120, 'true', hero.id, kind);
        }
      } else if (kind === 'hero-roots') {
        const targets = this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, point) <= 105 ** 2);
        if (!targets.length) return failure('荆棘范围内没有敌人。');
        this.animateAttack(hero, point, 0.65);
        this.effect('roots', point, 6.5, { radius: 105, color: '#a9d77e', sourceId: hero.id, style: kind });
        for (const enemy of targets) {
          this.interruptBoss(enemy);
          this.hitEnemy(enemy, 55, 'magic', hero.id, kind);
          enemy.rootTimer = Math.max(enemy.rootTimer ?? 0, 2.5);
          this.rootFollowups.set(enemy.id, { amount: 0.55, duration: 4 });
        }
      } else if (kind === 'hero-oath') {
        const friends = this.state.allies.filter(a => a.hp > 0 && distanceSquared(a, hero) <= 165 ** 2);
        const wounded = friends.some(a => a.hp < a.maxHp);
        const enemiesNear = this.state.enemies.some(e => e.hp > 0 && distanceSquared(e, hero) <= 165 ** 2);
        const needsBuff = friends.some(a => (a.buffTimer ?? 0) <= 0) && (enemiesNear || friends.some(a => a.engagedWith !== null));
        if (!wounded && !needsBuff) return failure('盟约范围内没有伤员，也没有需要战斗增益的友军。');
        this.animateAttack(hero, { x: hero.x, y: hero.y - 1 }, 0.65);
        this.effect('oath', hero, 8, { radius: 165, color: '#e2dfaa', sourceId: hero.id, style: kind });
        for (const friend of friends) {
          this.healAlly(friend, 160, hero.id, kind);
          friend.buffTimer = 8;
          friend.damageMultiplier = 1.35;
          friend.armorBonus = 0.20;
        }
      }
    }
    this.state.skillCooldowns[kind] = SKILLS[kind].cooldown * this.upgrades.skillCooldownMultiplier;
    this.state.stats.skillsUsed++;
    this.clearDeadEnemies();
    return this.announce(success(`${SKILLS[kind].name}已释放。`));
  }

  startWave(): ActionResult {
    if (this.state.phase !== 'preparation' && this.state.phase !== 'intermission') return failure('当前无法开始下一波。');
    if (this.state.wave >= this.level.waves.length) return failure('所有波次已经完成。');
    const wave = this.level.waves[this.state.wave];
    this.state.wave++;
    this.state.waveElapsed = 0;
    this.state.phase = 'battle';
    this.ensureReportWave();
    this.state.spawnQueue = waveQueue(this.level, this.state.wave - 1, this.difficulty);
    return this.announce(success(`第 ${this.state.wave} 波 · ${wave.name}`));
  }

  getEarlyWaveOffer(): EarlyWaveOffer {
    const unavailable = (reason: string): EarlyWaveOffer => ({ available: false, gold: 0, cooldownReduction: 0, reason });
    if (this.state.phase !== 'battle') return unavailable('仅战斗期间可以抢先召敌。');
    if (this.state.wave >= this.level.waves.length) return unavailable('这已经是最后一波。');
    if (this.state.spawnQueue.length) return unavailable('本波仍有敌人尚未进场。');
    const remaining = this.state.enemies.filter(enemy => enemy.hp > 0);
    if (!remaining.length) return unavailable('本波已清场，请领取补给后开始下一波。');
    // Use deployment walking speed; roots, slowing and blocking cannot inflate the reward.
    const seconds = Math.max(...remaining.map(enemy => Math.max(0, this.pathLength - enemy.progress) / (ENEMY_STATS[enemy.kind].speed * DIFFICULTY_MULTIPLIERS[this.difficulty].speed)));
    return { available: true, gold: Math.min(25, Math.floor(seconds * 0.5)), cooldownReduction: 4 };
  }

  get canCallEarlyWave(): boolean { return this.getEarlyWaveOffer().available; }
  get earlyWaveBonus(): number { return this.getEarlyWaveOffer().gold; }

  callEarlyWave(): ActionResult {
    const offer = this.getEarlyWaveOffer();
    if (!offer.available) return failure(offer.reason!);
    this.closeReportWave();
    // A battle's active wave has never received its supply. Advancing immediately
    // keeps every wave's supply payable exactly once even when enemies overlap.
    const supply = this.awardWaveSupply();
    this.state.gold += offer.gold;
    this.state.stats.goldEarned += offer.gold;
    this.state.stats.earlyWavesCalled = (this.state.stats.earlyWavesCalled ?? 0) + 1;
    this.state.stats.earlyWaveGold = (this.state.stats.earlyWaveGold ?? 0) + offer.gold;
    for (const kind of Object.keys(SKILLS) as SkillKind[]) {
      this.state.skillCooldowns[kind] = Math.max(0, this.state.skillCooldowns[kind] - offer.cooldownReduction);
    }
    this.state.wave++;
    this.ensureReportWave();
    this.observeReportWave();
    this.state.waveElapsed = 0;
    this.state.spawnQueue = waveQueue(this.level, this.state.wave - 1, this.difficulty);
    return this.announce(success(`第 ${this.state.wave} 波提前进场！补给 +${supply}、冒险奖金 +${offer.gold} 金币，技能冷却减少 ${offer.cooldownReduction} 秒。`));
  }

  private awardWaveSupply(): number {
    const bonus = 25 + this.state.wave * 5;
    this.state.gold += bonus;
    this.state.stats.goldEarned += bonus;
    return bonus;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Small substeps preserve blocking and attacks even when the tab has a slow frame.
    let remaining = dt;
    while (remaining > 0.0000001) {
      const step = Math.min(remaining, 1 / 30);
      this.tick(step);
      remaining -= step;
    }
  }

  private tick(dt: number): void {
    this.state.time += dt;
    for (const effect of this.state.effects) effect.life -= dt;
    this.state.effects = this.state.effects.filter(e => e.life > 0);
    for (const entity of [...this.state.allies, ...this.state.enemies, ...this.state.towers]) {
      entity.attackAnimation = Math.max(0, (entity.attackAnimation ?? 0) - dt);
      entity.hitAnimation = Math.max(0, (entity.hitAnimation ?? 0) - dt);
    }
    if (this.finished) return;
    for (const kind of Object.keys(SKILLS) as SkillKind[]) this.state.skillCooldowns[kind] = Math.max(0, this.state.skillCooldowns[kind] - dt);
    this.updateStatuses(dt);
    if (this.state.phase === 'battle') {
      this.state.waveElapsed += dt;
      while (this.state.spawnQueue.length && this.state.spawnQueue[0].time <= this.state.waveElapsed + 1e-8) {
        this.spawnEnemy(this.state.spawnQueue.shift()!.kind);
      }
    }
    this.observeReportWave();
    this.updateAllies(dt);
    this.updateTowers(dt);
    this.updateEnemies(dt);
    this.observeReportWave();
    this.clearDeadEnemies();
    if (this.state.lives <= 0) {
      this.state.lives = 0;
      this.state.phase = 'defeat';
      this.closeReportWave();
      this.cancelActiveMapEvent();
      for (const enemy of this.state.enemies) if (enemy.bossCast) {
        enemy.bossCast = undefined;
        enemy.attackAnimation = 0;
        this.removeBossWarning(enemy.id);
      }
      this.state.message = `防线失守。调整布局，再守一次${this.level.name}！`;
    } else if (this.state.phase === 'battle' && !this.state.spawnQueue.length && !this.state.enemies.length) {
      const bonus = this.awardWaveSupply();
      this.state.phase = this.state.wave === this.level.waves.length ? 'victory' : 'intermission';
      this.closeReportWave();
      if (this.state.phase === 'victory') this.cancelActiveMapEvent();
      this.state.message = this.state.phase === 'victory' ? `${this.level.name}守住了！本关敌军已被击退。` : `第 ${this.state.wave} 波结束，获得 ${bonus} 金币补给。`;
    }
  }

  private makeSoldier(tower: Tower, index: number): Ally {
    const stats = getTowerCombatStats(tower);
    const fortify = tower.abilities['barracks-fortify'] ?? 0;
    const hp = stats.soldierHp! * this.upgrades.soldierHpMultiplier + fortify * 55;
    const soldier: Ally = { id: this.nextId++, type: 'soldier', x: tower.x + (index - 1) * 10, y: tower.y + 20,
      hp, maxHp: hp, damage: stats.soldierDamage!, armor: stats.soldierArmor! + fortify * 0.08,
      speed: 100, attackTimer: 0, respawnTimer: 0, targetX: tower.rallyX + (index - 1) * 17,
      targetY: tower.rallyY + (index === 1 ? 8 : -5), towerId: tower.id, engagedWith: null,
      attackAnimation: 0, hitAnimation: 0, facingX: 0, facingY: -1, attackVariant: 0,
      buffTimer: 0, damageMultiplier: 1, armorBonus: 0 };
    this.commandedMovement.add(soldier.id);
    return soldier;
  }

  private syncSoldiers(tower: Tower, healing: 'ratio' | 'increase'): void {
    const stats = getTowerCombatStats(tower), fortify = tower.abilities['barracks-fortify'] ?? 0;
    const hp = stats.soldierHp! * this.upgrades.soldierHpMultiplier + fortify * 55;
    for (const soldier of this.state.allies.filter(a => a.type === 'soldier' && a.towerId === tower.id)) {
      const previousHp = soldier.maxHp;
      if (soldier.hp > 0) soldier.hp = healing === 'ratio' ? hp * soldier.hp / previousHp : Math.min(hp, soldier.hp + hp - previousHp);
      soldier.maxHp = hp;
      soldier.damage = stats.soldierDamage!;
      soldier.armor = stats.soldierArmor! + fortify * 0.08;
    }
  }

  private spawnEnemy(kind: EnemyKind): void {
    const stats = ENEMY_STATS[kind];
    const hp = stats.hp * DIFFICULTY_MULTIPLIERS[this.difficulty].hp;
    const enemy: Enemy = { id: this.nextId++, kind, ...this.samplePath(0), hp, maxHp: hp,
      progress: 0, attackTimer: 0.5, blockedBy: null, slowTimer: 0, hitTimer: 0,
      attackAnimation: 0, hitAnimation: 0, facingX: 1, facingY: 0, attackVariant: 0, slowAmount: 0, rootTimer: 0 };
    this.state.enemies.push(enemy);
    if (this.rulesVersion === 2 && bossSpec(enemy)) enemy.bossCooldown = bossSpec(enemy)!.initial;
    if (kind === 'shaman') this.shamanTimers.set(enemy.id, 3);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.state.towers) {
      for (const kind of Object.keys(tower.abilityTimers) as TowerAbilityKind[]) {
        tower.abilityTimers[kind] = Math.max(0, tower.abilityTimers[kind]! - dt);
      }
      if (this.state.phase === 'battle') this.updateTowerAbilities(tower);
      if (tower.kind === 'barracks') continue;
      tower.attackTimer = Math.max(0, tower.attackTimer - dt);
      if (tower.attackTimer > 0) continue;
      const stats = getTowerCombatStats(tower);
      const target = this.towerTarget(tower, stats.range);
      if (!target) continue;
      if (tower.kind === 'cannon') {
        let damage = stats.damage, style = 'cannon';
        const rank = tower.abilities['cannon-pierce'] ?? 0;
        if (rank && this.random() < (rank === 1 ? 0.22 : 0.32)) {
          damage *= rank === 1 ? 2.5 : 3.5;
          style = 'cannon-pierce';
        }
        this.animateAttack(tower, target, 0.45);
        this.effect('shell', { x: tower.x, y: tower.y - 28 }, 0.45,
          { toX: target.x, toY: target.y, sourceId: tower.id, targetId: target.id, style });
        const radius = stats.splashRadius ?? [48, 58, 68][tower.level - 1];
        this.effect('explosion', target, 1.03, { radius, color: '#ffb566', sourceId: tower.id, style });
        for (const enemy of this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, target) <= radius ** 2)) {
          if (stats.armorBreak) {
            enemy.armorBreakTimer = Math.max(enemy.armorBreakTimer ?? 0, stats.breakDuration ?? 3);
            enemy.armorBreakAmount = Math.max(enemy.armorBreakAmount ?? 0, stats.armorBreak);
          }
          if (stats.magicBreak) {
            enemy.magicBreakTimer = Math.max(enemy.magicBreakTimer ?? 0, stats.breakDuration ?? 3);
            enemy.magicBreakAmount = Math.max(enemy.magicBreakAmount ?? 0, stats.magicBreak);
          }
          if (style === 'cannon-pierce') {
            enemy.armorBreakTimer = Math.max(enemy.armorBreakTimer ?? 0, rank === 1 ? 3 : 5);
            enemy.armorBreakAmount = Math.max(enemy.armorBreakAmount ?? 0, rank === 1 ? 0.2 : 0.35);
          }
          this.hitEnemy(enemy, damage, 'physical', tower.id, style);
        }
        tower.attackTimer = stats.rate;
        continue;
      }
      let damage = stats.damage;
      let style: string = tower.kind;
      const critical = tower.abilities[tower.kind === 'arrow' ? 'arrow-deadeye' : 'mage-overload'] ?? 0;
      if (critical > 0 && this.random() < (tower.kind === 'arrow' ? [0, 0.20, 0.30][critical] : [0, 0.18, 0.28][critical])) {
        damage *= tower.kind === 'arrow' ? [0, 3, 4][critical] : [0, 2.5, 3.5][critical];
        style = tower.kind === 'arrow' ? 'arrow-deadeye' : 'mage-overload';
        this.effect('text', { x: target.x, y: target.y - 46 }, 0.7, { text: tower.kind === 'arrow' ? '鹰眼狙杀!' : '奥术过载!', color: '#f6dd88' });
      } else if (tower.kind === 'arrow' && tower.abilities['arrow-snare']) style = 'arrow-snare';
      this.animateAttack(tower, target, 0.32);
      this.effect(tower.kind === 'arrow' ? 'arrow' : 'bolt', { x: tower.x, y: tower.y - 30 }, tower.kind === 'arrow' ? 0.2 : 0.32,
        { toX: target.x, toY: target.y, color: tower.kind === 'arrow' ? '#f2d191' : '#bdadff', sourceId: tower.id, targetId: target.id, style });
      this.hitEnemy(target, damage, stats.damageType, tower.id, style);
      if (tower.kind === 'mage') this.applySlow(target, stats.slowAmount ?? 0.35, stats.slowDuration ?? 0.85 + tower.level * 0.15, `mage:${tower.id}:${stats.slowAmount ?? 0.35}`);
      const snare = tower.abilities['arrow-snare'] ?? 0;
      if (snare) this.applySlow(target, snare === 1 ? 0.35 : 0.55, snare === 1 ? 2.5 : 3.5, `snare:${tower.id}`);
      tower.attackTimer = stats.rate;
    }
  }

  private updateTowerAbilities(tower: Tower): void {
    const stats = getTowerCombatStats(tower);
    const ready = (kind: TowerAbilityKind) => (tower.abilities[kind] ?? 0) > 0 && (tower.abilityTimers[kind] ?? 0) <= 0;
    for (const kind of ['cannon-cluster', 'cannon-quake'] as TowerAbilityKind[]) {
      if (!ready(kind)) continue;
      const target = this.towerTarget(tower, stats.range);
      if (!target) continue;
      const rank = tower.abilities[kind]!, cluster = kind === 'cannon-cluster';
      const radius = cluster ? 88 : 100;
      this.animateAttack(tower, target, 0.45);
      if (cluster) this.effect('shell', { x: tower.x, y: tower.y - 28 }, 0.45,
        { toX: target.x, toY: target.y, sourceId: tower.id, targetId: target.id, style: kind });
      this.effect(cluster ? 'explosion' : 'ring', target, cluster ? 1.18 : 0.85,
        { radius, sourceId: tower.id, style: kind, color: cluster ? '#ffd087' : '#d6bb92' });
      for (const enemy of this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, target) <= radius ** 2)) {
        this.hitEnemy(enemy, cluster ? rank === 1 ? 80 : 125 : rank === 1 ? 30 : 50, 'physical', tower.id, kind);
        if (!cluster) this.applySlow(enemy, rank === 1 ? 0.4 : 0.6, rank === 1 ? 3 : 4, `quake:${tower.id}`);
      }
      tower.abilityTimers[kind] = cluster ? rank === 1 ? 9 : 7 : rank === 1 ? 10 : 8;
    }
    if (ready('arrow-volley')) {
      const target = this.towerTarget(tower, stats.range);
      if (target) {
        const rank = tower.abilities['arrow-volley']!;
        const center = { x: target.x, y: target.y };
        const targets = this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, center) <= 70 ** 2);
        this.animateAttack(tower, target, 0.32);
        this.effect('ring', center, 0.6, { radius: 70, color: '#e7c681', sourceId: tower.id, style: 'arrow-volley' });
        for (const enemy of targets) {
          this.effect('arrow', { x: tower.x, y: tower.y - 30 }, 0.3,
            { toX: enemy.x, toY: enemy.y, sourceId: tower.id, targetId: enemy.id, style: 'arrow-volley', color: '#f4d789' });
          this.hitEnemy(enemy, rank === 1 ? 38 : 58, 'physical', tower.id, 'arrow-volley');
        }
        tower.abilityTimers['arrow-volley'] = rank === 1 ? 8 : 6;
      }
    }
    if (ready('mage-chain')) {
      const rank = tower.abilities['mage-chain']!;
      const candidates = this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, tower) <= stats.range ** 2);
      const first = this.towerTarget(tower, stats.range);
      if (first) {
        const targets: Enemy[] = [first];
        while (targets.length < (rank === 1 ? 3 : 4)) {
          const previous = targets.at(-1)!;
          const next = candidates.filter(e => !targets.includes(e)).sort((a, b) => distanceSquared(a, previous) - distanceSquared(b, previous) || a.id - b.id)[0];
          if (!next) break;
          targets.push(next);
        }
        this.animateAttack(tower, first, 0.32);
        this.effect('chain', { x: tower.x, y: tower.y - 30 }, 0.55,
          { points: [{ x: tower.x, y: tower.y - 30 }, ...targets.map(e => ({ x: e.x, y: e.y }))], sourceId: tower.id, style: 'mage-chain', color: '#b4d9ff' });
        for (const enemy of targets) this.hitEnemy(enemy, rank === 1 ? 85 : 125, 'magic', tower.id, 'mage-chain');
        tower.abilityTimers['mage-chain'] = rank === 1 ? 7 : 5;
      }
    }
    if (ready('mage-frost')) {
      const target = this.towerTarget(tower, stats.range);
      if (target) {
        const rank = tower.abilities['mage-frost']!;
        const duration = rank === 1 ? 3.5 : 4.5, amount = rank === 1 ? 0.50 : 0.65;
        const zone = { x: target.x, y: target.y, sourceId: tower.id, radius: 85, remaining: duration, amount };
        this.frostZones.push(zone);
        this.animateAttack(tower, target, 0.32);
        this.effect('frost-zone', zone, duration, { radius: 85, sourceId: tower.id, style: 'mage-frost', color: '#c2edfa' });
        for (const enemy of this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, zone) <= 85 ** 2)) {
          this.hitEnemy(enemy, rank === 1 ? 30 : 50, 'magic', tower.id, 'mage-frost');
          this.applySlow(enemy, amount, 0.1, `frost:${tower.id}`);
        }
        tower.abilityTimers['mage-frost'] = rank === 1 ? 9 : 7;
      }
    }
    if (ready('barracks-mend')) {
      const center = { x: tower.rallyX, y: tower.rallyY };
      const friends = this.state.allies.filter(a => a.hp > 0 && a.hp < a.maxHp && distanceSquared(a, center) <= 95 ** 2);
      if (friends.length) {
        const rank = tower.abilities['barracks-mend']!;
        this.effect('ring', center, 0.8, { radius: 95, sourceId: tower.id, style: 'barracks-mend', color: '#bbdf9d' });
        for (const friend of friends) this.healAlly(friend, rank === 1 ? 50 : 85, tower.id, 'barracks-mend');
        tower.abilityTimers['barracks-mend'] = rank === 1 ? 10 : 8;
      }
    }
  }

  private updateAllies(dt: number): void {
    for (const ally of this.state.allies) {
      if (ally.expiresAt !== undefined && this.state.time >= ally.expiresAt) {
        this.disengage(ally);
        ally.hp = 0;
        continue;
      }
      if (ally.hp <= 0) {
        if (ally.type === 'reinforcement') continue;
        ally.respawnTimer = Math.max(0, ally.respawnTimer - dt);
        if (ally.respawnTimer > 0) continue;
        const tower = this.state.towers.find(t => t.id === ally.towerId);
        if (ally.type === 'soldier' && !tower) continue;
        ally.hp = ally.maxHp;
        ally.x = tower?.x ?? this.level.heroSpawn.x;
        ally.y = tower ? tower.y + 20 : this.level.heroSpawn.y;
        ally.attackTimer = 0.3;
        ally.attackAnimation = 0;
        ally.hitAnimation = 0;
        this.commandedMovement.add(ally.id);
        this.effect('heal', ally, 0.6, { color: '#b5d391' });
      }
      ally.attackTimer = Math.max(0, ally.attackTimer - dt);
      let enemy = this.state.enemies.find(e => e.id === ally.engagedWith && e.hp > 0);
      if (!enemy || (enemy.blockedBy !== null && enemy.blockedBy !== ally.id)) {
        this.disengage(ally);
        enemy = undefined;
      }
      if (!enemy && !this.commandedMovement.has(ally.id)) {
        enemy = this.frontmostEnemy(ally, 33, true);
        if (enemy) {
          enemy.blockedBy = ally.id;
          ally.engagedWith = enemy.id;
        }
      }
      if (enemy) {
        if (distanceSquared(ally, enemy) > 25 ** 2) this.walk(ally, enemy, dt);
        if (ally.attackTimer <= 0 && distanceSquared(ally, enemy) <= 34 ** 2) {
          const style = ally.type === 'hero' ? 'hero' : 'soldier';
          this.animateAttack(ally, enemy, ally.type === 'hero' ? 0.56 : 0.4);
          this.hitEnemy(enemy, ally.damage * (ally.damageMultiplier ?? 1), 'physical', ally.id, style);
          this.effect('slash', ally, ally.type === 'hero' ? 0.56 : 0.4,
            { toX: enemy.x, toY: enemy.y, color: '#f7ddaa', sourceId: ally.id, targetId: enemy.id, style, attackVariant: ally.attackVariant });
          if (ally.type === 'soldier') {
            const tower = this.state.towers.find(t => t.id === ally.towerId);
            const rank = tower?.abilities['barracks-cleave'] ?? 0;
            if (rank) {
              const strikes = (this.soldierStrikes.get(ally.id) ?? 0) + 1;
              this.soldierStrikes.set(ally.id, strikes % 3);
              if (strikes === 3) {
                this.effect('ring', ally, 0.55, { radius: 48, color: '#e6dfac', sourceId: ally.id, style: 'barracks-cleave' });
                for (const foe of this.state.enemies.filter(e => e.hp > 0 && distanceSquared(e, ally) <= 48 ** 2)) {
                  this.hitEnemy(foe, (rank === 1 ? 22 : 36) * (ally.damageMultiplier ?? 1), 'physical', ally.id, 'barracks-cleave');
                }
              }
            }
          }
          ally.attackTimer = ally.type === 'hero' ? HERO_STATS.attackRate : ally.type === 'soldier'
            ? getTowerCombatStats(this.state.towers.find(t => t.id === ally.towerId)!).rate : 0.95;
        }
      } else {
        const target = { x: ally.targetX, y: ally.targetY };
        this.walk(ally, target, dt);
        if (distanceSquared(ally, target) <= 8 ** 2) this.commandedMovement.delete(ally.id);
        if (this.state.phase !== 'battle') ally.hp = Math.min(ally.maxHp, ally.hp + (ally.type === 'hero' ? 14 : 20) * dt);
      }
    }
    this.state.allies = this.state.allies.filter(a => a.type !== 'reinforcement' || a.hp > 0);
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);
      enemy.hitAnimation = enemy.hitTimer;
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      const stats = ENEMY_STATS[enemy.kind];
      let ally = this.state.allies.find(a => a.id === enemy.blockedBy && a.hp > 0);
      if (!ally || ally.engagedWith !== enemy.id) {
        enemy.blockedBy = null;
        ally = undefined;
      }
      if (this.updateBoss(enemy, dt)) continue;
      if (ally) {
        if (enemy.attackTimer <= 0) {
          this.animateAttack(enemy, ally, ENEMY_ATTACK_ANIMATION[enemy.kind]);
          ally.hp -= damageAfterResistance(stats.damage * DIFFICULTY_MULTIPLIERS[this.difficulty].damage, ally.armor + (ally.armorBonus ?? 0), 0, 'physical');
          if (enemy.kind === 'serpent' && ally.hp > 0) { ally.poisonTimer = 3; ally.poisonDamage = 4 * DIFFICULTY_MULTIPLIERS[this.difficulty].damage; }
          if (enemy.kind === 'juggernaut') {
            this.effect('ring', ally, 0.5, { radius: 50, style: 'juggernaut', color: '#ee9766', sourceId: enemy.id });
            for (const friend of this.state.allies.filter(a => a !== ally && a.hp > 0 && distanceSquared(a, ally!) <= 50 ** 2)) {
              this.damageAlly(friend, damageAfterResistance(22 * DIFFICULTY_MULTIPLIERS[this.difficulty].damage, friend.armor + (friend.armorBonus ?? 0), 0, 'physical'));
            }
          }
          ally.hitAnimation = 0.2;
          enemy.attackTimer = stats.attackRate;
          this.effect('slash', enemy, ENEMY_ATTACK_ANIMATION[enemy.kind], { toX: ally.x, toY: ally.y, color: '#e38a78', sourceId: enemy.id, targetId: ally.id, style: enemy.kind, attackVariant: enemy.attackVariant });
          this.effect('impact', ally, 0.24, { color: '#e38a78', sourceId: enemy.id, targetId: ally.id, style: enemy.kind });
          if (ally.hp <= 0) {
            ally.hp = 0;
            this.recordAllyDeath(ally);
            this.clearBuff(ally);
            ally.poisonTimer = 0; ally.poisonDamage = 0;
            this.soldierStrikes.delete(ally.id);
            ally.respawnTimer = ally.type === 'hero' ? HERO_STATS.respawnTime : 9;
            this.disengage(ally);
            this.effect('text', ally, 0.85, { text: ally.type === 'hero' ? '15 秒后归来' : '阵亡', color: '#f2a39a' });
          }
        }
      } else {
        const slow = (enemy.slowAmount ?? 0.35) * (enemy.kind === 'icewolf' ? 0.5 : 1);
        enemy.progress += stats.speed * DIFFICULTY_MULTIPLIERS[this.difficulty].speed * ((enemy.rootTimer ?? 0) > 0 ? 0 : enemy.slowTimer > 0 ? 1 - slow : 1) * dt;
        if (enemy.kind === 'bogling') enemy.hp = Math.min(enemy.maxHp, enemy.hp + 3 * dt);
        const position = this.samplePath(enemy.progress);
        this.face(enemy, position);
        Object.assign(enemy, position);
        if (enemy.progress >= this.pathLength) {
          this.recordLeak(enemy, Math.min(stats.lives, Math.max(0, this.state.lives)));
          this.state.lives -= stats.lives;
          // A leaked enemy leaves immediately and never awards kill gold.
          enemy.hp = -Infinity;
          this.effect('text', { x: MAP_WIDTH - 80, y: 500 }, 1.1, { text: `-${stats.lives} 生命`, color: '#ff9690' });
          continue;
        }
      }
      if (enemy.kind === 'shaman') {
        const timer = (this.shamanTimers.get(enemy.id) ?? 3) - dt;
        this.shamanTimers.set(enemy.id, timer > 0 ? timer : 3);
        if (timer <= 0) {
          for (const friend of this.state.enemies) {
            if (friend.hp <= 0 || friend.hp >= friend.maxHp || distanceSquared(friend, enemy) > 100 ** 2) continue;
            friend.hp = Math.min(friend.maxHp, friend.hp + 18);
            this.effect('heal', friend, 0.65, { color: '#c8a1ec' });
          }
        }
      }
    }
  }

  private frontmostEnemy(point: Point, range: number, unblockedOnly = false): Enemy | undefined {
    let target: Enemy | undefined;
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0 || (unblockedOnly && enemy.blockedBy !== null) || distanceSquared(enemy, point) > range ** 2) continue;
      if (!target || enemy.progress > target.progress) target = enemy;
    }
    return target;
  }

  /** Returns true while the telegraphed attack or its recovery owns this frame. */
  private updateBoss(enemy: Enemy, dt: number): boolean {
    const spec = bossSpec(enemy);
    if (this.rulesVersion !== 2 || !spec || this.state.phase !== 'battle') return false;
    enemy.bossCooldown = Math.max(0, (enemy.bossCooldown ?? spec.initial) - dt);
    enemy.bossRecover = Math.max(0, (enemy.bossRecover ?? 0) - dt);
    if (enemy.bossCast) {
      const cast = enemy.bossCast;
      cast.remaining = Math.max(0, cast.remaining - dt);
      if (cast.remaining > 1e-8) return true;
      this.removeBossWarning(enemy.id);
      enemy.bossCast = undefined;
      enemy.bossRecover = spec.recover;
      enemy.bossCooldown = spec.cooldown;
      enemy.attackTimer = ENEMY_STATS[enemy.kind].attackRate;
      this.animateAttack(enemy, cast, ENEMY_ATTACK_ANIMATION[enemy.kind]);
      this.effect('ring', cast, 0.85, { radius: cast.radius, sourceId: enemy.id, style: 'boss-slam', color: '#f28d66' });
      for (const ally of this.state.allies.filter(a => a.hp > 0 && distanceSquared(a, cast) <= cast.radius ** 2)) {
        this.damageAlly(ally, damageAfterResistance(spec.damage * DIFFICULTY_MULTIPLIERS[this.difficulty].damage, ally.armor + (ally.armorBonus ?? 0), 0, 'physical'));
        this.effect('impact', ally, 0.35, { sourceId: enemy.id, targetId: ally.id, style: 'boss-slam', color: '#f28d66' });
      }
      return true;
    }
    if (enemy.bossRecover > 1e-8) return true;
    if (enemy.bossCooldown > 1e-8 || (enemy.rootTimer ?? 0) > 0) return false;
    const target = this.state.allies.filter(a => a.hp > 0 && distanceSquared(a, enemy) <= spec.engageRange ** 2)
      .sort((a, b) => distanceSquared(a, enemy) - distanceSquared(b, enemy) || a.id - b.id)[0];
    if (!target) return false;
    enemy.bossCast = { kind: spec.kind, x: target.x, y: target.y, radius: spec.radius, remaining: spec.duration, duration: spec.duration };
    this.face(enemy, target, true);
    enemy.attackAnimation = spec.duration;
    this.effect('boss-warning', target, spec.duration, { radius: spec.radius, sourceId: enemy.id, style: spec.kind, color: '#ef896d' });
    return true;
  }

  private removeBossWarning(sourceId: number): void {
    this.state.effects = this.state.effects.filter(effect => effect.type !== 'boss-warning' || effect.sourceId !== sourceId);
  }

  private interruptBoss(enemy: Enemy): void {
    if (!enemy.bossCast) return;
    this.state.report!.hero.bossInterrupts++;
    const cast = enemy.bossCast, spec = bossSpec(enemy)!;
    enemy.bossCast = undefined;
    enemy.bossCooldown = spec.cooldown * 0.6;
    enemy.bossRecover = 0.6;
    enemy.attackAnimation = 0.3;
    enemy.attackTimer = Math.max(enemy.attackTimer, 0.6);
    this.removeBossWarning(enemy.id);
    this.effect('ring', cast, 0.65, { radius: cast.radius, sourceId: enemy.id, style: 'boss-interrupted', color: '#b6e9de' });
    this.effect('text', { x: enemy.x, y: enemy.y - 50 }, 0.85, { text: '重击打断!', color: '#b6e9de' });
  }

  private towerTarget(tower: Tower, range: number): Enemy | undefined {
    const priority = tower.targetPriority ?? 'first';
    const candidates = this.state.enemies.filter(enemy => enemy.hp > 0 && distanceSquared(enemy, tower) <= range ** 2);
    return candidates.sort((a, b) => (priority === 'strong' ? b.hp - a.hp : priority === 'weak' ? a.hp - b.hp : 0)
      || b.progress - a.progress || a.id - b.id)[0];
  }

  private hitEnemy(enemy: Enemy, amount: number, type: 'physical' | 'magic' | 'true', sourceId?: number, style?: string): void {
    if (enemy.hp <= 0) return;
    const sourceTower = this.state.towers.find(tower => tower.id === sourceId);
    if (sourceTower && sourceTower.kind !== 'barracks') amount *= this.upgrades.rangedDamageMultiplier;
    const stats = ENEMY_STATS[enemy.kind];
    const damage = damageAfterResistance(amount, stats.armor - ((enemy.armorBreakTimer ?? 0) > 0 ? enemy.armorBreakAmount ?? 0 : 0), stats.magicResist - ((enemy.magicBreakTimer ?? 0) > 0 ? enemy.magicBreakAmount ?? 0 : 0), type);
    const actualDamage = Math.min(enemy.hp, damage);
    this.state.stats.damageDealt += actualDamage;
    enemy.hp = Math.max(0, enemy.hp - damage);
    this.recordDamage(actualDamage, enemy.hp === 0, sourceId);
    enemy.hitTimer = 0.15;
    enemy.hitAnimation = 0.15;
    if (damage > 0) this.effect('impact', enemy, type === 'true' ? 0.35 : 0.24,
      { color: type === 'magic' ? '#bdadff' : type === 'true' ? '#ffbd69' : '#f7ddaa', sourceId, targetId: enemy.id, style });
    this.effect('text', { x: enemy.x, y: enemy.y - 24 }, 0.55, { text: `${Math.round(damage)}`, color: type === 'magic' ? '#dcc9ff' : type === 'true' ? '#ffbb81' : '#eee1ae' });
  }

  private clearDeadEnemies(): void {
    for (const enemy of this.state.enemies) {
      if (enemy.hp > 0) continue;
      const ally = this.state.allies.find(a => a.id === enemy.blockedBy);
      if (ally) this.disengage(ally);
      this.shamanTimers.delete(enemy.id);
      this.slowEffects.delete(enemy.id);
      this.rootFollowups.delete(enemy.id);
      this.removeBossWarning(enemy.id);
      if (enemy.hp !== -Infinity) {
        if (enemy.kind === 'imp') {
          this.effect('explosion', enemy, 0.6, { radius: 44, style: 'imp', color: '#ee9662', sourceId: enemy.id });
          for (const friend of this.state.allies.filter(a => a.hp > 0 && distanceSquared(a, enemy) <= 44 ** 2)) this.damageAlly(friend, 24 * DIFFICULTY_MULTIPLIERS[this.difficulty].damage);
        }
        const gold = ENEMY_STATS[enemy.kind].gold;
        this.state.gold += gold;
        this.state.kills++;
        this.state.stats.goldEarned += gold;
        this.effect('text', enemy, 0.85, { text: `+${gold}`, color: '#f5cf77' });
      }
    }
    this.state.enemies = this.state.enemies.filter(e => e.hp > 0);
  }

  private disengage(ally: Ally): void {
    for (const enemy of this.state.enemies) if (enemy.blockedBy === ally.id) enemy.blockedBy = null;
    ally.engagedWith = null;
  }

  private updateStatuses(dt: number): void {
    const event = this.state.mapEvent, definition = getMapEventDefinition(this.level.id, this.rulesVersion);
    if (event && definition) {
      event.activeRemaining = Math.max(0, event.activeRemaining - dt);
      event.cooldownRemaining = Math.max(0, event.cooldownRemaining - dt);
      if (event.activeRemaining < 1e-8) event.activeRemaining = 0;
      if (event.cooldownRemaining < 1e-8) event.cooldownRemaining = 0;
      if (!event.activeRemaining) this.state.effects = this.state.effects.filter(effect => effect.style !== 'floodgate');
      else for (const enemy of this.state.enemies) if (enemy.hp > 0 && distanceSquared(enemy, definition.areaCenter) <= definition.radius ** 2) {
        this.applySlow(enemy, definition.slowAmount, .1, 'floodgate');
      }
    }
    for (const ally of this.state.allies) {
      if (ally.hp > 0 && (ally.poisonTimer ?? 0) > 0) {
        this.damageAlly(ally, (ally.poisonDamage ?? 4) * Math.min(dt, ally.poisonTimer!));
        ally.poisonTimer = Math.max(0, (ally.poisonTimer ?? 0) - dt);
        if (!ally.poisonTimer) ally.poisonDamage = 0;
      }
      ally.buffTimer = Math.max(0, (ally.buffTimer ?? 0) - dt);
      if (ally.buffTimer === 0 || ally.hp <= 0) this.clearBuff(ally);
    }
    for (const enemy of this.state.enemies) {
      enemy.armorBreakTimer = Math.max(0, (enemy.armorBreakTimer ?? 0) - dt);
      enemy.magicBreakTimer = Math.max(0, (enemy.magicBreakTimer ?? 0) - dt);
      if (!enemy.magicBreakTimer) enemy.magicBreakAmount = 0;
      if (!enemy.armorBreakTimer) enemy.armorBreakAmount = 0;
      let slows = this.slowEffects.get(enemy.id);
      // Preserve externally supplied/legacy slow states without weakening them.
      if (!slows && enemy.slowTimer > 0) {
        this.applySlow(enemy, enemy.slowAmount ?? 0.35, enemy.slowTimer, 'legacy');
        slows = this.slowEffects.get(enemy.id);
      }
      if (slows) {
        for (const [source, slow] of slows) {
          slow.remaining = Math.max(0, slow.remaining - dt);
          if (slow.remaining <= 1e-8) slows.delete(source);
        }
        this.syncSlow(enemy, slows);
      } else { enemy.slowTimer = 0; enemy.slowAmount = 0; }
      const previousRoot = enemy.rootTimer ?? 0;
      enemy.rootTimer = Math.max(0, previousRoot - dt);
      if (enemy.rootTimer < 1e-8) enemy.rootTimer = 0;
      if (previousRoot > 0 && enemy.rootTimer === 0) {
        const followup = this.rootFollowups.get(enemy.id);
        if (followup) this.applySlow(enemy, followup.amount, followup.duration, 'hero-roots');
        this.rootFollowups.delete(enemy.id);
      }
    }
    for (const zone of this.frostZones) zone.remaining -= dt;
    this.frostZones = this.frostZones.filter(zone => zone.remaining > 1e-8);
    for (const zone of this.frostZones) {
      for (const enemy of this.state.enemies) {
        if (enemy.hp > 0 && distanceSquared(enemy, zone) <= zone.radius ** 2) this.applySlow(enemy, zone.amount, 0.1, `frost:${zone.sourceId}`);
      }
    }
  }

  private applySlow(enemy: Enemy, amount: number, duration: number, source: string): void {
    if (enemy.hp <= 0) return;
    let slows = this.slowEffects.get(enemy.id);
    if (!slows) { slows = new Map(); this.slowEffects.set(enemy.id, slows); }
    const previous = slows.get(source);
    slows.set(source, { amount: Math.max(amount, previous?.amount ?? 0), remaining: Math.max(duration, previous?.remaining ?? 0) });
    this.syncSlow(enemy, slows);
  }

  private syncSlow(enemy: Enemy, slows: Map<string, { amount: number; remaining: number }>): void {
    let amount = 0, remaining = 0;
    for (const slow of slows.values()) {
      if (slow.amount > amount) { amount = slow.amount; remaining = slow.remaining; }
      else if (slow.amount === amount) remaining = Math.max(remaining, slow.remaining);
    }
    enemy.slowAmount = amount;
    enemy.slowTimer = remaining;
    if (!slows.size) this.slowEffects.delete(enemy.id);
  }

  private clearBuff(ally: Ally): void {
    ally.buffTimer = 0;
    ally.damageMultiplier = 1;
    ally.armorBonus = 0;
  }

  private damageAlly(ally: Ally, amount: number): void {
    if (ally.hp <= 0) return;
    ally.hp = Math.max(0, ally.hp - amount);
    ally.hitAnimation = 0.2;
    if (ally.hp > 0) return;
    this.recordAllyDeath(ally);
    this.clearBuff(ally);
    ally.poisonTimer = 0; ally.poisonDamage = 0;
    this.soldierStrikes.delete(ally.id);
    ally.respawnTimer = ally.type === 'hero' ? HERO_STATS.respawnTime : 9;
    this.disengage(ally);
    this.effect('text', ally, 0.85, { text: ally.type === 'hero' ? '15 秒后归来' : '阵亡', color: '#f2a39a' });
  }

  private ensureReportWave(): WaveBattleReport | undefined {
    if (this.state.wave < 1) return undefined;
    const report = this.state.report!;
    let wave = report.waves.find(entry => entry.wave === this.state.wave);
    if (!wave) {
      wave = { wave: this.state.wave, startedAt: this.state.time, peakEnemies: 0, furthestProgress: 0, livesLost: 0, damage: 0, kills: 0 };
      report.waves.push(wave);
    }
    return wave;
  }

  private observeReportWave(): void {
    if (this.state.phase !== 'battle') return;
    const wave = this.ensureReportWave();
    if (!wave) return;
    const enemies = this.state.enemies.filter(enemy => enemy.hp > 0);
    wave.peakEnemies = Math.max(wave.peakEnemies, enemies.length);
    for (const enemy of enemies) wave.furthestProgress = Math.max(wave.furthestProgress, Math.min(this.pathLength, enemy.progress));
  }

  private closeReportWave(): void {
    const wave = this.state.report!.waves.find(entry => entry.wave === this.state.wave);
    if (wave && wave.endedAt === undefined) wave.endedAt = this.state.time;
  }

  private recordDamage(damage: number, killed: boolean, sourceId?: number): void {
    const report = this.state.report!;
    report.totalDamage += damage;
    if (killed) report.totalKills++;
    const source = this.state.allies.find(ally => ally.id === sourceId);
    const towerId = source?.type === 'soldier' ? source.towerId : this.state.towers.find(tower => tower.id === sourceId)?.id;
    const tower = report.towers.find(entry => entry.id === towerId);
    const owner = source?.type === 'hero' ? report.hero : tower ?? report.support;
    owner.damage += damage;
    if (killed) owner.kills++;
    const wave = this.state.phase === 'battle' ? this.ensureReportWave() : undefined;
    if (wave) { wave.damage += damage; if (killed) wave.kills++; }
  }

  private recordAllyDeath(ally: Ally): void {
    if (ally.type === 'hero') this.state.report!.hero.deaths++;
    else if (ally.type === 'soldier') this.state.report!.soldierDeaths++;
  }

  private recordLeak(enemy: Enemy, lives: number): void {
    const report = this.state.report!, previous = report.leaks[enemy.kind] ?? { count: 0, lives: 0 };
    report.leaks[enemy.kind] = { count: previous.count + 1, lives: previous.lives + lives };
    const wave = this.ensureReportWave();
    if (wave) { wave.livesLost += lives; wave.furthestProgress = this.pathLength; }
  }

  private cancelActiveMapEvent(): void {
    if (this.state.mapEvent) this.state.mapEvent.activeRemaining = 0;
    this.state.effects = this.state.effects.filter(effect => effect.style !== 'floodgate');
  }

  private healAlly(ally: Ally, amount: number, sourceId: number, style: string): void {
    const healed = Math.min(amount, ally.maxHp - ally.hp);
    if (ally.hp <= 0 || healed <= 0) return;
    ally.hp += healed;
    this.effect('heal', ally, 0.8, { text: `+${Math.ceil(healed)}`, color: '#c9e9a5', sourceId, targetId: ally.id, style });
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private walk(ally: Ally, target: Point, dt: number): void {
    const distance = Math.sqrt(distanceSquared(ally, target));
    if (distance <= 0.01) return;
    this.face(ally, target);
    const ratio = Math.min(1, ally.speed * dt / distance);
    ally.x += (target.x - ally.x) * ratio;
    ally.y += (target.y - ally.y) * ratio;
  }

  private face(entity: Point & CombatPose, target: Point, force = false): void {
    // Recover from a swing in its attack direction, even if the target has died.
    if (!force && (entity.attackAnimation ?? 0) > 0) return;
    const dx = target.x - entity.x, dy = target.y - entity.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001) return;
    entity.facingX = dx / distance;
    entity.facingY = dy / distance;
  }

  private animateAttack(entity: Point & CombatPose, target: Point, duration: number): void {
    this.face(entity, target, true);
    entity.attackAnimation = duration;
    entity.attackVariant = (entity.attackVariant ?? 0) + 1;
  }

  private cancelAttackPose(entity: Ally): void {
    entity.attackAnimation = 0;
    this.state.effects = this.state.effects.filter(effect => effect.type !== 'slash' || effect.sourceId !== entity.id);
  }

  private effect(type: Effect['type'], point: Point, life: number, details: Partial<Effect> = {}): void {
    this.state.effects.push({ id: this.nextId++, type, x: point.x, y: point.y, life, maxLife: life, ...details });
  }

  private announce(result: ActionResult): ActionResult {
    this.state.message = result.message;
    return result;
  }
}

function validSave(input: unknown): input is GameSave {
  const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const number = (value: unknown, max = 1e9): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  const integer = (value: unknown, max = 1e9): value is number => number(value, max) && Number.isInteger(value);
  const text = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length <= max;
  const array = (value: unknown, max: number): value is any[] => Array.isArray(value) && value.length <= max;
  const point = (value: unknown): value is Point & Record<string, any> => object(value) && typeof value.x === 'number' && typeof value.y === 'number'
    && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= -100 && value.x <= MAP_WIDTH + 100 && value.y >= 0 && value.y <= MAP_HEIGHT;
  const optionalNumber = (value: unknown, max = 1e9) => value === undefined || number(value, max);
  const knownEnemy = (value: unknown): value is EnemyKind => typeof value === 'string' && Object.hasOwn(ENEMY_STATS, value);
  const towerKinds = ['arrow', 'mage', 'barracks', 'cannon'];
  const effects = ['arrow', 'bolt', 'slash', 'meteor', 'ring', 'heal', 'text', 'hero-burst', 'impact', 'chain', 'frost-zone', 'hero-dash', 'roots', 'oath', 'shell', 'explosion', 'boss-warning'];
  const pose = (entity: Record<string, any>) => optionalNumber(entity.attackAnimation, 3) && optionalNumber(entity.hitAnimation, 2)
    && optionalNumber(entity.attackVariant, 1e7) && (entity.facingX === undefined || typeof entity.facingX === 'number' && Number.isFinite(entity.facingX) && Math.abs(entity.facingX) <= 1.001)
    && (entity.facingY === undefined || typeof entity.facingY === 'number' && Number.isFinite(entity.facingY) && Math.abs(entity.facingY) <= 1.001);
  if (!object(input) || input.version !== 1 || !LEVELS.some(level => level.id === input.levelId) || !integer(input.seed, 0xffffffff)) return false;
  if (input.difficulty !== undefined && !isDifficulty(input.difficulty)) return false;
  if (input.upgrades !== undefined && !validUpgrades(input.upgrades)) return false;
  if (input.rulesVersion !== undefined && input.rulesVersion !== 1 && input.rulesVersion !== 2) return false;
  if (input.challenge !== undefined && !challengeModes.includes(input.challenge)) return false;
  const challenge: ChallengeMode = input.challenge ?? 'standard';
  const rulesVersion: 1 | 2 = input.rulesVersion ?? 1;
  const difficulty: Difficulty = input.difficulty ?? 'normal';
  const upgrades: BattleUpgrades = input.upgrades ?? deriveBattleUpgrades();
  const level = getLevelForRules(input.levelId, rulesVersion), state = input.state, runtime = input.runtime;
  if (!object(state) || !object(runtime) || !['preparation', 'battle', 'intermission', 'victory', 'defeat'].includes(state.phase)
    || !number(state.time) || !number(state.waveElapsed) || state.waveElapsed > state.time + 1e-6 || !integer(state.gold, 1e7)
    || !integer(state.lives, level.lives) || !integer(state.wave, level.waves.length) || !integer(state.kills, 1e6) || !text(state.message, 500)
    || !array(state.towers, level.slots.length) || !array(state.enemies, 600) || !array(state.allies, 100)
    || !array(state.effects, 5000) || !array(state.spawnQueue, 600) || !object(state.skillCooldowns) || !object(state.stats)) return false;
  if (challenge === 'four-towers' && state.towers.length > 4 || challenge === 'no-meteor' && state.skillCooldowns.meteor !== 0) return false;
  const mapEventDefinition = getMapEventDefinition(level.id, rulesVersion);
  if (state.mapEvent !== undefined) {
    const event = state.mapEvent;
    if (!mapEventDefinition || !object(event) || event.id !== mapEventDefinition.id || !number(event.activeRemaining, mapEventDefinition.duration)
      || !number(event.cooldownRemaining, mapEventDefinition.cooldown) || !integer(event.activations, 1e7)
      || (!event.activations && (event.activeRemaining > 0 || event.cooldownRemaining > 0))
      || event.activeRemaining > 0 && (['preparation', 'victory', 'defeat'].includes(state.phase)
        || Math.abs(event.cooldownRemaining - event.activeRemaining - (mapEventDefinition.cooldown - mapEventDefinition.duration)) > .00001)) return false;
  }
  if (state.phase === 'preparation' && (state.wave !== 0 || state.enemies.length || state.spawnQueue.length)) return false;
  if (state.phase === 'intermission' && (!state.wave || state.wave >= level.waves.length || state.enemies.length || state.spawnQueue.length)) return false;
  if (state.phase === 'victory' && (state.wave !== level.waves.length || state.enemies.length || state.spawnQueue.length || !state.lives)) return false;
  if (state.phase === 'battle' && (!state.wave || !state.lives)) return false;
  if (state.phase === 'defeat' && state.lives !== 0 || state.phase !== 'defeat' && state.lives === 0) return false;
  if (Object.keys(state.skillCooldowns).length !== Object.keys(SKILLS).length
    || !Object.entries(SKILLS).every(([kind, spec]) => number(state.skillCooldowns[kind], spec.cooldown * upgrades.skillCooldownMultiplier + 1e-6))) return false;
  if (!integer(state.stats.goldEarned, 1e7) || !number(state.stats.damageDealt, 1e9)
    || !integer(state.stats.skillsUsed, 1e7) || !integer(state.stats.towersBuilt, 1e7)) return false;
  if (!(state.stats.earlyWavesCalled === undefined && state.stats.earlyWaveGold === undefined)
    && (!integer(state.stats.earlyWavesCalled, Math.max(0, state.wave - 1))
      || !integer(state.stats.earlyWaveGold, state.stats.earlyWavesCalled * 25)
      || state.stats.earlyWaveGold > state.stats.goldEarned)) return false;
  const ids = new Set<number>();
  const id = (value: unknown): value is number => integer(value, 1e8) && value > 0;
  const uniqueId = (value: unknown) => { if (!id(value) || ids.has(value)) return false; ids.add(value); return true; };
  const slots = new Set<number>();
  for (const tower of state.towers) {
    if (!point(tower) || !pose(tower) || !uniqueId(tower.id) || !towerKinds.includes(tower.kind) || !integer(tower.level, 3) || tower.level < 1
      || !integer(tower.slotId, level.slots.length - 1) || slots.has(tower.slotId) || !number(tower.attackTimer, 10)
      || !point({ x: tower.rallyX, y: tower.rallyY }) || !object(tower.abilities) || !object(tower.abilityTimers)) return false;
    if (tower.targetPriority !== undefined && !priorities.includes(tower.targetPriority)) return false;
    if (tower.kind === 'barracks' && tower.targetPriority !== undefined && tower.targetPriority !== 'first') return false;
    if (!optionalNumber(tower.branchGoldSpent, 1e7) || tower.branchGoldSpent !== undefined && !integer(tower.branchGoldSpent, 1e7)) return false;
    if (tower.branch === undefined) {
      if ((tower.branchGoldSpent ?? 0) !== 0) return false;
    } else {
      const branch = getTowerBranch(tower as Tower);
      if (!branch || !integer(tower.branchGoldSpent, 1e7) || tower.branchGoldSpent < branch.cost
        || (tower.branchGoldSpent - branch.cost) % Math.ceil(branch.cost / 2) !== 0) return false;
    }
    const slot = level.slots.find(candidate => candidate.id === tower.slotId);
    if (!slot || tower.x !== slot.x || tower.y !== slot.y) return false;
    slots.add(tower.slotId);
    for (const [kind, rank] of Object.entries(tower.abilities)) {
      const spec = TOWER_ABILITIES[kind as TowerAbilityKind];
      if (!Object.hasOwn(TOWER_ABILITIES, kind) || !spec || spec.towerKind !== tower.kind || tower.level !== 3 || !integer(rank, 2) || rank < 1) return false;
    }
    for (const [kind, timer] of Object.entries(tower.abilityTimers)) if (!Object.hasOwn(tower.abilities, kind) || !number(timer, 120)) return false;
  }
  for (const enemy of state.enemies) {
    if (!point(enemy) || !pose(enemy) || !uniqueId(enemy.id) || !knownEnemy(enemy.kind)
      || enemy.maxHp !== ENEMY_STATS[enemy.kind as EnemyKind].hp * DIFFICULTY_MULTIPLIERS[difficulty].hp
      || !number(enemy.hp, enemy.maxHp) || !enemy.hp || !number(enemy.progress, level.pathLength)
      || !number(enemy.attackTimer, 5) || !(enemy.blockedBy === null || id(enemy.blockedBy))
      || !number(enemy.slowTimer, 12) || !number(enemy.hitTimer, 2) || !optionalNumber(enemy.slowAmount, 0.95)
      || !optionalNumber(enemy.rootTimer, 3) || !optionalNumber(enemy.armorBreakTimer, 5.001) || !optionalNumber(enemy.armorBreakAmount, 0.8)
      || !optionalNumber(enemy.magicBreakTimer, 5.001) || !optionalNumber(enemy.magicBreakAmount, 0.8)
      || !optionalNumber(enemy.bossCooldown, 12.001) || !optionalNumber(enemy.bossRecover, 1.001)) return false;
    const spec = bossSpec(enemy as Enemy);
    if (!spec && (enemy.bossCast !== undefined || enemy.bossCooldown !== undefined || enemy.bossRecover !== undefined)) return false;
    if (enemy.bossCast !== undefined) {
      const cast = enemy.bossCast;
      if (rulesVersion !== 2 || !spec || !point(cast) || cast.kind !== spec.kind || cast.duration !== spec.duration || cast.radius !== spec.radius
        || !number(cast.remaining, cast.duration) || cast.remaining <= 1e-8 || (enemy.rootTimer ?? 0) > 0
        || (enemy.bossRecover ?? 0) > 0 || (enemy.bossCooldown ?? 0) > 0
        || Math.abs((enemy.attackAnimation ?? 0) - cast.remaining) > 0.00001) return false;
    }
    const location = sampleLevelPath(level, enemy.progress);
    if (distanceSquared(enemy, location) > 0.0001) return false;
  }
  let heroes = 0;
  for (const ally of state.allies) {
    if (!point(ally) || !pose(ally) || !uniqueId(ally.id) || !['hero', 'soldier', 'reinforcement'].includes(ally.type)
      || !number(ally.maxHp, 2000) || !ally.maxHp || !number(ally.hp, ally.maxHp) || !number(ally.damage, 500) || !number(ally.armor, 0.95)
      || !number(ally.speed, 500) || !number(ally.attackTimer, 5) || !number(ally.respawnTimer, 15.001)
      || !point({ x: ally.targetX, y: ally.targetY }) || !(ally.engagedWith === null || id(ally.engagedWith))
      || !optionalNumber(ally.buffTimer, 8.001) || !optionalNumber(ally.damageMultiplier, 2) || !optionalNumber(ally.armorBonus, 0.5)
      || !optionalNumber(ally.poisonTimer, 3.001) || !optionalNumber(ally.poisonDamage, 20)) return false;
    if (ally.hp === 0 && ally.engagedWith !== null) return false;
    const same = (actual: number, expected: number) => Math.abs(actual - expected) < 0.00001;
    if ((ally.buffTimer ?? 0) > 0) {
      if (ally.damageMultiplier !== 1.35 || ally.armorBonus !== 0.2 || ally.hp <= 0) return false;
    } else if (ally.damageMultiplier !== undefined && ally.damageMultiplier !== 1 || ally.armorBonus !== undefined && ally.armorBonus !== 0) return false;
    if ((ally.poisonTimer ?? 0) > 0 && (!same(ally.poisonDamage ?? NaN, 4 * DIFFICULTY_MULTIPLIERS[difficulty].damage) || ally.hp <= 0)) return false;
    if (ally.type === 'hero') {
      heroes++;
      if (ally.towerId !== null || ally.maxHp !== HERO_STATS.hp * upgrades.heroHpMultiplier || ally.damage !== HERO_STATS.damage
        || ally.armor !== HERO_STATS.armor || ally.speed !== HERO_STATS.speed || ally.expiresAt !== undefined) return false;
    } else if (ally.type === 'soldier') {
      const tower = state.towers.find((tower: Tower) => tower.id === ally.towerId && tower.kind === 'barracks');
      if (!tower || ally.expiresAt !== undefined) return false;
      const stats = getTowerCombatStats(tower), fortify = tower.abilities['barracks-fortify'] ?? 0;
      if (ally.maxHp !== stats.soldierHp! * upgrades.soldierHpMultiplier + fortify * 55 || ally.damage !== stats.soldierDamage
        || !same(ally.armor, stats.soldierArmor! + fortify * 0.08) || ally.speed !== 100) return false;
    } else if (ally.towerId !== null || !number(ally.expiresAt)
      || (ally.expiresAt <= state.time && state.phase !== 'victory' && state.phase !== 'defeat')
      || ally.maxHp !== 185 || ally.damage !== 20 || ally.armor !== 0.25 || ally.speed !== 120) return false;
  }
  if (heroes !== 1) return false;
  for (const tower of state.towers) if (tower.kind === 'barracks'
    && state.allies.filter((ally: Ally) => ally.type === 'soldier' && ally.towerId === tower.id).length !== 3) return false;
  const enemiesById = new Map<number, Enemy>(state.enemies.map((enemy: Enemy) => [enemy.id, enemy]));
  const alliesById = new Map<number, Ally>(state.allies.map((ally: Ally) => [ally.id, ally]));
  const towersById = new Map<number, Tower>(state.towers.map((tower: Tower) => [tower.id, tower]));
  for (const enemy of state.enemies) if (enemy.blockedBy !== null) {
    const ally = alliesById.get(enemy.blockedBy);
    if (!ally || ally.hp <= 0 || ally.engagedWith !== enemy.id) return false;
  }
  for (const ally of state.allies) if (ally.engagedWith !== null && enemiesById.get(ally.engagedWith)?.blockedBy !== ally.id) return false;
  for (const effect of state.effects) {
    if (!point(effect) || !uniqueId(effect.id) || !effects.includes(effect.type) || !number(effect.maxLife, 60) || !effect.maxLife
      || !number(effect.life, effect.maxLife + 1e-6) || !effect.life || !optionalNumber(effect.radius, 500)
      || !(effect.toX === undefined && effect.toY === undefined || point({ x: effect.toX, y: effect.toY }))
      || !(effect.sourceId === undefined || id(effect.sourceId)) || !(effect.targetId === undefined || id(effect.targetId))
      || !(effect.color === undefined || text(effect.color, 30)) || !(effect.text === undefined || text(effect.text))
      || !(effect.style === undefined || text(effect.style, 60)) || !optionalNumber(effect.attackVariant, 1e7)
      || !(effect.points === undefined || array(effect.points, 40) && effect.points.every(point))) return false;
    if (effect.type === 'boss-warning') {
      const boss = enemiesById.get(effect.sourceId), cast = boss?.bossCast;
      if (!cast || effect.style !== cast.kind || effect.x !== cast.x || effect.y !== cast.y || effect.radius !== cast.radius
        || effect.maxLife !== cast.duration || Math.abs(effect.life - cast.remaining) > 0.00001) return false;
    }
    if (effect.style === 'floodgate') {
      if (!mapEventDefinition || !state.mapEvent || state.mapEvent.activeRemaining <= 0 || effect.type !== 'ring'
        || effect.x !== mapEventDefinition.areaCenter.x || effect.y !== mapEventDefinition.areaCenter.y || effect.radius !== mapEventDefinition.radius
        || effect.maxLife !== mapEventDefinition.duration || Math.abs(effect.life - state.mapEvent.activeRemaining) > .00001) return false;
    }
  }
  if ((state.mapEvent?.activeRemaining ?? 0) > 0 && state.effects.filter((effect: Effect) => effect.style === 'floodgate').length !== 1) return false;
  for (const enemy of state.enemies) if (enemy.bossCast
    && state.effects.filter((effect: Effect) => effect.type === 'boss-warning' && effect.sourceId === enemy.id).length !== 1) return false;
  let previousSpawnTime = -1;
  for (const spawn of state.spawnQueue) {
    if (!object(spawn) || !knownEnemy(spawn.kind) || !number(spawn.time, 2000) || spawn.time < state.waveElapsed - 1e-6 || spawn.time < previousSpawnTime) return false;
    previousSpawnTime = spawn.time;
  }
  if (state.wave > 0) {
    const schedule = waveQueue(level, state.wave - 1, difficulty), skipped = schedule.length - state.spawnQueue.length;
    if (skipped < 0 || schedule.slice(0, skipped).some(spawn => spawn.time > state.waveElapsed + 1e-6)
      || state.spawnQueue.some((spawn: GameState['spawnQueue'][number], index: number) => {
        const expected = schedule[skipped + index];
        return spawn.kind !== expected.kind || Math.abs(spawn.time - expected.time) > 1e-6;
      })) return false;
  }
  if (!id(runtime.nextId) || runtime.nextId <= Math.max(0, ...ids) || !integer(runtime.randomState, 0xffffffff) || !runtime.randomState
    || !array(runtime.commandedMovement, 100) || new Set(runtime.commandedMovement).size !== runtime.commandedMovement.length
    || !runtime.commandedMovement.every((value: unknown) => id(value) && alliesById.has(value))) return false;
  const pairs = (value: unknown, max: number, check: (key: any, data: any) => boolean): boolean => array(value, max)
    && value.every(pair => Array.isArray(pair) && pair.length === 2 && check(pair[0], pair[1]))
    && new Set(value.map(pair => pair[0])).size === value.length;
  if (!pairs(runtime.shamanTimers, 600, (key, timer) => id(key) && enemiesById.get(key)?.kind === 'shaman' && number(timer, 3.001))
    || !pairs(runtime.soldierStrikes, 100, (key, count) => id(key) && alliesById.get(key)?.type === 'soldier' && integer(count, 2))
    || !pairs(runtime.rootFollowups, 600, (key, followup) => id(key) && (enemiesById.get(key)?.rootTimer ?? 0) > 0
      && object(followup) && number(followup.amount, 0.95) && number(followup.duration, 12))
    || !pairs(runtime.slowEffects, 600, (key, sources) => id(key) && enemiesById.has(key) && pairs(sources, 100,
      (source, status) => text(source, 100) && source.length > 0 && object(status) && number(status.amount, 0.95) && number(status.remaining, 12)))
    || !array(runtime.frostZones, 100) || !runtime.frostZones.every(zone => point(zone) && id(zone.sourceId)
      && (towersById.get(zone.sourceId)?.abilities['mage-frost'] ?? 0) > 0 && number(zone.remaining, 4.501)
      && zone.remaining > 0 && number(zone.amount, 0.95) && number(zone.radius, 200))) return false;
  if (runtime.shamanTimers.length !== state.enemies.filter((enemy: Enemy) => enemy.kind === 'shaman').length) return false;
  const slowMap = new Map<number, [string, { amount: number; remaining: number }][]>(runtime.slowEffects);
  for (const enemy of state.enemies) {
    let amount = 0, remaining = 0;
    for (const [, slow] of slowMap.get(enemy.id) ?? []) {
      if (slow.amount > amount) { amount = slow.amount; remaining = slow.remaining; }
      else if (slow.amount === amount) remaining = Math.max(remaining, slow.remaining);
    }
    if (Math.abs((enemy.slowAmount ?? 0) - amount) > 0.00001 || Math.abs(enemy.slowTimer - remaining) > 0.00001) return false;
  }
  if (state.report !== undefined && (!isValidBattleReport(state.report, state as GameState, level, runtime.nextId)
    || state.report.mapActivations > (state.mapEvent?.activations ?? 0))) return false;
  return true;
}
