import { ENEMY_STATS } from './data';
import { getTowerBranch } from './tower-branches';
import type { BattleReport, GameState, LevelDefinition, TowerBattleReport, WaveBattleReport } from './types';

export function createBattleReport(state: Pick<GameState, 'time' | 'towers'>, partial = false): BattleReport {
  return { version: 1, partial, startedAt: state.time, totalDamage: 0, totalKills: 0,
    towers: state.towers.map(tower => ({ id: tower.id, kind: tower.kind, slotId: tower.slotId, level: tower.level,
      ...(tower.branch ? { branch: tower.branch } : {}), builtAt: state.time, ...(partial ? { existingAtStart: true } : {}), damage: 0, kills: 0 })),
    hero: { damage: 0, kills: 0, deaths: 0, bossInterrupts: 0 }, support: { damage: 0, kills: 0 },
    soldierDeaths: 0, mapActivations: 0, leaks: {}, waves: [] };
}

export function getTopTowers(report: BattleReport, limit = 3): TowerBattleReport[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(report.towers.length, Math.floor(limit))) : 0;
  return [...report.towers].sort((a, b) => b.damage - a.damage || b.kills - a.kills || a.id - b.id).slice(0, count).map(tower => ({ ...tower }));
}

export function getMostDangerousWave(report: BattleReport): WaveBattleReport | null {
  const wave = [...report.waves].sort((a, b) => b.livesLost - a.livesLost || b.furthestProgress - a.furthestProgress || b.peakEnemies - a.peakEnemies || a.wave - b.wave)[0];
  return wave ? { ...wave } : null;
}

export function summarizeBattleReport(report: BattleReport, pathLength: number) {
  const leaked = Object.values(report.leaks).reduce((sum, entry) => ({ count: sum.count + entry!.count, lives: sum.lives + entry!.lives }), { count: 0, lives: 0 });
  const mostDangerousWave = getMostDangerousWave(report);
  return { partial: report.partial, startedAt: report.startedAt, totalDamage: report.totalDamage, totalKills: report.totalKills,
    hero: { ...report.hero }, soldierDeaths: report.soldierDeaths, mapActivations: report.mapActivations,
    leakedEnemies: leaked.count, livesLost: leaked.lives, topTowers: getTopTowers(report), mostDangerousWave,
    furthestRatio: mostDangerousWave && Number.isFinite(pathLength) && pathLength > 0 ? Math.max(0, Math.min(1, mostDangerousWave.furthestProgress / pathLength)) : 0 };
}

/** Check evidence consistency without changing either the report or the checkpoint. */
export function isValidBattleReport(value: unknown, state: GameState, level: LevelDefinition, nextId: number): value is BattleReport {
  const object = (item: unknown): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item);
  const number = (item: unknown, maximum = 1e9): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= maximum;
  const integer = (item: unknown, maximum = 1e7): item is number => number(item, maximum) && Number.isInteger(item);
  const same = (a: number, b: number) => Math.abs(a - b) <= .00001;
  if (!object(value) || value.version !== 1 || typeof value.partial !== 'boolean' || !number(value.startedAt, state.time)
    || !number(value.totalDamage, state.stats.damageDealt + .00001) || !integer(value.totalKills, state.kills)
    || !Array.isArray(value.towers) || value.towers.length > 10000 || !Array.isArray(value.waves) || value.waves.length > level.waves.length
    || !object(value.hero) || !object(value.support) || !object(value.leaks)
    || !integer(value.soldierDeaths) || !integer(value.mapActivations)) return false;
  if (!number(value.hero.damage, value.totalDamage) || !integer(value.hero.kills, value.totalKills) || !integer(value.hero.deaths)
    || !integer(value.hero.bossInterrupts) || !number(value.support.damage, value.totalDamage) || !integer(value.support.kills, value.totalKills)) return false;
  const ids = new Set<number>();
  let damage = value.hero.damage + value.support.damage, kills = value.hero.kills + value.support.kills;
  for (const tower of value.towers) {
    if (!object(tower) || !integer(tower.id, nextId - 1) || tower.id < 1 || ids.has(tower.id)
      || !['arrow', 'mage', 'cannon', 'barracks'].includes(tower.kind) || !integer(tower.level, 3) || tower.level < 1
      || !level.slots.some(slot => slot.id === tower.slotId) || !number(tower.builtAt, state.time) || tower.builtAt < value.startedAt
      || !(tower.existingAtStart === undefined || typeof tower.existingAtStart === 'boolean')
      || !(tower.soldAt === undefined || number(tower.soldAt, state.time) && tower.soldAt >= tower.builtAt)
      || !number(tower.damage, value.totalDamage) || !integer(tower.kills, value.totalKills)) return false;
    if (tower.branch !== undefined && !getTowerBranch(tower as any)) return false;
    if (tower.existingAtStart && !value.partial) return false;
    ids.add(tower.id); damage += tower.damage; kills += tower.kills;
    const active = state.towers.find(candidate => candidate.id === tower.id);
    if (active ? tower.soldAt !== undefined || active.kind !== tower.kind || active.slotId !== tower.slotId || active.level !== tower.level || active.branch !== tower.branch : tower.soldAt === undefined) return false;
  }
  if (state.towers.some(tower => !ids.has(tower.id)) || !same(damage, value.totalDamage) || kills !== value.totalKills) return false;
  let lives = 0;
  for (const [kind, leaked] of Object.entries(value.leaks)) {
    if (!Object.hasOwn(ENEMY_STATS, kind) || !object(leaked) || !integer(leaked.count) || !leaked.count
      || !integer(leaked.lives, level.lives) || leaked.lives > leaked.count * ENEMY_STATS[kind as keyof typeof ENEMY_STATS].lives) return false;
    lives += leaked.lives;
  }
  if (lives > level.lives - state.lives) return false;
  let waveNumber = 0, lastTime = value.startedAt, waveLives = 0, waveDamage = 0, waveKills = 0;
  for (const wave of value.waves) {
    if (!object(wave) || !integer(wave.wave, state.wave) || wave.wave <= waveNumber || !number(wave.startedAt, state.time) || wave.startedAt < lastTime
      || !(wave.endedAt === undefined || number(wave.endedAt, state.time) && wave.endedAt >= wave.startedAt)
      || !integer(wave.peakEnemies, 600) || !number(wave.furthestProgress, level.pathLength + .00001)
      || !integer(wave.livesLost, level.lives) || !number(wave.damage, value.totalDamage) || !integer(wave.kills, value.totalKills)) return false;
    waveNumber = wave.wave; lastTime = wave.endedAt ?? wave.startedAt;
    waveLives += wave.livesLost; waveDamage += wave.damage; waveKills += wave.kills;
  }
  return waveLives === lives && waveDamage <= value.totalDamage + .00001 && waveKills <= value.totalKills;
}
