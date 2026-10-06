import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerStats, HERO_STATS, SKILLS } from '../src/data';
import { deriveBattleUpgrades } from '../src/doctrines';
import { DIFFICULTY_MULTIPLIERS, GameEngine } from '../src/engine';
import type { Difficulty, Enemy, EnemyKind, TowerAbilityKind, TowerKind, TowerPriority } from '../src/types';

let nextEnemyId = 100_000;
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
function enemy(engine: GameEngine, kind: EnemyKind, progress: number, hp = ENEMY_STATS[kind].hp): Enemy {
  return { id: nextEnemyId++, kind, ...engine.samplePath(progress), progress, hp, maxHp: hp,
    blockedBy: null, attackTimer: 0.5, slowTimer: 0, hitTimer: 0 };
}
function targetScenario(kind: TowerKind, priority: TowerPriority): { engine: GameEngine; first: Enemy; strong: Enemy; weak: Enemy } {
  const engine = new GameEngine();
  engine.build(0, kind);
  const tower = engine.state.towers[0], progress = engine.nearestPathPoint(tower).progress;
  const first = enemy(engine, 'goblin', progress + 20, 700);
  const strong = enemy(engine, 'goblin', progress, 900);
  const weak = enemy(engine, 'goblin', progress - 20, 300);
  engine.state.enemies = [weak, strong, first];
  engine.startWave();
  engine.state.spawnQueue = [{ kind: 'goblin', time: 1000 }];
  assert.ok(engine.setTowerPriority(tower.id, priority).ok);
  return { engine, first, strong, weak };
}

test('arrow, mage and cannon select first, current strongest and current weakest within range', () => {
  for (const kind of ['arrow', 'mage', 'cannon'] as TowerKind[]) for (const priority of ['first', 'strong', 'weak'] as TowerPriority[]) {
    const { engine, first, strong, weak } = targetScenario(kind, priority), tower = engine.state.towers[0];
    // Maximum HP and array order cannot masquerade as current HP priority.
    weak.maxHp = 5000;
    const outside = enemy(engine, 'golem', engine.pathLength - 1, 9999);
    const dead = enemy(engine, 'goblin', strong.progress + 1, 0);
    engine.state.enemies.unshift(outside, dead);
    const expected = { first, strong, weak }[priority];
    engine.update(0.001);
    const projectile = engine.state.effects.find(effect => effect.sourceId === tower.id && ['arrow', 'bolt', 'shell'].includes(effect.type));
    assert.equal(projectile?.targetId, expected.id, `${kind}/${priority}`);
  }
});

test('equal HP targets use exit progress then stable entity ID, regardless of array ordering', () => {
  for (const priority of ['first', 'strong', 'weak'] as TowerPriority[]) {
    const { engine, first, strong, weak } = targetScenario('arrow', priority);
    for (const candidate of [first, strong, weak]) candidate.hp = 500;
    const tied = { ...first, id: first.id + 999 };
    engine.state.enemies = [tied, weak, first, strong];
    engine.update(0.001);
    assert.equal(engine.state.effects.find(effect => effect.type === 'arrow')?.targetId, first.id);
  }
});

test('ranged area specialties and the first chain jump use the tower current strategy', () => {
  const branches: [TowerKind, TowerAbilityKind, string][] = [
    ['arrow', 'arrow-volley', 'ring'], ['mage', 'mage-chain', 'chain'], ['mage', 'mage-frost', 'frost-zone'],
    ['cannon', 'cannon-cluster', 'explosion'], ['cannon', 'cannon-quake', 'ring'],
  ];
  for (const [kind, ability, effectType] of branches) {
    const { engine, weak } = targetScenario(kind, 'weak'), tower = engine.state.towers[0];
    tower.level = 3;
    tower.abilities[ability] = 1;
    tower.abilityTimers[ability] = 0;
    const point = { x: weak.x, y: weak.y };
    engine.update(0.001);
    const effect = engine.state.effects.find(effect => effect.style === ability && effect.type === effectType)!;
    assert.ok(effect, ability);
    assert.deepEqual(effectType === 'chain' ? effect.points?.[1] : { x: effect.x, y: effect.y }, point, ability);
  }
});

