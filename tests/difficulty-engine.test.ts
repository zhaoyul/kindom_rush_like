import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, HERO_STATS } from '../src/data';
import { DIFFICULTIES, HARD_DIFFICULTIES, DIFFICULTY_MULTIPLIERS, isDifficulty } from '../src/difficulties';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine, DIFFICULTY_MULTIPLIERS as compatibleMultipliers } from '../src/engine';
import type { Difficulty, EnemyKind, GameSave } from '../src/types';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} should equal ${expected}`);
const hard = ['nightmare', 'inferno'] as const;
function baseSchedule(engine: GameEngine, wave: number) {
  let cursor = 0;
  return engine.level.waves[wave - 1].enemies.flatMap(group => {
    const start = group.delay ?? cursor;
    cursor = Math.max(cursor, start + group.count * group.interval);
    return Array.from({ length: group.count }, (_, index) => ({ kind: group.kind, time: start + index * group.interval }));
  }).sort((a, b) => a.time - b.time);
}
function scene(kind: EnemyKind, difficulty: Difficulty, rulesVersion: 1 | 2 = 2) {
  const engine = new GameEngine(773, 'forest', { difficulty, rulesVersion });
  assert.ok(engine.startWave().ok); engine.update(.1);
  const enemy = engine.state.enemies[0], hero = engine.state.allies[0];
  enemy.kind = kind; enemy.hp = enemy.maxHp = ENEMY_STATS[kind].hp * DIFFICULTY_MULTIPLIERS[difficulty].hp;
  enemy.progress = 350; Object.assign(enemy, engine.samplePath(enemy.progress));
  enemy.attackTimer = 0; hero.attackTimer = 5;
  hero.x = hero.targetX = enemy.x; hero.y = hero.targetY = enemy.y;
  hero.engagedWith = enemy.id; enemy.blockedBy = hero.id;
  return { engine, enemy, hero };
}
function resumeFrames(engine: GameEngine, frames: number) {
  const checkpoint = engine.exportSave(), restored = new GameEngine(999, 'marsh', { difficulty: 'normal' });
  assert.ok(restored.importSave(checkpoint).ok); assert.deepEqual(restored.exportSave(), checkpoint);
  for (let frame = 0; frame < frames; frame++) {
    engine.update(.1); restored.update(.1);
    assert.deepEqual(restored.exportSave(), engine.exportSave(), `Frame ${frame} of restored ${engine.difficulty}`);
  }
}

test('one immutable difficulty list validates all five deployments and retains the three original values', () => {
  assert.deepEqual(DIFFICULTIES, ['normal', 'veteran', 'heroic', 'nightmare', 'inferno']);
  assert.deepEqual(HARD_DIFFICULTIES, ['veteran', 'heroic', 'nightmare', 'inferno']);
  assert.equal(compatibleMultipliers, DIFFICULTY_MULTIPLIERS);
  assert.deepEqual(DIFFICULTY_MULTIPLIERS.normal, { hp: 1, damage: 1, speed: 1, spawnInterval: 1 });
  assert.deepEqual(DIFFICULTY_MULTIPLIERS.veteran, { hp: 1.25, damage: 1.12, speed: 1, spawnInterval: 1 });
  assert.deepEqual(DIFFICULTY_MULTIPLIERS.heroic, { hp: 1.5, damage: 1.2, speed: 1, spawnInterval: 1 });
  assert.ok(Object.isFrozen(DIFFICULTIES) && Object.isFrozen(HARD_DIFFICULTIES) && Object.isFrozen(DIFFICULTY_MULTIPLIERS));
  for (const difficulty of DIFFICULTIES) { assert.ok(isDifficulty(difficulty)); assert.ok(Object.isFrozen(DIFFICULTY_MULTIPLIERS[difficulty])); }
  for (const unknown of ['toString', '__proto__', 'legendary', '', 3, {}, undefined]) assert.equal(isDifficulty(unknown), false);
  assert.throws(() => new GameEngine(1, 'forest', { difficulty: 'legendary' as Difficulty }), /未知难度/);
});

for (const difficulty of DIFFICULTIES) test(`${difficulty} scales every absolute spawn time, preserves roster and admits its unmodified checkpoint`, () => {
  for (const levelId of ['forest', 'marsh', 'frost', 'volcano'] as const) {
    const engine = new GameEngine(921, levelId, { difficulty });
    for (let wave = 1; wave <= engine.level.waves.length; wave++) {
      // Scheduling isolation: finishing this scene avoids simulating an unrelated defense.
      if (wave > 1) { engine.state.phase = 'intermission'; engine.state.enemies = []; engine.state.spawnQueue = []; }
      assert.ok(engine.startWave().ok);
      const expected = baseSchedule(engine, wave).map(spawn => ({ ...spawn, time: spawn.time * DIFFICULTY_MULTIPLIERS[difficulty].spawnInterval }));
      assert.deepEqual(engine.state.spawnQueue, expected);
      const restored = new GameEngine(); assert.ok(restored.importSave(engine.exportSave()).ok);
      assert.deepEqual(restored.state.spawnQueue, expected); assert.equal(restored.difficulty, difficulty);
    }
  }
});

test('compressed scheduling creates more real simultaneous enemies before the same clock time', () => {
  const normal = new GameEngine(82, 'marsh'), inferno = new GameEngine(82, 'marsh', { difficulty: 'inferno' });
  normal.startWave(); inferno.startWave(); normal.update(10); inferno.update(10);
  assert.equal(normal.state.enemies.length, 9); assert.equal(inferno.state.enemies.length, 11);
  assert.equal(normal.state.enemies.length + normal.state.spawnQueue.length, 14);
  assert.equal(inferno.state.enemies.length + inferno.state.spawnQueue.length, 14);
  assert.ok(inferno.state.enemies[0].progress > normal.state.enemies[0].progress);
  close(inferno.state.spawnQueue.at(-1)!.time, normal.state.spawnQueue.at(-1)!.time * .78);
  assert.equal(inferno.state.report!.waves[0].peakEnemies, 11);
});

for (const difficulty of hard) test(`${difficulty} produces the actual walking, HP, melee, bounty and poison pressure`, () => {
  const moving = new GameEngine(32, 'forest', { difficulty }); moving.startWave(); moving.update(.1);
  const first = moving.state.enemies[0], before = first.progress;
  moving.update(.1);
  close(first.progress - before, ENEMY_STATS.goblin.speed * DIFFICULTY_MULTIPLIERS[difficulty].speed * .1);
  close(first.maxHp, ENEMY_STATS.goblin.hp * DIFFICULTY_MULTIPLIERS[difficulty].hp);
  first.slowAmount = .5; first.slowTimer = 2;
  const slowedAt = first.progress; moving.update(.1);
  close(first.progress - slowedAt, ENEMY_STATS.goblin.speed * DIFFICULTY_MULTIPLIERS[difficulty].speed * .5 * .1);
  first.rootTimer = 1; const rootedAt = first.progress; moving.update(.1); assert.equal(first.progress, rootedAt);
  const { engine, enemy, hero } = scene('serpent', difficulty);
  engine.update(.01);
  close(hero.hp, HERO_STATS.hp - ENEMY_STATS.serpent.damage * DIFFICULTY_MULTIPLIERS[difficulty].damage * .7);
  close(hero.poisonDamage!, 4 * DIFFICULTY_MULTIPLIERS[difficulty].damage);
  const hp = hero.hp; enemy.attackTimer = 4; engine.update(.1);
  close(hero.hp, hp - 4 * DIFFICULTY_MULTIPLIERS[difficulty].damage * .1);
  const gold = engine.state.gold; enemy.hp = 0; engine.update(.01);
  assert.equal(engine.state.gold, gold + ENEMY_STATS.serpent.gold);
});

for (const difficulty of hard) test(`${difficulty} keeps venom and telegraphed Boss damage identical after frame-by-frame checkpoint recovery`, () => {
  const poisoned = scene('serpent', difficulty); poisoned.engine.update(.01);
  resumeFrames(poisoned.engine, 20);
  const boss = scene('juggernaut', difficulty); boss.enemy.bossCooldown = 0; boss.enemy.bossRecover = 0;
  boss.engine.update(.01); assert.ok(boss.enemy.bossCast); boss.engine.update(.7);
  const hp = boss.hero.hp; resumeFrames(boss.engine, 17);
  close(boss.hero.hp, hp - 148 * DIFFICULTY_MULTIPLIERS[difficulty].damage * .7);
  assert.equal(boss.enemy.bossCast, undefined);
});

for (const difficulty of hard) test(`${difficulty} applies its damage multiplier to imp bursts and juggernaut splash`, () => {
  const burst = scene('imp', difficulty); burst.enemy.hp = 0; burst.engine.update(.01);
  close(burst.hero.hp, HERO_STATS.hp - 24 * DIFFICULTY_MULTIPLIERS[difficulty].damage);
  const splash = scene('juggernaut', difficulty, 1);
  assert.ok(splash.engine.castSkill('reinforce', splash.enemy.x, splash.enemy.y).ok);
  const helpers = splash.engine.state.allies.filter(ally => ally.type === 'reinforcement');
  splash.engine.update(.01);
  close(splash.hero.hp, HERO_STATS.hp - ENEMY_STATS.juggernaut.damage * DIFFICULTY_MULTIPLIERS[difficulty].damage * .7);
  for (const helper of helpers) close(helper.hp, 185 - 22 * DIFFICULTY_MULTIPLIERS[difficulty].damage * .75);
});

for (const difficulty of hard) test(`${difficulty} overlapping early waves retain density, report times, bounded reward and the original deployment`, () => {
  const engine = new GameEngine(717, 'forest', { difficulty, upgrades: deriveBattleUpgrades({ guardian: 3, focus: 3 }) });
  engine.startWave(); engine.update(engine.state.spawnQueue.at(-1)!.time + .1);
  assert.equal(engine.state.spawnQueue.length, 0); assert.equal(engine.canCallEarlyWave, true);
  const oldIds = engine.state.enemies.map(enemy => enemy.id), time = engine.state.time;
  const foe = engine.state.enemies[0];
  foe.progress = engine.pathLength - ENEMY_STATS[foe.kind].speed * DIFFICULTY_MULTIPLIERS[difficulty].speed * 9.9;
  Object.assign(foe, engine.samplePath(foe.progress));
  const expected = Math.min(25, Math.floor(Math.max(...engine.state.enemies.map(enemy => (engine.pathLength - enemy.progress) / (ENEMY_STATS[enemy.kind].speed * DIFFICULTY_MULTIPLIERS[difficulty].speed))) * .5));
  assert.equal(engine.earlyWaveBonus, expected);
  assert.ok(engine.castSkill('reinforce', foe.x, foe.y).ok);
  const cooldown = engine.state.skillCooldowns.reinforce;
  assert.ok(engine.callEarlyWave().ok); assert.equal(engine.state.wave, 2); assert.equal(engine.state.waveElapsed, 0);
  assert.deepEqual(engine.state.enemies.map(enemy => enemy.id), oldIds);
  assert.deepEqual(engine.state.spawnQueue, baseSchedule(engine, 2).map(spawn => ({ ...spawn, time: spawn.time * DIFFICULTY_MULTIPLIERS[difficulty].spawnInterval })));
  close(engine.state.skillCooldowns.reinforce, cooldown - 4);
  assert.equal(engine.state.report!.waves[0].endedAt, time); assert.equal(engine.state.report!.waves[1].startedAt, time);
  resumeFrames(engine, 30);
  assert.equal(engine.difficulty, difficulty); assert.equal(engine.upgrades.heroHpMultiplier, 1.18);
  close(engine.upgrades.skillCooldownMultiplier, .88);
});

test('checkpoint import rejects changing an ongoing difficulty, roster HP or compressed timeline atomically', () => {
  const original = new GameEngine(172, 'forest', { difficulty: 'inferno' }); original.startWave(); original.update(1);
  const checkpoint = original.exportSave(), receiver = new GameEngine(9, 'marsh'); receiver.build(1, 'mage'); const before = receiver.exportSave();
  const corruptions: ((save: GameSave) => void)[] = [
    save => { save.difficulty = 'nightmare'; }, save => { save.difficulty = 'normal'; },
    save => { save.difficulty = 'legendary' as Difficulty; }, save => { delete save.difficulty; },
    save => { save.state.spawnQueue[0].time /= DIFFICULTY_MULTIPLIERS.inferno.spawnInterval; },
    save => { save.state.enemies[0].maxHp = ENEMY_STATS.goblin.hp; },
  ];
  for (const corrupt of corruptions) { const copy = structuredClone(checkpoint); corrupt(copy); assert.equal(receiver.importSave(copy).ok, false); assert.deepEqual(receiver.exportSave(), before); }
  assert.throws(() => { (original as unknown as { difficulty: Difficulty }).difficulty = 'normal'; }, TypeError);
  assert.equal(original.difficulty, 'inferno');
});

test('legacy deployments still restore without new fields and retain their exact original schedule', () => {
  for (const difficulty of ['normal', 'veteran', 'heroic'] as const) {
    const engine = new GameEngine(212, 'forest', { difficulty, rulesVersion: 1 }); engine.build(1, 'arrow'); engine.startWave(); engine.update(2);
    const save = engine.exportSave(); delete save.rulesVersion;
    const restored = new GameEngine(9, 'volcano', { difficulty: 'inferno' }); assert.ok(restored.importSave(save).ok);
    assert.equal(restored.rulesVersion, 1); assert.equal(restored.difficulty, difficulty);
    for (let frame = 0; frame < 30; frame++) { engine.update(.1); restored.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave()); }
  }
});
