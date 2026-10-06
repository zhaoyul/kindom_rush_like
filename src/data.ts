import type { EnemyKind, EnemyStats, LevelDefinition, LevelId, Point, SkillKind, Slot, TowerAbilityKind, TowerKind, TowerStats, Wave } from './types';
import { createCampaign } from './campaign';

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 720;

export const PATH: Point[] = [
  { x: -45, y: 240 }, { x: 195, y: 240 }, { x: 270, y: 160 },
  { x: 465, y: 160 }, { x: 550, y: 300 }, { x: 400, y: 425 },
  { x: 400, y: 535 }, { x: 650, y: 535 }, { x: 740, y: 425 },
  { x: 955, y: 425 }, { x: 1050, y: 530 }, { x: 1250, y: 530 },
];

export const SLOTS: Slot[] = [
  { id: 0, x: 135, y: 155 }, { id: 1, x: 270, y: 305 },
  { id: 2, x: 395, y: 85 }, { id: 3, x: 545, y: 205 },
  { id: 4, x: 310, y: 450 }, { id: 5, x: 515, y: 440 },
  { id: 6, x: 625, y: 620 }, { id: 7, x: 780, y: 340 },
  { id: 8, x: 885, y: 515 }, { id: 9, x: 1065, y: 395 },
];

const lengths = PATH.slice(1).map((p, i) => Math.hypot(p.x - PATH[i].x, p.y - PATH[i].y));
export const PATH_LENGTH = lengths.reduce((sum, length) => sum + length, 0);

export function samplePath(progress: number): Point {
  let remaining = Math.max(0, Math.min(PATH_LENGTH, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const ratio = remaining / lengths[i];
      return { x: PATH[i].x + (PATH[i + 1].x - PATH[i].x) * ratio,
        y: PATH[i].y + (PATH[i + 1].y - PATH[i].y) * ratio };
    }
    remaining -= lengths[i];
  }
  return { ...PATH[PATH.length - 1] };
}

export function nearestPathPoint(point: Point): Point & { progress: number } {
  let best = { ...PATH[0], progress: 0 };
  let bestDistance = Infinity;
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const start = PATH[i], end = PATH[i + 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (lengths[i] ** 2)));
    const x = start.x + dx * ratio, y = start.y + dy * ratio;
    const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y, progress: walked + lengths[i] * ratio };
    }
    walked += lengths[i];
  }
  return best;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  bogling: { name: '沼泥怪', hp: 125, speed: 40, armor: 0.08, magicResist: 0.25, damage: 12,
    attackRate: 1.1, gold: 15, lives: 1, description: '移动时每秒恢复 3 生命，用范围炮击集中清理泥群。', color: '#8aa86a' },
  serpent: { name: '毒沼蛇', hp: 170, speed: 69, armor: 0.12, magicResist: 0.1, damage: 16,
    attackRate: 0.95, gold: 20, lives: 2, description: '毒牙使友军中毒 3 秒，每秒损失 4 生命；再次攻击刷新毒效。', color: '#82ba72' },
  icewolf: { name: '霜狼', hp: 200, speed: 83, armor: 0.1, magicResist: 0.3, damage: 23,
    attackRate: 0.8, gold: 24, lives: 2, description: '冰霜毛皮削弱 50% 减速效果，仍可被荆棘定身和驻兵阻挡。', color: '#b1d9e6' },
  frostguard: { name: '霜铠卫', hp: 390, speed: 32, armor: 0.55, magicResist: 0.15, damage: 32,
    attackRate: 1.3, gold: 35, lives: 3, description: '厚重霜铠抵挡 55% 物理伤害，穿甲炮弹和魔法最有效。', color: '#83b5c8' },
  imp: { name: '熔火小鬼', hp: 165, speed: 58, armor: 0.05, magicResist: 0.4, damage: 20,
    attackRate: 0.85, gold: 22, lives: 1, description: '阵亡时自爆，对 44 范围友军造成 24 真实伤害。', color: '#dc8755' },
  juggernaut: { name: '熔铠领主', hp: 3200, speed: 24, armor: 0.55, magicResist: 0.2, damage: 58,
    attackRate: 1.45, gold: 260, lives: 10, description: '熔火终章首领，锤击还对目标 50 范围的其他友军造成 22 物理伤害。', color: '#d86f50' },
  goblin: { name: '林地哥布林', hp: 70, speed: 46, armor: 0, magicResist: 0, damage: 9,
    attackRate: 1.1, gold: 10, lives: 1, description: '成群出没的轻装步兵，适合用箭塔快速清理。', color: '#9db855' },
  wolf: { name: '疾奔狼', hp: 105, speed: 88, armor: 0, magicResist: 0.12, damage: 13,
    attackRate: 0.8, gold: 13, lives: 1, description: '速度极快，驻兵和英雄能拦住它们。', color: '#98aeb0' },
  orc: { name: '铁甲兽人', hp: 190, speed: 38, armor: 0.4, magicResist: 0, damage: 19,
    attackRate: 1.2, gold: 19, lives: 2, description: '厚甲抵挡 40% 物理伤害，魔法塔可以穿透护甲。', color: '#67925a' },
  shaman: { name: '荒野萨满', hp: 145, speed: 42, armor: 0.05, magicResist: 0.4, damage: 11,
    attackRate: 1.4, gold: 23, lives: 2, description: '每 3 秒为附近敌人恢复 18 生命；具有 40% 魔抗。', color: '#c697dd' },
  golem: { name: '岩甲巨人', hp: 460, speed: 29, armor: 0.65, magicResist: 0.12, damage: 31,
    attackRate: 1.6, gold: 35, lives: 3, description: '高生命、65% 护甲。用魔法塔和陨星集中击破。', color: '#a8987e' },
  chieftain: { name: '荆棘酋长', hp: 2200, speed: 26, armor: 0.4, magicResist: 0.2, damage: 46,
    attackRate: 1.3, gold: 180, lives: 8, description: '终波首领，生命极高。集结英雄、驻兵与技能迎战。', color: '#ba685c' },
};