test('priority changes reject missing towers, invalid modes, barracks and ended battles transactionally', () => {
  const engine = new GameEngine();
  engine.build(0, 'arrow'); engine.build(1, 'barracks');
  const [arrow, barracks] = engine.state.towers;
  assert.equal(arrow.targetPriority, 'first');
  assert.equal(engine.setTowerPriority(99999, 'strong').ok, false);
  assert.equal(engine.setTowerPriority(arrow.id, 'unknown' as TowerPriority).ok, false);
  assert.equal(engine.setTowerPriority(barracks.id, 'weak').ok, false);
  assert.equal(arrow.targetPriority, 'first');
  engine.state.phase = 'victory';
  assert.equal(engine.setTowerPriority(arrow.id, 'weak').ok, false);
  assert.equal(arrow.targetPriority, 'first');
});

test('a chosen tower strategy survives saving, resuming and tier upgrades with the same future attacks', () => {
  const original = new GameEngine(317);
  original.build(0, 'arrow');
  const tower = original.state.towers[0];
  original.setTowerPriority(tower.id, 'weak'); original.startWave(); original.update(1);
  const save = original.exportSave(), restored = new GameEngine(7, 'volcano', { difficulty: 'heroic' });
  assert.ok(restored.importSave(save).ok);
  assert.equal(restored.state.towers[0].targetPriority, 'weak');
  original.update(2); restored.update(2);
  assert.deepEqual(restored.exportSave(), original.exportSave());
  original.state.gold = 1000; original.upgrade(tower.id);
  assert.equal(tower.targetPriority, 'weak');
});

function readyEarlyWave(): GameEngine {
  const engine = new GameEngine(9182);
  engine.startWave();
  const last = engine.state.spawnQueue.at(-1)!.time;
  engine.update(last + 0.01);
  assert.equal(engine.state.spawnQueue.length, 0);
  assert.ok(engine.state.enemies.length);
  return engine;
}

test('early waves require finished spawning, living pressure and another wave, and invalid calls leave the save intact', () => {
  const engine = new GameEngine();
  for (const setup of [
    () => {},
    () => { engine.startWave(); },
    () => { engine.state.spawnQueue = []; engine.state.enemies = []; },
    () => { engine.state.enemies = [enemy(engine, 'goblin', 0)]; engine.state.wave = engine.level.waves.length; },
    () => { engine.state.wave = 1; engine.state.phase = 'defeat'; engine.state.lives = 0; },
  ]) {
    setup();
    const before = engine.exportSave();
    assert.equal(engine.getEarlyWaveOffer().available, false);
    assert.equal(engine.callEarlyWave().ok, false);
    assert.deepEqual(engine.exportSave(), before);
  }
});

test('early wave preview gives bounded base-speed reward and one cooldown reduction without replacing old enemies', () => {
  const engine = readyEarlyWave(), oldIds = engine.state.enemies.map(foe => foe.id);
  const seconds = Math.max(...engine.state.enemies.map(foe => (engine.pathLength - foe.progress) / ENEMY_STATS[foe.kind].speed));
  const expectedGold = Math.min(25, Math.floor(seconds * .5));
  assert.deepEqual(engine.getEarlyWaveOffer(), { available: true, gold: expectedGold, cooldownReduction: 4 });
  assert.equal(engine.canCallEarlyWave, true); assert.equal(engine.earlyWaveBonus, expectedGold);
  engine.state.skillCooldowns.meteor = 8;
  engine.state.skillCooldowns.reinforce = 2;
  const gold = engine.state.gold, earned = engine.state.stats.goldEarned;
  assert.ok(engine.callEarlyWave().ok);
  assert.equal(engine.state.wave, 2); assert.equal(engine.state.waveElapsed, 0);
  assert.deepEqual(engine.state.enemies.map(foe => foe.id), oldIds);
  assert.ok(engine.state.spawnQueue.length);
  assert.equal(engine.state.gold, gold + 30 + expectedGold);
  assert.equal(engine.state.stats.goldEarned, earned + 30 + expectedGold);
  assert.equal(engine.state.stats.earlyWavesCalled, 1); assert.equal(engine.state.stats.earlyWaveGold, expectedGold);
  assert.equal(engine.state.skillCooldowns.meteor, 4); assert.equal(engine.state.skillCooldowns.reinforce, 0);
  const after = engine.exportSave();
  assert.equal(engine.callEarlyWave().ok, false);
  assert.deepEqual(engine.exportSave(), after);
  engine.update(.001);
  assert.ok(oldIds.every(id => engine.state.enemies.some(foe => foe.id === id)));
  assert.ok(engine.state.enemies.some(foe => !oldIds.includes(foe.id)));
});

