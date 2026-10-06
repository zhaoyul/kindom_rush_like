import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getLevel } from '../src/data';
import { GameEngine } from '../src/engine';
import { getMapEventDefinition, MARSH_FLOODGATE } from '../src/map-events';
import type { Enemy } from '../src/types';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} should equal ${expected}`);
function activeScene(): { engine: GameEngine; target: Enemy } {
  const engine = new GameEngine(432, 'marsh'); engine.startWave(); engine.update(1.21);
  const target = engine.state.enemies[0]; target.kind = 'golem'; target.hp = target.maxHp = ENEMY_STATS.golem.hp;
  target.progress = engine.nearestPathPoint(MARSH_FLOODGATE.areaCenter).progress; Object.assign(target, engine.samplePath(target.progress));
  const hero = engine.state.allies[0]; hero.x = hero.targetX = MARSH_FLOODGATE.position.x; hero.y = hero.targetY = MARSH_FLOODGATE.position.y; hero.attackTimer = 5;
  return { engine, target };
}

test('the marsh floodgate belongs only to current marsh rules and is clear of tower construction sites', () => {
  const marsh = getLevel('marsh'), engine = new GameEngine(4, 'marsh');
  assert.equal(getMapEventDefinition('marsh', 2), MARSH_FLOODGATE);
  for (const level of ['forest', 'frost', 'volcano'] as const) assert.equal(new GameEngine(4, level).getMapEventStatus(), null);
  assert.equal(new GameEngine(4, 'marsh', { rulesVersion: 1 }).getMapEventStatus(), null);
  assert.ok(Math.hypot(MARSH_FLOODGATE.position.x - engine.nearestPathPoint(MARSH_FLOODGATE.position).x,
    MARSH_FLOODGATE.position.y - engine.nearestPathPoint(MARSH_FLOODGATE.position).y) <= 45);
  for (const slot of marsh.slots) assert.ok(Math.hypot(slot.x - MARSH_FLOODGATE.position.x, slot.y - MARSH_FLOODGATE.position.y) > 90);
  assert.equal(engine.state.mapEvent?.activeRemaining, 0); assert.equal(engine.getMapEventStatus()?.ready, false);
});

test('failed gate interactions are atomic in preparation, with no targets, at range, while dead, and during cooldown', () => {
  const engine = new GameEngine(3, 'marsh'); const preparation = engine.exportSave();
  assert.equal(engine.activateMapEvent().ok, false); assert.deepEqual(engine.exportSave(), preparation);
  const { engine: battle, target } = activeScene(), hero = battle.state.allies[0];
  const validPosition = { x: hero.x, y: hero.y }; hero.x = hero.targetX = 1120; hero.y = hero.targetY = 660;
  const ranged = battle.exportSave(); assert.equal(battle.activateMapEvent().ok, false); assert.deepEqual(battle.exportSave(), ranged);
  hero.x = hero.targetX = validPosition.x; hero.y = hero.targetY = validPosition.y; hero.hp = 0; hero.respawnTimer = 15;
  const dead = battle.exportSave(); assert.equal(battle.activateMapEvent().ok, false); assert.deepEqual(battle.exportSave(), dead);
  hero.hp = hero.maxHp; hero.respawnTimer = 0; const foes = battle.state.enemies; battle.state.enemies = [];
  const empty = battle.exportSave(); assert.equal(battle.activateMapEvent().ok, false); assert.deepEqual(battle.exportSave(), empty);
  battle.state.enemies = foes; assert.ok(target.hp > 0); assert.ok(battle.activateMapEvent().ok);
  const active = battle.exportSave(); assert.equal(battle.activateMapEvent().ok, false); assert.deepEqual(battle.exportSave(), active);
  battle.update(6.2); const cooldown = battle.exportSave(); assert.equal(battle.activateMapEvent().ok, false); assert.deepEqual(battle.exportSave(), cooldown);
});

test('flooding reduces enemy movement for six seconds without damage and affects later entrants rather than allies', () => {
  const { engine, target } = activeScene(), hero = engine.state.allies[0];
  const initialHealth = target.hp, heroHealth = hero.hp, heroSpeed = hero.speed;
  assert.ok(engine.activateMapEvent().ok); assert.equal(engine.state.mapEvent?.activeRemaining, 6); assert.equal(engine.state.mapEvent?.cooldownRemaining, 35);
  assert.equal(target.hp, initialHealth); close(target.slowAmount!, .55);
  const progress = target.progress; engine.update(.1); close(target.progress - progress, ENEMY_STATS.golem.speed * .45 * .1);
  const later = engine.state.enemies.find(enemy => enemy !== target)!; later.kind = 'golem'; later.hp = later.maxHp = ENEMY_STATS.golem.hp;
  later.progress = engine.nearestPathPoint(MARSH_FLOODGATE.areaCenter).progress; Object.assign(later, engine.samplePath(later.progress));
  engine.update(.1); close(later.slowAmount!, .55); assert.equal(later.hp, ENEMY_STATS.golem.hp);
  assert.equal(hero.hp, heroHealth); assert.equal(hero.speed, heroSpeed); assert.equal(engine.state.stats.damageDealt, 0);
  assert.equal(engine.state.report?.totalDamage, 0); assert.equal(engine.state.report?.mapActivations, 1);
  engine.update(6.1); assert.equal(engine.state.mapEvent?.activeRemaining, 0); assert.equal(target.slowTimer, 0);
  assert.equal(engine.state.effects.some(effect => effect.style === 'floodgate'), false);
});

test('floodgate is weaker than an active frost field and does not interrupt a boss charge', () => {
  const { engine, target } = activeScene(); engine.state.gold = 20000; engine.build(4, 'mage'); const tower = engine.state.towers[0];
  engine.upgrade(tower.id); engine.upgrade(tower.id); engine.buyTowerAbility(tower.id, 'mage-frost'); engine.buyTowerAbility(tower.id, 'mage-frost'); tower.attackTimer = 1000;
  engine.update(.01); close(target.slowAmount!, .65); assert.ok(engine.activateMapEvent().ok); close(target.slowAmount!, .65);
  tower.abilityTimers['mage-frost'] = 1000; engine.update(4.6); close(target.slowAmount!, .55);
  const bossScene = activeScene(), boss = bossScene.target; boss.kind = 'chieftain'; boss.hp = boss.maxHp = ENEMY_STATS.chieftain.hp; boss.bossCooldown = 0;
  bossScene.engine.update(.01); assert.ok(boss.bossCast); const cast = { ...boss.bossCast };
  assert.ok(bossScene.engine.activateMapEvent().ok); assert.deepEqual(boss.bossCast, cast); close(boss.slowAmount!, .55);
});

test('active water, its cooldown and all enemy movement resume frame-for-frame from a paused checkpoint', () => {
  const { engine } = activeScene(); engine.activateMapEvent(); engine.update(.4);
  const save = engine.exportSave(); engine.update(0); assert.deepEqual(engine.exportSave(), save);
  const restored = new GameEngine(); assert.ok(restored.importSave(save).ok); assert.deepEqual(restored.exportSave(), save);
  for (let tick = 0; tick < 380; tick++) { engine.update(.1); restored.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave()); }
  assert.equal(restored.state.mapEvent?.activeRemaining, 0); assert.equal(restored.state.mapEvent?.cooldownRemaining, 0);
});

test('old checkpoints with missing event/report fields restore ready without inventing a flood or past statistics', () => {
  const { engine } = activeScene(), save = engine.exportSave(); delete save.state.mapEvent; delete save.state.report;
  const receiver = new GameEngine(); assert.ok(receiver.importSave(save).ok); assert.equal(receiver.state.mapEvent?.activeRemaining, 0);
  assert.equal(receiver.state.mapEvent?.cooldownRemaining, 0); assert.equal(receiver.state.mapEvent?.activations, 0);
  assert.equal(receiver.state.effects.some(effect => effect.style === 'floodgate'), false); assert.equal(receiver.state.report?.partial, true);
});

test('corrupt gate domains/timers are rejected atomically and a defeat cancels its persistent visual', () => {
  const { engine } = activeScene(); engine.activateMapEvent(); engine.update(.1); const save = engine.exportSave(), receiver = new GameEngine(4, 'frost'), before = receiver.exportSave();
  const mutations = [
    (copy: typeof save) => { copy.state.mapEvent!.activeRemaining = 8; },
    (copy: typeof save) => { copy.state.mapEvent!.cooldownRemaining = -1; },
    (copy: typeof save) => { copy.state.mapEvent!.cooldownRemaining = 30; },
    (copy: typeof save) => { copy.state.mapEvent!.activations = 0; },
    (copy: typeof save) => { copy.rulesVersion = 1; },
    (copy: typeof save) => { copy.state.effects.find(effect => effect.style === 'floodgate')!.radius = 500; },
  ];
  for (const mutate of mutations) { const corrupt = structuredClone(save); mutate(corrupt); assert.equal(receiver.importSave(corrupt).ok, false); assert.deepEqual(receiver.exportSave(), before); }
  const leaking = engine.state.enemies[1]; leaking.progress = engine.pathLength - .01; Object.assign(leaking, engine.samplePath(leaking.progress));
  engine.state.lives = 1; engine.update(.01); assert.equal(engine.state.phase, 'defeat'); assert.equal(engine.state.mapEvent?.activeRemaining, 0);
  assert.equal(engine.state.effects.some(effect => effect.style === 'floodgate'), false); engine.update(4);
  assert.ok(receiver.importSave(engine.exportSave()).ok);
});