const TOWERS: Record<TowerKind, TowerStats[]> = {
  cannon: [
    { name: '火药炮塔', cost: 130, upgradeCost: 140, description: '炮弹在 48 范围爆炸，物理群体伤害。', damage: 36, rate: 2.1, range: 180, damageType: 'physical' },
    { name: '重装炮塔', cost: 130, upgradeCost: 205, description: '重型炮弹在 58 范围爆炸，清理密集敌军。', damage: 64, rate: 1.8, range: 200, damageType: 'physical' },
    { name: '雷霆炮塔', cost: 130, upgradeCost: 0, description: '68 范围大爆炸，解锁集束、穿甲和震地专精。', damage: 98, rate: 1.55, range: 225, damageType: 'physical' },
  ],
  arrow: [
    { name: '游侠箭塔', cost: 80, upgradeCost: 95, description: '快速射击，克制轻甲与疾奔敌人。', damage: 18, rate: 0.7, range: 160, damageType: 'physical' },
    { name: '猎手箭塔', cost: 80, upgradeCost: 155, description: '射程和射速提升，持续压制轻甲敌人。', damage: 29, rate: 0.58, range: 180, damageType: 'physical' },
    { name: '鹰眼箭塔', cost: 80, upgradeCost: 0, description: '精锐射手的远距离连射。', damage: 45, rate: 0.46, range: 205, damageType: 'physical' },
  ],
  mage: [
    { name: '秘术魔法塔', cost: 115, upgradeCost: 130, description: '无视物理护甲，命中使敌人减速 35%。', damage: 46, rate: 1.4, range: 168, damageType: 'magic' },
    { name: '符文魔法塔', cost: 115, upgradeCost: 185, description: '强力魔法弹，穿透重甲并持续减速。', damage: 76, rate: 1.15, range: 186, damageType: 'magic' },
    { name: '星辉魔法塔', cost: 115, upgradeCost: 0, description: '星辉法术重创巨人和首领。', damage: 118, rate: 0.96, range: 210, damageType: 'magic' },
  ],
  barracks: [
    { name: '守林驻兵塔', cost: 95, upgradeCost: 100, description: '训练 3 名卫兵拦路作战，可调整集结点。', damage: 12, rate: 0.95, range: 175, damageType: 'physical', soldierHp: 120, soldierDamage: 12, soldierArmor: 0.15 },
    { name: '盾卫驻兵塔', cost: 95, upgradeCost: 155, description: '3 名盾卫获得更高生命、防御与攻击。', damage: 21, rate: 0.9, range: 190, damageType: 'physical', soldierHp: 190, soldierDamage: 21, soldierArmor: 0.3 },
    { name: '精锐驻兵塔', cost: 95, upgradeCost: 0, description: '3 名精锐卫兵坚守战线，阵亡 9 秒后重返战场。', damage: 32, rate: 0.8, range: 210, damageType: 'physical', soldierHp: 285, soldierDamage: 32, soldierArmor: 0.4 },
  ],
};

export function getTowerStats(kind: TowerKind, level: number): TowerStats {
  return { ...TOWERS[kind][Math.max(0, Math.min(2, Math.floor(level) - 1))] };
}