test('blocking and control cannot increase early rewards; the reward cap and near-exit floor are exact', () => {
  const engine = readyEarlyWave(), foe = engine.state.enemies[0];
  engine.state.enemies = [foe];
  foe.progress = engine.pathLength - ENEMY_STATS[foe.kind].speed * 9.9;
  assert.equal(engine.earlyWaveBonus, 4);
  foe.rootTimer = 2.5; foe.slowTimer = 10; foe.slowAmount = .9; foe.blockedBy = 123;
  assert.equal(engine.earlyWaveBonus, 4);
  foe.kind = 'golem'; foe.progress = 0;
  assert.equal(engine.earlyWaveBonus, 25);
  foe.progress = engine.pathLength - 1;
  assert.equal(engine.earlyWaveBonus, 0);
});

test('each overlapping wave earns supply once, final victory waits for every enemy, and resume keeps that accounting', () => {
  const engine = readyEarlyWave();
  engine.callEarlyWave();
  const restored = new GameEngine();
  assert.ok(restored.importSave(engine.exportSave()).ok);
  assert.deepEqual(restored.exportSave(), engine.exportSave());
  const old = new Set(engine.state.enemies.map(foe => foe.id));
  // Keeping one old enemy alive prevents an empty next queue from ending combat.
  for (const simulation of [engine, restored]) {
    simulation.update(simulation.state.spawnQueue.at(-1)!.time + .01);
    simulation.state.enemies.filter(foe => !old.has(foe.id)).forEach(foe => foe.hp = 0);
    simulation.update(.001);
    assert.equal(simulation.state.phase, 'battle');
    const gold = simulation.state.gold;
    simulation.state.enemies.forEach(foe => foe.hp = 0);
    const bounty = simulation.state.enemies.reduce((sum, foe) => sum + ENEMY_STATS[foe.kind].gold, 0);
    simulation.update(.001);
    assert.equal(simulation.state.phase, 'intermission');
    assert.equal(simulation.state.gold, gold + bounty + 35);
    const settled = simulation.state.gold;
    simulation.update(1);
    assert.equal(simulation.state.gold, settled);
  }
  assert.deepEqual(restored.exportSave(), engine.exportSave());
  while (engine.state.wave < engine.level.waves.length) { engine.startWave(); engine.state.spawnQueue = []; engine.state.enemies = []; engine.update(.001); }
  assert.equal(engine.state.phase, 'victory');
  assert.equal(engine.callEarlyWave().ok, false);
});

test('normal is unchanged, other difficulties scale enemy HP and every melee hit but keep kill gold and wave count', () => {
  for (const difficulty of ['normal', 'veteran', 'heroic'] as Difficulty[]) {
    const engine = new GameEngine(123, 'forest', { difficulty }), multiplier = DIFFICULTY_MULTIPLIERS[difficulty];
    engine.startWave();
    const spawnCount = engine.state.spawnQueue.length;
    engine.update(.001);
    const foe = engine.state.enemies[0], hero = engine.state.allies[0];
    close(foe.maxHp, ENEMY_STATS[foe.kind].hp * multiplier.hp);
    assert.equal(spawnCount, new GameEngine().level.waves[0].enemies.reduce((sum, group) => sum + group.count, 0));
    hero.damage = 0; hero.x = hero.targetX = foe.x; hero.y = hero.targetY = foe.y;
    hero.engagedWith = foe.id; foe.blockedBy = hero.id; foe.attackTimer = 0;
    engine.update(.001);
    close(hero.hp, HERO_STATS.hp - ENEMY_STATS[foe.kind].damage * multiplier.damage * (1 - hero.armor));
    const gold = engine.state.gold, reward = ENEMY_STATS[foe.kind].gold;
    foe.hp = 0;
    engine.update(.001);
    assert.equal(engine.state.gold, gold + reward);
  }
});

