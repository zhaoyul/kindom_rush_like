import { ENEMY_STATS, getLevel, getTowerStats, LEVELS, SKILLS } from './data';
import { nearestLevelPathPoint, sampleLevelPath } from './campaign';
import type { EnemyKind, LevelDefinition, LevelId, Point, SkillKind, TowerKind, Wave } from './types';

export type TacticalTag = 'armored' | 'magic-resistant' | 'fast' | 'swarm' | 'healer' | 'boss' | 'poison' | 'regeneration' | 'slow-resistant' | 'explosive';
export interface EnemyCounter {
  kind: EnemyKind; name: string; tags: TacticalTag[];
  physicalRetention: number; magicRetention: number;
  recommendedTowers: TowerKind[]; recommendedSkills: SkillKind[]; advice: string[];
}
export interface WaveIntel {
  levelId: LevelId; waveIndex: number; waveNumber: number; name: string;
  enemyCount: number; bounty: number; spawnDuration: number; peakSpawnCount: number;
  armoredCount: number; magicResistantCount: number; fastCount: number; healerCount: number; bossCount: number;
  totalBaseHp: number; maxArmor: number; maxMagicResist: number;
  fastArrivalBatches: number;
  tags: TacticalTag[]; recommendedTowers: TowerKind[]; recommendedSkills: SkillKind[];
  advice: string[]; warnings: string[];
  targetingAdvice: { towerKind: TowerKind; priority: 'first' | 'strong' | 'weak'; reason: string }[];
}
export interface TacticalPosition {
  slotId: number; point: Point; pathProgress: number; coverage: number; reason: string;
}
export interface LevelTactics {
  levelId: LevelId; name: string; totalWaves: number; enemyCount: number;
  firstWave: WaveIntel; specialties: TacticalTag[];
  recommendedTowers: TowerKind[]; advice: string[]; positions: TacticalPosition[];
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const armored = (kind: EnemyKind) => ENEMY_STATS[kind].armor >= .4;
const magicResistant = (kind: EnemyKind) => ENEMY_STATS[kind].magicResist >= .3;
const fast = (kind: EnemyKind) => ENEMY_STATS[kind].speed >= 68;
const boss = (kind: EnemyKind) => ENEMY_STATS[kind].lives >= 8;
const resolveLevel = (level: LevelId | LevelDefinition) => typeof level === 'string' ? getLevel(level) : level;

/** Counter recommendations use current resistances and roles; they do not assume a fixed wave script. */
export function getEnemyCounters(kind: EnemyKind): EnemyCounter {
  const stats = ENEMY_STATS[kind];
  if (!Object.hasOwn(ENEMY_STATS, kind)) throw new Error(`Unknown enemy kind: ${String(kind)}`);
  const tags: TacticalTag[] = [], advice: string[] = [], towers: TowerKind[] = [], skills: SkillKind[] = [];
  if (boss(kind)) {
    tags.push('boss'); towers.push('mage', 'cannon'); skills.push('meteor', 'hero-oath');
    advice.push(`突破会损失 ${stats.lives} 生命，保留${SKILLS.meteor.name}并用穿甲炮弹持续压制。`);
  }
  if (armored(kind)) {
    tags.push('armored'); towers.push('mage'); skills.push('meteor');
    advice.push(`物理伤害被抵挡 ${Math.round(stats.armor * 100)}%，用魔法塔或穿甲重弹破甲。`);
  }
  if (magicResistant(kind)) {
    tags.push('magic-resistant'); towers.push('arrow', 'cannon');
    advice.push(`魔抗 ${Math.round(stats.magicResist * 100)}%，搭配物理塔与真实伤害。`);
  }
  if (fast(kind)) {
    tags.push('fast'); towers.push('barracks', 'arrow'); skills.push('reinforce', 'hero-roots');
    advice.push('在已有火力覆盖的道路集结驻兵，援军拦截漏网者。');
  }
  if (kind === 'shaman') {
    tags.push('healer'); towers.unshift('arrow'); skills.unshift('hero-dash');
    advice.unshift('会治疗附近敌人，用月刃突袭或陨星清理治疗者。');
  }
  if (kind === 'bogling') {
    tags.push('regeneration'); towers.unshift('cannon'); skills.push('hero-roots');
    advice.unshift('移动时持续回血，先拦截聚拢，再用炮击集中清理。');
  }
  if (kind === 'serpent') {
    tags.push('poison'); skills.push('hero-oath');
    advice.unshift('毒牙持续消耗友军，用圣林祝福或古树盟约维持拦截线。');
  }
  if (kind === 'icewolf') {
    tags.push('slow-resistant'); skills.unshift('hero-roots');
    advice.unshift('普通减速效果减半，用荆棘定身和驻兵阻挡。');
  }
  if (kind === 'imp') {
    tags.push('explosive'); towers.unshift('arrow', 'cannon');
    advice.unshift('阵亡自爆伤及近处友军，让远程塔先清理，英雄避免扎进密集小鬼。');
  }
  if (kind === 'juggernaut') advice.unshift('锤击会伤害目标周围友军，分开英雄与驻兵的拦截位置。');
  if (!towers.length) { towers.push('arrow'); advice.push('低护甲步兵用箭塔快速清理，数量密集时加入炮塔。'); }
  return { kind, name: stats.name, tags: unique(tags), physicalRetention: 1 - stats.armor, magicRetention: 1 - stats.magicResist,
    recommendedTowers: unique(towers), recommendedSkills: unique(skills), advice: unique(advice) };
}

/** Matches startWave's delayed/serial-group scheduling, including the last actual spawn. */
function spawnTimes(wave: Wave): number[] {
  let cursor = 0;
  const times = wave.enemies.flatMap(group => {
    const start = group.delay ?? cursor;
    cursor = Math.max(cursor, start + group.count * group.interval);
    return Array.from({ length: group.count }, (_, index) => start + index * group.interval);
  });
  return times.sort((a, b) => a - b);
}

/** Distinct fast groups are a tactical flank only when their spawn windows have a real gap. */
function fastArrivalBatches(wave: Wave): number {
  let cursor = 0;
  const windows = wave.enemies.flatMap(group => {
    const start = group.delay ?? cursor;
    cursor = Math.max(cursor, start + group.count * group.interval);
    return fast(group.kind) ? [{ start, end: start + Math.max(0, group.count - 1) * group.interval }] : [];
  }).sort((a, b) => a.start - b.start);
  let batches = 0, end = -Infinity;
  for (const window of windows) {
    if (window.start - end >= 2) batches++;
    end = Math.max(end, window.end);
  }
  return batches;
}

export function analyzeWave(levelInput: LevelId | LevelDefinition, waveIndex: number): WaveIntel | null {
  if (!Number.isInteger(waveIndex) || waveIndex < 0) return null;
  const level = typeof levelInput === 'string' ? LEVELS.find(candidate => candidate.id === levelInput) : levelInput;
  const wave = level?.waves[waveIndex]; if (!level || !wave) return null;
  const count = (match: (kind: EnemyKind) => boolean) => wave.enemies.reduce((sum, group) => sum + (match(group.kind) ? group.count : 0), 0);
  const kinds = unique(wave.enemies.map(group => group.kind)), counters = kinds.map(getEnemyCounters), times = spawnTimes(wave);
  let peakSpawnCount = 0, left = 0;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] > 3) left++;
    peakSpawnCount = Math.max(peakSpawnCount, right - left + 1);
  }
  const tags = unique(counters.flatMap(counter => counter.tags));
  if (peakSpawnCount >= 5) tags.push('swarm');
  const towers: TowerKind[] = [], skills: SkillKind[] = [], advice: string[] = [], warnings: string[] = [];
  const has = (tag: TacticalTag) => tags.includes(tag);
  const armoredCount = count(armored), magicResistantCount = count(magicResistant), fastCount = count(fast), bossCount = count(boss);
  const fastBatches = fastArrivalBatches(wave);
  if (fastBatches > 1) {
    advice.push(`快敌分 ${fastBatches} 批到达，驻兵守住输出区，为后批保留援军或荆棘。`);
    warnings.push('首批快敌清场后仍有后续突袭，不要过早提前放波。');
  }
  if (has('healer') && has('armored')) warnings.push('治疗者与重甲混编，单靠炮击清轻兵会留下前排；补充魔法输出。');
  if (has('boss')) {
    towers.push('mage', 'cannon'); skills.push('meteor', 'hero-oath');
    advice.push('魔法塔设为强敌优先，配合穿甲重弹与陨星集中击破首领。');
    warnings.push(`首领漏过会损失 ${Math.max(...kinds.map(kind => ENEMY_STATS[kind].lives))} 生命。`);
  }
  if (has('healer')) {
    towers.push('arrow'); skills.push('hero-dash', 'meteor');
    advice.push('萨满进入火力区后，用突袭或陨星优先集火治疗者。');
  }
  if (has('explosive')) {
    towers.push('arrow', 'cannon');
    advice.push('先用远程塔处理爆裂小鬼，英雄与驻兵避开密集自爆范围。');
    warnings.push('小鬼阵亡会伤及身边友军。');
  }
  if (has('slow-resistant')) {
    towers.push('barracks', 'arrow'); skills.push('hero-roots', 'reinforce');
    advice.push('霜狼削弱普通减速，荆棘定身和道路拦截更可靠。');
    warnings.push('霜狼的普通减速效果减半。');
  }
  if (has('armored')) {
    towers.push('mage'); skills.push('meteor');
    advice.push(has('magic-resistant') ? '重甲与魔抗单位混编，魔法塔打重甲，箭塔清理魔抗敌人。' : '升级魔法塔应对重甲，三级炮塔可学习穿甲重弹。');
  }
  if (has('swarm') || has('regeneration')) {
    towers.push('cannon'); skills.push('hero-roots', 'meteor');
    advice.push('在两座输出塔能覆盖的道路拦截聚敌，炮击与箭雨清理密集队伍。');
  }
  if (has('fast')) {
    towers.push('barracks', 'arrow'); skills.push('reinforce');
    advice.push('箭塔保留前列优先，驻兵与援军拦截先走出火力区的快敌。');
  }
  if (has('poison')) { skills.push('hero-oath'); advice.push('毒蛇会持续消耗驻兵，保留古树盟约或学习兵营的圣林祝福。'); warnings.push('毒牙使友军持续中毒。'); }
  if (has('magic-resistant') && !has('armored')) { towers.push('arrow', 'cannon'); advice.push('高魔抗单位用物理塔清理，陨星与月刃突袭的真实伤害也有效。'); }
  if (!advice.length) { towers.push('arrow', 'barracks'); advice.push('先用箭塔覆盖入口道路，驻兵集结在射程内稳定拦截。'); }
  const targetingAdvice: WaveIntel['targetingAdvice'] = [];
  if (armoredCount || bossCount) targetingAdvice.push({ towerKind: 'mage', priority: 'strong', reason: '持续压制高生命重甲与首领。' });
  if (fastCount) targetingAdvice.push({ towerKind: 'arrow', priority: 'first', reason: '保护出口，处理走在最前的漏网敌人。' });
  if (has('swarm')) targetingAdvice.push({ towerKind: 'cannon', priority: 'first', reason: '让炮弹覆盖拦截线前的密集敌群。' });
  if (!fastCount && kinds.some(kind => ENEMY_STATS[kind].hp <= 170)) targetingAdvice.push({ towerKind: 'arrow', priority: 'weak', reason: '优先收割低生命敌人，减少有效攻击目标。' });
  return {
    levelId: level.id, waveIndex, waveNumber: waveIndex + 1, name: wave.name, enemyCount: times.length,
    bounty: wave.enemies.reduce((sum, group) => sum + group.count * ENEMY_STATS[group.kind].gold, 0),
    spawnDuration: Math.ceil(times.at(-1) ?? 0), peakSpawnCount, armoredCount, magicResistantCount, fastCount,
    healerCount: count(kind => kind === 'shaman'), bossCount,
    totalBaseHp: wave.enemies.reduce((sum, group) => sum + group.count * ENEMY_STATS[group.kind].hp, 0), fastArrivalBatches: fastBatches,
    maxArmor: Math.max(0, ...kinds.map(kind => ENEMY_STATS[kind].armor)),
    maxMagicResist: Math.max(0, ...kinds.map(kind => ENEMY_STATS[kind].magicResist)),
    tags: unique(tags), recommendedTowers: unique(towers), recommendedSkills: unique(skills),
    advice: unique(advice).slice(0, 3), warnings: unique(warnings).slice(0, 3), targetingAdvice,
  };
}