export const HERO_STATS = { name: '艾琳 · 守林者', hp: 440, damage: 32, armor: 0.3, speed: 155, attackRate: 0.85, respawnTime: 15 };

export interface TowerAbilityDefinition {
  id: TowerAbilityKind; towerKind: TowerKind; name: string; description: string; icon: string;
  costs: [number, number]; rankDescriptions: [string, string];
}

export const TOWER_ABILITIES: Record<TowerAbilityKind, TowerAbilityDefinition> = {
  'cannon-cluster': { id: 'cannon-cluster', towerKind: 'cannon', name: '集束炮击', icon: 'cluster',
    description: '定期发射集束炮弹，在更大的范围造成物理伤害。', costs: [110, 160],
    rankDescriptions: ['每 9 秒，88 范围造成 80 物理伤害', '每 7 秒，88 范围造成 125 物理伤害'] },
  'cannon-pierce': { id: 'cannon-pierce', towerKind: 'cannon', name: '穿甲重弹', icon: 'pierce',
    description: '普通炮弹有概率暴击，并降低被命中敌人的物理护甲。', costs: [120, 175],
    rankDescriptions: ['22% 概率 2.5 倍伤害，护甲降低 20% 持续 3 秒', '32% 概率 3.5 倍伤害，护甲降低 35% 持续 5 秒'] },
  'cannon-quake': { id: 'cannon-quake', towerKind: 'cannon', name: '震地冲击', icon: 'quake',
    description: '定期发射震地弹，对范围敌人造成伤害并持续减速。', costs: [90, 140],
    rankDescriptions: ['每 10 秒，100 范围造成 30 伤害，减速 40% 持续 3 秒', '每 8 秒，100 范围造成 50 伤害，减速 60% 持续 4 秒'] },
  'arrow-volley': { id: 'arrow-volley', towerKind: 'arrow', name: '箭雨齐射', icon: 'volley',
    description: '定期向当前优先目标周围倾泻箭雨，物理范围杀伤。', costs: [90, 140],
    rankDescriptions: ['每 8 秒，70 范围造成 38 物理伤害', '每 6 秒，70 范围造成 58 物理伤害'] },
  'arrow-deadeye': { id: 'arrow-deadeye', towerKind: 'arrow', name: '鹰眼狙杀', icon: 'crosshair',
    description: '普通射击有概率打出高倍率伤害，首领也按正常伤害结算。', costs: [110, 160],
    rankDescriptions: ['20% 概率造成 3 倍射击伤害', '30% 概率造成 4 倍射击伤害'] },
  'arrow-snare': { id: 'arrow-snare', towerKind: 'arrow', name: '毒藤箭', icon: 'vines',
    description: '普通射击缠绕敌人，降低移动速度。', costs: [75, 110],
    rankDescriptions: ['减速 35%，持续 2.5 秒', '减速 55%，持续 3.5 秒'] },
  'mage-chain': { id: 'mage-chain', towerKind: 'mage', name: '星弧连锁', icon: 'chain',
    description: '星辉电弧连续击中射程内的多名敌人。', costs: [110, 160],
    rankDescriptions: ['每 7 秒，3 个目标各受 85 魔法伤害', '每 5 秒，4 个目标各受 125 魔法伤害'] },
  'mage-overload': { id: 'mage-overload', towerKind: 'mage', name: '奥术过载', icon: 'arcane',
    description: '普通法术有概率引发强力奥术爆发。', costs: [120, 180],
    rankDescriptions: ['18% 概率造成 2.5 倍法术伤害', '28% 概率造成 3.5 倍法术伤害'] },
  'mage-frost': { id: 'mage-frost', towerKind: 'mage', name: '极寒领域', icon: 'frost',
    description: '创造持续冰霜区域，初始造成魔法伤害并减速进入的敌人。', costs: [90, 140],
    rankDescriptions: ['每 9 秒：30 伤害，减速 50%，持续 3.5 秒', '每 7 秒：50 伤害，减速 65%，持续 4.5 秒'] },
  'barracks-cleave': { id: 'barracks-cleave', towerKind: 'barracks', name: '旋风斩', icon: 'whirlwind',
    description: '每名卫兵每第三次攻击发动旋风斩，打击身边敌群。', costs: [90, 130],
    rankDescriptions: ['每 3 击，48 范围造成 22 物理伤害', '每 3 击，48 范围造成 36 物理伤害'] },
  'barracks-fortify': { id: 'barracks-fortify', towerKind: 'barracks', name: '铁壁军阵', icon: 'formation',
    description: '永久提升这座兵营的卫兵生命和护甲，复活后保留。', costs: [90, 140],
    rankDescriptions: ['卫兵生命 +55，护甲 +8%', '卫兵生命 +110，护甲 +16%'] },
  'barracks-mend': { id: 'barracks-mend', towerKind: 'barracks', name: '圣林祝福', icon: 'blessing',
    description: '定期治疗集结点附近受伤的友军。没有伤员时保留技能。', costs: [100, 150],
    rankDescriptions: ['每 10 秒，95 范围友军恢复 50 生命', '每 8 秒，95 范围友军恢复 85 生命'] },
};

