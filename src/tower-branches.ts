import { getTowerStats, TOWER_ABILITIES } from './data';
import type { Tower, TowerAbilityKind, TowerBranchId, TowerKind, TowerStats } from './types';

export interface TowerBranchDefinition {
  id: TowerBranchId; towerKind: TowerKind; name: string; description: string; icon: string;
  cost: number; stats: string;
}

export const TOWER_BRANCHES: Record<TowerBranchId, TowerBranchDefinition> = {
  'arrow-ranger': { id: 'arrow-ranger', towerKind: 'arrow', name: '密林游侠', icon: 'volley', cost: 120,
    description: '短射程快速连射，擅长清理成群轻甲敌人。', stats: '38 伤害 · 0.32 秒/箭 · 190 射程' },
  'arrow-sniper': { id: 'arrow-sniper', towerKind: 'arrow', name: '月鹰狙手', icon: 'crosshair', cost: 120,
    description: '牺牲射速换取远射程与高额单发杀伤。', stats: '105 伤害 · 1.35 秒/箭 · 255 射程' },
  'mage-arcane': { id: 'mage-arcane', towerKind: 'mage', name: '星界秘法师', icon: 'arcane', cost: 140,
    description: '高伤害法术，普通命中的减速效果较弱。', stats: '155 魔法伤害 · 1.05 秒/击 · 210 射程 · 减速 25%' },
  'mage-frost': { id: 'mage-frost', towerKind: 'mage', name: '极霜咒术师', icon: 'frost', cost: 140,
    description: '降低单发杀伤，换取更远射程与持久强减速。', stats: '85 魔法伤害 · 1.10 秒/击 · 225 射程 · 减速 55%' },
  'cannon-cluster': { id: 'cannon-cluster', towerKind: 'cannon', name: '蜂巢火炮', icon: 'volley', cost: 150,
    description: '宽范围爆破覆盖敌群，但单发伤害和射程下降。', stats: '76 伤害 · 1.75 秒/炮 · 185 射程 · 105 爆炸范围' },
  'cannon-siege': { id: 'cannon-siege', towerKind: 'cannon', name: '破城重炮', icon: 'crosshair', cost: 150,
    description: '远距重炮爆炸范围较小，削减命中敌人的护甲与魔抗。', stats: '132 伤害 · 1.90 秒/炮 · 255 射程 · 44 爆炸范围 · 破甲抗 3 秒' },
  'barracks-warden': { id: 'barracks-warden', towerKind: 'barracks', name: '古树盾卫', icon: 'formation', cost: 130,
    description: '高生命和重甲，攻击较慢，擅长稳住战线。', stats: '390 生命 · 55% 护甲 · 22 伤害 · 1.00 秒/击' },
  'barracks-blade': { id: 'barracks-blade', towerKind: 'barracks', name: '逐风剑卫', icon: 'whirlwind', cost: 130,
    description: '快速高伤害近战，生命和护甲较低。', stats: '230 生命 · 28% 护甲 · 49 伤害 · 0.64 秒/击' },
};

const combat: Record<TowerBranchId, Partial<TowerStats>> = {
  'arrow-ranger': { damage: 38, rate: 0.32, range: 190 },
  'arrow-sniper': { damage: 105, rate: 1.35, range: 255 },
  'mage-arcane': { damage: 155, rate: 1.05, range: 210, slowAmount: 0.25, slowDuration: 0.9 },
  'mage-frost': { damage: 85, rate: 1.10, range: 225, slowAmount: 0.55, slowDuration: 2.1 },
  'cannon-cluster': { damage: 76, rate: 1.75, range: 185, splashRadius: 105 },
  'cannon-siege': { damage: 132, rate: 1.90, range: 255, splashRadius: 44, armorBreak: 0.18, magicBreak: 0.12, breakDuration: 3 },
  'barracks-warden': { damage: 22, rate: 1, range: 210, soldierHp: 390, soldierDamage: 22, soldierArmor: 0.55 },
  'barracks-blade': { damage: 49, rate: 0.64, range: 210, soldierHp: 230, soldierDamage: 49, soldierArmor: 0.28 },
};

export function getTowerBranch(tower: Pick<Tower, 'kind' | 'level' | 'branch'>): TowerBranchDefinition | undefined {
  if (tower.level !== 3 || !tower.branch || !Object.hasOwn(TOWER_BRANCHES, tower.branch)) return undefined;
  const branch = TOWER_BRANCHES[tower.branch];
  return branch.towerKind === tower.kind ? branch : undefined;
}

/** Branch stats exclude permanent doctrines and additive fortify specialization. */
export function getTowerCombatStats(tower: Pick<Tower, 'kind' | 'level' | 'branch'>): TowerStats {
  const base = getTowerStats(tower.kind, tower.level), branch = getTowerBranch(tower);
  return branch ? { ...base, ...combat[branch.id], name: branch.name, description: branch.description } : base;
}

export function getBranchChoiceCost(tower: Pick<Tower, 'kind' | 'level' | 'branch'>, id: TowerBranchId): number {
  const choice = TOWER_BRANCHES[id];
  if (!choice || choice.towerKind !== tower.kind || tower.level !== 3) return Infinity;
  if (tower.branch === id) return 0;
  return getTowerBranch(tower) ? Math.ceil(choice.cost / 2) : choice.cost;
}

export function getTowerInvestment(tower: Tower): number {
  let total = getTowerStats(tower.kind, 1).cost;
  for (let level = 1; level < tower.level; level++) total += getTowerStats(tower.kind, level).upgradeCost;
  for (const [kind, rank] of Object.entries(tower.abilities) as [TowerAbilityKind, number][]) {
    for (let level = 0; level < rank; level++) total += TOWER_ABILITIES[kind].costs[level];
  }
  return total + (tower.branchGoldSpent ?? 0);
}