test('difficulty also scales venom, juggernaut splash and imp death bursts', () => {
  const difficulty: Difficulty = 'heroic', scale = DIFFICULTY_MULTIPLIERS[difficulty].damage;
  const poison = new GameEngine(1, 'marsh', { difficulty });
  poison.startWave(); poison.state.spawnQueue = [{ kind: 'bogling', time: 1000 }];
  const hero = poison.state.allies[0], serpent = enemy(poison, 'serpent', poison.nearestPathPoint(hero).progress, 1000);
  hero.damage = 0; hero.x = hero.targetX = serpent.x; hero.y = hero.targetY = serpent.y;
  hero.engagedWith = serpent.id; serpent.blockedBy = hero.id; serpent.attackTimer = 0;
  poison.state.enemies = [serpent]; poison.update(.001);
  close(hero.poisonDamage!, 4 * scale);
  const hp = hero.hp; serpent.attackTimer = 4;
  poison.update(.1);
  close(hero.hp, hp - 4 * scale * .1);

  const burst = new GameEngine(1, 'volcano', { difficulty });
  burst.startWave(); burst.state.spawnQueue = [{ kind: 'imp', time: 1000 }];
  const guard = burst.state.allies[0], imp = enemy(burst, 'imp', burst.nearestPathPoint(guard).progress, 0);
  guard.x = guard.targetX = imp.x; guard.y = guard.targetY = imp.y;
  burst.state.enemies = [imp]; burst.update(.001);
  close(guard.hp, guard.maxHp - 24 * scale);

  const splash = new GameEngine(1, 'volcano', { difficulty });
  splash.startWave(); splash.state.spawnQueue = [{ kind: 'imp', time: 1000 }];
  const commander = splash.state.allies[0], juggernaut = enemy(splash, 'juggernaut', splash.nearestPathPoint(commander).progress, 1000);
  commander.damage = 0; commander.x = commander.targetX = juggernaut.x; commander.y = commander.targetY = juggernaut.y;
  commander.engagedWith = juggernaut.id; juggernaut.blockedBy = commander.id; juggernaut.attackTimer = 0;
  splash.state.enemies = [juggernaut]; splash.castSkill('reinforce', juggernaut.x, juggernaut.y);
  const friends = splash.state.allies.filter(ally => ally.type === 'reinforcement');
  splash.update(.001);
  for (const friend of friends) close(friend.hp, friend.maxHp - 22 * scale * (1 - friend.armor));
});

test('deployment captures talent values, applies ranged damage and skill cooldown once, and exposes immutable configuration', () => {
  const upgrades = deriveBattleUpgrades({ marksman: 3, focus: 3 });
  const engine = new GameEngine(1, 'forest', { upgrades });
  upgrades.rangedDamageMultiplier = 1;
  assert.equal(engine.upgrades.rangedDamageMultiplier, 1.12);
  assert.ok(Object.isFrozen(engine.upgrades));
  engine.build(0, 'arrow'); engine.startWave();
  const tower = engine.state.towers[0], foe = enemy(engine, 'goblin', engine.nearestPathPoint(tower).progress, 1000);
  engine.state.enemies = [foe]; engine.state.spawnQueue = [{ kind: 'goblin', time: 1000 }];
  engine.update(.001);
  close(foe.hp, 1000 - getTowerStats('arrow', 1).damage * 1.12);
  engine.castSkill('reinforce', foe.x, foe.y);
  close(engine.state.skillCooldowns.reinforce, SKILLS.reinforce.cooldown * .88);
});