export function getTowerAbilities(kind: TowerKind): TowerAbilityDefinition[] {
  return Object.values(TOWER_ABILITIES).filter(ability => ability.towerKind === kind);
}

export const HERO_SKILLS: SkillKind[] = ['hero', 'hero-dash', 'hero-roots', 'hero-oath'];
export const SKILLS: Record<SkillKind, { name: string; description: string; cooldown: number; target: 'point' | 'hero'; range?: number; radius?: number }> = {
  meteor: { name: '陨星坠落', description: '对选定区域造成 300 点真实伤害，无视护甲与魔抗。', cooldown: 32, target: 'point', radius: 95 },
  reinforce: { name: '召集援军', description: '在道路旁召唤 2 名援军，持续 24 秒。', cooldown: 24, target: 'point' },
  hero: { name: '守林之怒', description: '艾琳恢复 200 生命，对周围敌人造成 150 点真实伤害。', cooldown: 30, target: 'hero', radius: 115 },
  'hero-dash': { name: '月刃突袭', description: '艾琳向 240 范围内突进，沿途 48 范围敌人受到 120 真实伤害。', cooldown: 18, target: 'point', range: 240, radius: 48 },
  'hero-roots': { name: '荆棘缚境', description: '在 260 距离内召出荆棘，105 范围造成 55 魔法伤害，定身 2.5 秒后减速 55% 持续 4 秒。', cooldown: 26, target: 'point', range: 260, radius: 105 },
  'hero-oath': { name: '古树盟约', description: '165 范围友军恢复 160 生命，并获得 8 秒的 35% 增伤和 20% 额外护甲。', cooldown: 42, target: 'hero', radius: 165 },
};

export const LEGACY_FOREST_WAVES: Wave[] = [
  { name: '林间骚动', description: '哥布林沿林道来袭，建立第一道防线。', enemies: [{ kind: 'goblin', count: 12, interval: 1.25 }] },
  { name: '狼群突袭', description: '疾奔狼混入队伍，派出卫兵拦截。', enemies: [{ kind: 'goblin', count: 10, interval: 1.1 }, { kind: 'wolf', count: 6, interval: 1.5, delay: 5 }] },
  { name: '铁甲前锋', description: '兽人身披重甲，魔法塔开始显露威力。', enemies: [{ kind: 'orc', count: 7, interval: 2 }, { kind: 'goblin', count: 10, interval: 0.85, delay: 3 }] },
  { name: '萨满仪式', description: '萨满会治疗附近敌人，优先集火。', enemies: [{ kind: 'orc', count: 7, interval: 1.8 }, { kind: 'shaman', count: 4, interval: 3.1, delay: 4 }, { kind: 'wolf', count: 6, interval: 1.1, delay: 10 }] },
  { name: '岩甲巨人', description: '巨人缓慢逼近，升级秘术魔法塔。', enemies: [{ kind: 'golem', count: 5, interval: 3.2 }, { kind: 'orc', count: 7, interval: 1.8, delay: 2 }, { kind: 'goblin', count: 10, interval: 0.85, delay: 6 }] },
  { name: '暗林奔袭', description: '高速狼群掩护萨满，及时召集援军。', enemies: [{ kind: 'wolf', count: 14, interval: 0.8 }, { kind: 'shaman', count: 5, interval: 2.5, delay: 4 }, { kind: 'golem', count: 4, interval: 3.5, delay: 7 }] },
  { name: '荆棘大军', description: '重甲大军全线压进，准备最后一战。', enemies: [{ kind: 'golem', count: 7, interval: 2.8 }, { kind: 'orc', count: 12, interval: 1.2, delay: 3 }, { kind: 'shaman', count: 5, interval: 3, delay: 5 }, { kind: 'wolf', count: 8, interval: 1.1, delay: 12 }] },
  { name: '酋长的终局', description: '荆棘酋长现身！守住通往晨曦堡垒的道路。', enemies: [{ kind: 'orc', count: 9, interval: 1.4 }, { kind: 'golem', count: 5, interval: 3, delay: 2 }, { kind: 'shaman', count: 4, interval: 3.5, delay: 5 }, { kind: 'chieftain', count: 1, interval: 1, delay: 16 }, { kind: 'wolf', count: 10, interval: 0.9, delay: 20 }] },
];


