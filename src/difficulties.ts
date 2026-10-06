import type { Difficulty } from './types';

/** Order is shared by deployment controls, campaign records and checkpoint validation. */
export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['normal', 'veteran', 'heroic', 'nightmare', 'inferno']);
export const HARD_DIFFICULTIES: readonly Exclude<Difficulty, 'normal'>[] = Object.freeze(['veteran', 'heroic', 'nightmare', 'inferno']);

export interface DifficultyMultipliers {
  readonly hp: number;
  readonly damage: number;
  readonly speed: number;
  /** Scales the whole wave schedule, including each group's delay. */
  readonly spawnInterval: number;
}

/** The first three deployments keep their original combat values and scheduling. */
export const DIFFICULTY_MULTIPLIERS: Readonly<Record<Difficulty, Readonly<DifficultyMultipliers>>> = Object.freeze({
  normal: Object.freeze({ hp: 1, damage: 1, speed: 1, spawnInterval: 1 }),
  veteran: Object.freeze({ hp: 1.25, damage: 1.12, speed: 1, spawnInterval: 1 }),
  heroic: Object.freeze({ hp: 1.5, damage: 1.2, speed: 1, spawnInterval: 1 }),
  nightmare: Object.freeze({ hp: 1.8, damage: 1.32, speed: 1.06, spawnInterval: .9 }),
  inferno: Object.freeze({ hp: 2.1, damage: 1.5, speed: 1.12, spawnInterval: .78 }),
});

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_MULTIPLIERS, value);
}