/** Rank sites by shared road coverage rather than hard-coding a solution for each map. */
function tacticalPositions(level: LevelDefinition): TacticalPosition[] {
  const samples = Array.from({ length: Math.ceil(level.pathLength / 30) + 1 }, (_, index) => sampleLevelPath(level, Math.min(level.pathLength, index * 30)));
  const range = getTowerStats('arrow', 1).range;
  const positions = level.slots.map(slot => {
    const road = nearestLevelPathPoint(level, slot);
    const coverage = samples.filter(point => Math.hypot(point.x - slot.x, point.y - slot.y) <= range).length * 30;
    return { slotId: slot.id, point: { x: slot.x, y: slot.y }, pathProgress: road.progress, coverage,
      reason: `约 ${coverage} 距离的道路位于一级箭塔射程内，适合与附近兵营形成交叉火力。` };
  });
  return positions.filter(position => position.pathProgress > 80 && position.pathProgress < level.pathLength * .85)
    .sort((a, b) => b.coverage - a.coverage || a.pathProgress - b.pathProgress || a.slotId - b.slotId).slice(0, 2);
}

export function getLevelTactics(levelInput: LevelId | LevelDefinition): LevelTactics {
  const level = resolveLevel(levelInput), waves = level.waves.map((_, index) => analyzeWave(level, index)!);
  const firstWave = waves[0];
  const specialties = unique(waves.flatMap(wave => wave.tags));
  const advice: string[] = [], towers: TowerKind[] = [...firstWave.recommendedTowers];
  if (specialties.includes('slow-resistant')) advice.push('雪地快敌不能只靠减速；用驻兵和荆棘守住拐角。');
  if (specialties.includes('explosive')) advice.push('分散英雄与驻兵，让箭塔和炮塔先清理自爆单位。');
  if (specialties.includes('regeneration') || specialties.includes('poison')) advice.push('先聚拢再清理再生敌群，保留治疗维持中毒后的拦截线。');
  if (specialties.includes('armored')) { towers.push('mage'); advice.push('后续重甲波需要魔法输出，初期花费为魔法塔升级留出余量。'); }
  if (specialties.includes('healer')) advice.push('看到治疗者混入队伍时，准备突袭或陨星优先清理。');
  advice.push('保留一处靠近出口的备用建造位，用来补漏；余敌稀少且防线稳定时再提前放波。');
  return { levelId: level.id, name: level.name, totalWaves: waves.length,
    enemyCount: waves.reduce((sum, wave) => sum + wave.enemyCount, 0), firstWave, specialties,
    recommendedTowers: unique(towers), advice: unique(advice).slice(0, 3), positions: tacticalPositions(level) };
}