/** Rules 2 retains the tutorial and roster, then separates pressure into escort and flanking arrivals. */
export const WAVES: Wave[] = [
  ...LEGACY_FOREST_WAVES.slice(0, 2),
  { name: '铁甲前锋', description: '兽人牵制正面，轻兵随后穿插；准备魔法输出与拦截。', enemies: [{ kind: 'orc', count: 7, interval: 1.6, delay: 0 }, { kind: 'goblin', count: 10, interval: 0.65, delay: 7 }] },
  { name: '萨满仪式', description: '萨满贴近兽人护送，狼群随后穿插；集火治疗者。', enemies: [{ kind: 'orc', count: 7, interval: 1.6, delay: 0 }, { kind: 'shaman', count: 4, interval: 1.7, delay: 2 }, { kind: 'wolf', count: 6, interval: 1.1, delay: 14 }] },
  { name: '岩甲巨人', description: '巨人与兽人同步压进，哥布林后排冲刺；分散布置交叉火力。', enemies: [{ kind: 'golem', count: 5, interval: 3.2, delay: 0 }, { kind: 'orc', count: 7, interval: 1.3, delay: 6 }, { kind: 'goblin', count: 10, interval: 0.65, delay: 15 }] },
  { name: '暗林奔袭', description: '萨满护送巨人，两批狼群追上正面；为后批保留拦截技能。', enemies: [{ kind: 'golem', count: 4, interval: 3.5, delay: 0 }, { kind: 'shaman', count: 5, interval: 3.1, delay: 3 }, { kind: 'wolf', count: 7, interval: 1.1, delay: 8 }, { kind: 'wolf', count: 7, interval: 1.1, delay: 18 }] },
  { name: '荆棘大军', description: '巨人受萨满掩护，兽人分两批接战，晚到狼群威胁出口。', enemies: [{ kind: 'golem', count: 7, interval: 3.2, delay: 0 }, { kind: 'orc', count: 6, interval: 1.1, delay: 7 }, { kind: 'shaman', count: 5, interval: 4, delay: 8 }, { kind: 'wolf', count: 8, interval: 1.1, delay: 22 }, { kind: 'orc', count: 6, interval: 1.1, delay: 23 }] },
  { name: '酋长的终局', description: '酋长率重甲护卫进军，萨满随行，两批狼群趁首领交战夹击。', enemies: [{ kind: 'golem', count: 5, interval: 3.8, delay: 0 }, { kind: 'chieftain', count: 1, interval: 1, delay: 8 }, { kind: 'orc', count: 9, interval: 1.1, delay: 13 }, { kind: 'shaman', count: 4, interval: 3.5, delay: 14 }, { kind: 'wolf', count: 5, interval: 1.1, delay: 21 }, { kind: 'wolf', count: 5, interval: 1.1, delay: 29 }] },
];

/** All damage uses the defender's matching resistance. True damage bypasses both. */
export function damageAfterResistance(amount: number, armor: number, magicResist: number, type: 'physical' | 'magic' | 'true'): number {
  const resistance = type === 'physical' ? armor : type === 'magic' ? magicResist : 0;
  return Math.max(0, amount) * (1 - Math.max(0, Math.min(0.95, resistance)));
}

export const LEVELS: LevelDefinition[] = createCampaign({
  id: 'forest', name: '暮林隘口', subtitle: '晨曦林道 · 荆棘军团的首次进攻', theme: 'forest',
  path: PATH, pathLength: PATH_LENGTH, slots: SLOTS, waves: WAVES, startGold: 360, lives: 20, heroSpawn: { x: 750, y: 445 },
});
export function getLevel(id: LevelId): LevelDefinition {
  const level = LEVELS.find(candidate => candidate.id === id);
  if (!level) throw new Error(`Unknown level: ${String(id)}`);
  return level;
}

/** Versioned forest schedules keep in-progress saves on the rules they began with. */
export function getLevelForRules(id: LevelId, rulesVersion: 1 | 2): LevelDefinition {
  const level = getLevel(id);
  if (rulesVersion !== 1 && rulesVersion !== 2) throw new Error(`Unknown rules version: ${String(rulesVersion)}`);
  return id === 'forest' && rulesVersion === 1 ? { ...level, waves: LEGACY_FOREST_WAVES } : level;
}
