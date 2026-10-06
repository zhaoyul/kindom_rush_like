import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from '../src/data';
import { DIFFICULTIES } from '../src/difficulties';
import { GameEngine } from '../src/engine';
import { analyzeWave, getLevelTactics } from '../src/tactical-guide';
import type { LevelDefinition } from '../src/types';

test('opening-wave intelligence matches the actual deployment queue at every difficulty', () => {
  for (const level of LEVELS) for (const difficulty of DIFFICULTIES) {
    const engine = new GameEngine(123, level.id, { difficulty });
    assert.ok(engine.startWave().ok);
    const intel = analyzeWave(engine.level, 0, difficulty)!;
    assert.equal(intel.enemyCount, engine.state.spawnQueue.length, `${level.id}/${difficulty}`);
    assert.equal(intel.spawnDuration, Math.ceil(engine.state.spawnQueue.at(-1)!.time), `${level.id}/${difficulty}`);
    const ordinary = analyzeWave(level, 0)!;
    assert.equal(intel.bounty, ordinary.bounty);
    assert.equal(intel.totalBaseHp, ordinary.totalBaseHp);
    assert.ok(intel.peakSpawnCount >= ordinary.peakSpawnCount);
    assert.deepEqual(getLevelTactics(level, difficulty).firstWave, intel);
  }
});

test('denser high-difficulty arrivals produce swarm advice without inventing additional enemies', () => {
  const level: LevelDefinition = { ...LEVELS[0], waves: [{ name: 'Dense arrivals', description: '', enemies: [
    { kind: 'goblin', count: 8, interval: .95 },
  ] }] };
  const ordinary = analyzeWave(level, 0)!;
  const inferno = analyzeWave(level, 0, 'inferno')!;
  assert.equal(ordinary.peakSpawnCount, 4);
  assert.ok(inferno.peakSpawnCount >= 5);
  assert.ok(!ordinary.tags.includes('swarm'));
  assert.ok(inferno.tags.includes('swarm'));
  assert.ok(inferno.recommendedTowers.includes('cannon'));
  assert.equal(inferno.enemyCount, ordinary.enemyCount);
  assert.equal(inferno.bounty, ordinary.bounty);
});

test('compressed fast flanks stop claiming a separate reserve window when the gap falls below two seconds', () => {
  const level: LevelDefinition = { ...LEVELS[0], waves: [{ name: 'Closing gap', description: '', enemies: [
    { kind: 'wolf', count: 5, interval: 1, delay: 0 },
    { kind: 'icewolf', count: 1, interval: 1, delay: 6 },
  ] }] };
  const ordinary = analyzeWave(level, 0)!;
  assert.equal(ordinary.fastArrivalBatches, 2);
  assert.ok(ordinary.warnings.some(warning => warning.includes('后续突袭')));
  const inferno = analyzeWave(level, 0, 'inferno')!;
  assert.equal(inferno.fastArrivalBatches, 1);
  assert.ok(!inferno.warnings.some(warning => warning.includes('后续突袭')));
});

test('the original three difficulties keep the same forecast and input wave definitions', () => {
  for (const level of LEVELS) {
    const before = structuredClone(level);
    for (let index = 0; index < level.waves.length; index++) {
      const original = analyzeWave(level, index)!;
      for (const difficulty of ['normal', 'veteran', 'heroic'] as const) assert.deepEqual(analyzeWave(level, index, difficulty), original);
      for (const difficulty of ['nightmare', 'inferno'] as const) analyzeWave(level, index, difficulty);
    }
    assert.deepEqual(level, before);
  }
});
