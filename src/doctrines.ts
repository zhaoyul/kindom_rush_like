/** Permanent training bought with the campaign's best stars, one star per rank. */
export type DoctrineId = 'marksman' | 'bulwark' | 'guardian' | 'focus';
export type DoctrineRanks = Partial<Record<DoctrineId, number>>;
export interface BattleUpgrades {
  rangedDamageMultiplier: number;
  soldierHpMultiplier: number;
  heroHpMultiplier: number;
  skillCooldownMultiplier: number;
}
export interface DoctrineDefinition {
  id: DoctrineId;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  icon: string;
  maxRank: number;
  cost: number;
  effect: { stat: keyof BattleUpgrades; perRank: number };
}
export const DOCTRINES: Record<DoctrineId, DoctrineDefinition> = {
  marksman: {
    id: 'marksman', name: '精准射击', nameEn: 'Marksman Training',
    description: '箭塔、魔法塔与炮塔的攻击伤害每阶提高 4%。',
    descriptionEn: 'Arrow, mage and cannon tower damage increases by 4% per rank.',
    icon: 'arrow', maxRank: 3, cost: 1,
    effect: { stat: 'rangedDamageMultiplier', perRank: .04 },
  },
  bulwark: {
    id: 'bulwark', name: '坚实防线', nameEn: 'Bulwark Training',
    description: '兵营驻兵的最大生命每阶提高 6%。',
    descriptionEn: 'Barracks soldier maximum health increases by 6% per rank.',
    icon: 'shield', maxRank: 3, cost: 1,
    effect: { stat: 'soldierHpMultiplier', perRank: .06 },
  },
  guardian: {
    id: 'guardian', name: '守林之心', nameEn: 'Guardian Training',
    description: '英雄的最大生命每阶提高 6%。',
    descriptionEn: 'Hero maximum health increases by 6% per rank.',
    icon: 'heart', maxRank: 3, cost: 1,
    effect: { stat: 'heroHpMultiplier', perRank: .06 },
  },
  focus: {
    id: 'focus', name: '专注施法', nameEn: 'Focused Casting',
    description: '援军、陨石与全部英雄主动技能的冷却时间每阶缩短 4%。',
    descriptionEn: 'Reinforcement, meteor and all active hero skill cooldowns decrease by 4% per rank.',
    icon: 'clock', maxRank: 3, cost: 1,
    effect: { stat: 'skillCooldownMultiplier', perRank: -.04 },
  },
};

/** Bad or unknown save entries never turn into a combat bonus. */
export function sanitizeDoctrineRanks(value: unknown): DoctrineRanks {
  const ranks: DoctrineRanks = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ranks;
  const source = value as Record<string, unknown>;
  for (const doctrine of Object.values(DOCTRINES)) {
    if (!Object.hasOwn(source, doctrine.id)) continue;
    const rank = source[doctrine.id];
    if (typeof rank === 'number' && Number.isInteger(rank) && rank > 0 && rank <= doctrine.maxRank) ranks[doctrine.id] = rank;
  }
  return ranks;
}

/** A deployment takes a copy of these values; changing training does not alter it. */
export function deriveBattleUpgrades(ranks: DoctrineRanks = {}): BattleUpgrades {
  const upgrades: BattleUpgrades = {
    rangedDamageMultiplier: 1, soldierHpMultiplier: 1,
    heroHpMultiplier: 1, skillCooldownMultiplier: 1,
  };
  const validRanks = sanitizeDoctrineRanks(ranks);
  for (const doctrine of Object.values(DOCTRINES)) {
    upgrades[doctrine.effect.stat] += doctrine.effect.perRank * (validRanks[doctrine.id] ?? 0);
  }
  return upgrades;
}