test('trained hero and soldiers retain actual HP through tier upgrades, fortify, death, reset and checkpoint restoration', () => {
  const upgrades = deriveBattleUpgrades({ guardian: 3, bulwark: 3, marksman: 3, focus: 3 });
  const engine = new GameEngine(1984, 'forest', { difficulty: 'heroic', upgrades });
  close(engine.state.allies[0].maxHp, HERO_STATS.hp * 1.18);
  engine.state.gold = 3000;
  engine.build(1, 'barracks');
  const tower = engine.state.towers[0];
  close(engine.state.allies[1].maxHp, getTowerStats('barracks', 1).soldierHp! * 1.18);
  engine.upgrade(tower.id); engine.upgrade(tower.id); engine.buyTowerAbility(tower.id, 'barracks-fortify');
  for (const soldier of engine.state.allies.filter(ally => ally.type === 'soldier')) close(soldier.maxHp, getTowerStats('barracks', 3).soldierHp! * 1.18 + 55);
  const fallen = engine.state.allies[1]; fallen.hp = 0; fallen.respawnTimer = .01;
  engine.update(.02);
  close(fallen.hp, fallen.maxHp);
  engine.startWave(); engine.update(.1); engine.castSkill('reinforce', 200, 240);
  const save = engine.exportSave(), restored = new GameEngine(1, 'marsh');
  assert.ok(restored.importSave(save).ok);
  assert.deepEqual(restored.exportSave(), save);
  assert.equal(restored.difficulty, 'heroic'); assert.deepEqual(restored.upgrades, upgrades);
  engine.update(1); restored.update(1);
  assert.deepEqual(restored.exportSave(), engine.exportSave());
  restored.reset();
  assert.equal(restored.difficulty, 'heroic');
  close(restored.state.allies[0].maxHp, HERO_STATS.hp * 1.18);
});

test('legacy checkpoints default to normal difficulty, no talents, first priority and zero early calls', () => {
  const original = new GameEngine(); original.build(0, 'arrow'); original.startWave(); original.update(.1);
  const legacy = original.exportSave();
  delete legacy.difficulty; delete legacy.upgrades;
  delete legacy.state.towers[0].targetPriority;
  delete legacy.state.stats.earlyWavesCalled; delete legacy.state.stats.earlyWaveGold;
  const restored = new GameEngine(9, 'volcano', { difficulty: 'heroic', upgrades: deriveBattleUpgrades({ guardian: 3 }) });
  assert.ok(restored.importSave(legacy).ok);
  assert.equal(restored.difficulty, 'normal'); assert.deepEqual(restored.upgrades, deriveBattleUpgrades());
  assert.equal(restored.state.towers[0].targetPriority, 'first'); assert.equal(restored.state.stats.earlyWavesCalled, 0);
  original.update(1); restored.update(1);
  assert.deepEqual(restored.exportSave(), original.exportSave());
});

test('checkpoint validation rejects tampered difficulty, talents, priorities, extra rewards and rewritten spawn queues atomically', () => {
  const source = readyEarlyWave(); source.build(0, 'arrow'); source.callEarlyWave();
  const template = source.exportSave(), receiver = new GameEngine(64), previous = receiver.exportSave();
  const alterations: ((save: typeof template) => void)[] = [
    save => { save.difficulty = 'nightmare' as Difficulty; },
    save => { save.difficulty = 'heroic'; },
    save => { save.upgrades!.rangedDamageMultiplier = 3; },
    save => { save.upgrades!.heroHpMultiplier = 1.18; },
    save => { save.upgrades!.skillCooldownMultiplier = .5; },
    save => { save.state.towers[0].targetPriority = 'random' as TowerPriority; },
    save => { save.state.stats.earlyWavesCalled = save.state.wave; },
    save => { save.state.stats.earlyWaveGold = 26; },
    save => { save.state.spawnQueue.pop(); },
    save => { save.state.spawnQueue[0].kind = 'juggernaut'; },
    save => { save.state.spawnQueue[0].time = 1000; },
  ];
  for (const alter of alterations) {
    const save = structuredClone(template); alter(save);
    assert.equal(receiver.importSave(save).ok, false);
    assert.deepEqual(receiver.exportSave(), previous);
  }
});
