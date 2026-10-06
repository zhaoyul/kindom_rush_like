import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattleReport, getMostDangerousWave, getTopTowers, isValidBattleReport, summarizeBattleReport } from '../src/battle-report';
import { ENEMY_STATS } from '../src/data';
import { GameEngine } from '../src/engine';
import type { Enemy, EnemyKind } from '../src/types';

let foeId = 910_000;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} should equal ${expected}`);
function foe(engine: GameEngine, kind: EnemyKind, progress: number, hp = ENEMY_STATS[kind].hp): Enemy {
  return { id: foeId++, kind, ...engine.samplePath(progress), progress, hp, maxHp: hp, attackTimer: 1000, blockedBy: null, slowTimer: 0, hitTimer: 0 };
}
function combat(engine: GameEngine, remote = true): void {
  engine.state.phase = 'battle'; engine.state.wave = 1; engine.state.spawnQueue = [{ kind: 'goblin', time: 10000 }];
  if (remote) { const hero = engine.state.allies[0]; hero.x = hero.targetX = 1180; hero.y = hero.targetY = 680; }
}
function checkpoint(): GameEngine {
  const engine = new GameEngine(12345); engine.build(0, 'arrow'); engine.build(5, 'mage'); engine.build(8, 'barracks'); engine.update(3); engine.startWave(); engine.update(8); return engine;
}

test('actual mitigated damage is capped at remaining health and a sold tower retains its contribution', () => {
  const engine = new GameEngine(); engine.state.gold = 20000; engine.build(0, 'arrow'); const tower = engine.state.towers[0];
  engine.upgrade(tower.id); engine.upgrade(tower.id); engine.chooseTowerBranch(tower.id, 'arrow-sniper'); combat(engine);
  engine.state.enemies = [foe(engine, 'orc', 180, 20)]; engine.update(.01);
  close(engine.state.stats.damageDealt, 20); close(engine.state.report!.totalDamage, 20);
  assert.equal(engine.state.report!.totalKills, 1); assert.equal(engine.state.report!.towers[0].kills, 1); close(engine.state.report!.towers[0].damage, 20);
  engine.sell(tower.id); assert.equal(engine.state.report!.towers[0].soldAt, engine.state.time);
  assert.equal(engine.state.report!.towers[0].branch, 'arrow-sniper'); assert.equal(engine.state.report!.towers[0].level, 3);
  engine.build(0, 'arrow'); assert.equal(engine.state.report!.towers.length, 2);
  assert.equal(getTopTowers(engine.state.report!)[0].id, tower.id); assert.equal(engine.state.report!.towers[1].damage, 0);
});

test('soldier damage and kills are credited to its own historical barracks while hero attacks have a distinct account', () => {
  const engine = new GameEngine(); engine.build(8, 'barracks'); engine.update(3); combat(engine);
  const tower = engine.state.towers[0], soldier = engine.state.allies.find(ally => ally.towerId === tower.id)!;
  const target = foe(engine, 'orc', engine.nearestPathPoint(soldier).progress, 5); target.x = soldier.x + 20; target.y = soldier.y;
  engine.state.enemies = [target]; engine.update(.01);
  close(engine.state.report!.towers[0].damage, 5); assert.equal(engine.state.report!.towers[0].kills, 1); assert.equal(engine.state.report!.hero.damage, 0);
  const heroEngine = new GameEngine(); combat(heroEngine, false); const hero = heroEngine.state.allies[0];
  heroEngine.state.enemies = [foe(heroEngine, 'goblin', heroEngine.nearestPathPoint(hero).progress, 20)]; heroEngine.update(.01);
  close(heroEngine.state.report!.hero.damage, 20); assert.equal(heroEngine.state.report!.hero.kills, 1); assert.equal(heroEngine.state.report!.support.damage, 0);
});

test('reinforcements and meteor use the support account while personal powers remain attributed to the hero', () => {
  const engine = new GameEngine(); combat(engine); engine.castSkill('reinforce', 180, 240);
  const reinforcement = engine.state.allies.find(ally => ally.type === 'reinforcement')!;
  engine.state.enemies = [foe(engine, 'goblin', engine.nearestPathPoint(reinforcement).progress, 10)]; engine.update(.11);
  close(engine.state.report!.support.damage, 10); assert.equal(engine.state.report!.support.kills, 1);
  const meteor = foe(engine, 'golem', 500, 123); engine.state.enemies = [meteor]; engine.castSkill('meteor', meteor.x, meteor.y);
  close(engine.state.report!.support.damage, 133); assert.equal(engine.state.report!.support.kills, 2);
  const personal = new GameEngine(); combat(personal, false); const hero = personal.state.allies[0];
  personal.state.enemies = [foe(personal, 'golem', personal.nearestPathPoint(hero).progress, 140)]; personal.castSkill('hero', hero.x, hero.y);
  close(personal.state.report!.hero.damage, 140); assert.equal(personal.state.report!.hero.kills, 1);
});

test('hero and soldier deaths count exactly once including poison and remain recorded after revival', () => {
  const heroEngine = new GameEngine(); combat(heroEngine, false); const hero = heroEngine.state.allies[0];
  hero.hp = 1; hero.poisonTimer = 1; hero.poisonDamage = 4; heroEngine.update(.3);
  assert.equal(hero.hp, 0); assert.equal(heroEngine.state.report!.hero.deaths, 1); heroEngine.update(15.1);
  assert.ok(hero.hp > 0); assert.equal(heroEngine.state.report!.hero.deaths, 1);
  const engine = new GameEngine(); engine.build(8, 'barracks'); engine.update(3); combat(engine);
  const soldier = engine.state.allies.find(ally => ally.type === 'soldier')!; soldier.hp = 1;
  const target = foe(engine, 'golem', engine.nearestPathPoint(soldier).progress, 1000); target.x = soldier.x + 20; target.y = soldier.y; target.attackTimer = 0;
  engine.state.enemies = [target]; engine.update(.01); assert.equal(soldier.hp, 0); assert.equal(engine.state.report!.soldierDeaths, 1);
  engine.state.enemies = []; engine.update(9.1); assert.ok(soldier.hp > 0); assert.equal(engine.state.report!.soldierDeaths, 1);
});

test('only successful active interruption of a charging boss increments the hero counter', () => {
  const engine = new GameEngine(); combat(engine, false); const hero = engine.state.allies[0], boss = foe(engine, 'chieftain', engine.nearestPathPoint(hero).progress);
  hero.attackTimer = 5; boss.bossCooldown = 0; engine.state.enemies = [boss]; engine.update(.01); assert.ok(boss.bossCast);
  const before = structuredClone(engine.state.report); assert.equal(engine.castSkill('hero-roots', 1180, 680).ok, false); assert.deepEqual(engine.state.report, before);
  assert.ok(engine.castSkill('hero-roots', boss.x, boss.y).ok); assert.equal(engine.state.report!.hero.bossInterrupts, 1);
  engine.state.skillCooldowns['hero-roots'] = 0; assert.ok(engine.castSkill('hero-roots', boss.x, boss.y).ok); assert.equal(engine.state.report!.hero.bossInterrupts, 1);
});

test('leak records include each enemy kind and clamp actual lost lives when several leak together', () => {
  const engine = new GameEngine(); combat(engine); engine.state.lives = 5;
  engine.state.enemies = [foe(engine, 'chieftain', engine.pathLength - .01), foe(engine, 'wolf', engine.pathLength - .01)]; engine.update(.01);
  assert.equal(engine.state.lives, 0); assert.deepEqual(engine.state.report!.leaks.chieftain, { count: 1, lives: 5 });
  assert.deepEqual(engine.state.report!.leaks.wolf, { count: 1, lives: 0 });
  assert.equal(engine.state.report!.waves[0].livesLost, 5); assert.equal(engine.state.report!.waves[0].furthestProgress, engine.pathLength);
  const summary = summarizeBattleReport(engine.state.report!, engine.pathLength); assert.equal(summary.leakedEnemies, 2); assert.equal(summary.livesLost, 5);
});

test('early waves create new combat periods immediately and credit carry-over kills to the current period', () => {
  const engine = new GameEngine(); engine.moveHero(1180, 680); engine.update(4); engine.startWave(); engine.update(14);
  const carryCount = engine.state.enemies.length; assert.ok(carryCount > 0); assert.equal(engine.state.spawnQueue.length, 0);
  const previous = engine.state.report!.waves[0]; assert.ok(engine.callEarlyWave().ok);
  const current = engine.state.report!.waves[1]; assert.equal(current.peakEnemies, carryCount); assert.equal(previous.endedAt, current.startedAt);
  const target = engine.state.enemies[0]; assert.ok(engine.castSkill('meteor', target.x, target.y).ok);
  assert.equal(previous.kills, 0); assert.ok(current.kills > 0); assert.equal(current.kills, engine.state.report!.totalKills);
  const leaking = engine.state.enemies[0]; leaking.progress = engine.pathLength - .01; Object.assign(leaking, engine.samplePath(leaking.progress)); engine.update(.01);
  assert.equal(getMostDangerousWave(engine.state.report!)?.wave, 2); assert.equal(summarizeBattleReport(engine.state.report!, engine.pathLength).furthestRatio, 1);
});

test('report helper ranking is deterministic, uses dangerous evidence, and cannot mutate the supplied report', () => {
  const engine = checkpoint(), report = engine.state.report!, before = JSON.stringify(report);
  const top = getTopTowers(report, 2), dangerous = getMostDangerousWave(report), summary = summarizeBattleReport(report, engine.pathLength);
  assert.ok(top.length <= 2); assert.ok(summary.totalDamage > 0); if (top[0]) top[0].damage = 999999; if (dangerous) dangerous.peakEnemies = 0;
  summary.hero.damage = 99999; assert.equal(JSON.stringify(report), before); assert.deepEqual(getTopTowers(report, -2), []);
  assert.equal(summarizeBattleReport(report, Number.NaN).furthestRatio, 0); assert.equal(getMostDangerousWave(createBattleReport({ time: 0, towers: [] })), null);
});

test('missing legacy reports begin partial at the restoration time and record no invented past damage or kills', () => {
  const original = checkpoint(), save = original.exportSave(), initialDamage = save.state.stats.damageDealt, initialKills = save.state.kills;
  assert.ok(initialDamage > 0); delete save.state.report;
  const restored = new GameEngine(); assert.ok(restored.importSave(save).ok); const partial = restored.state.report!;
  assert.equal(partial.partial, true); assert.equal(partial.startedAt, save.state.time); assert.equal(partial.totalDamage, 0); assert.equal(partial.totalKills, 0);
  assert.ok(partial.towers.every(tower => tower.existingAtStart && tower.builtAt === save.state.time));
  assert.equal(partial.waves[0].peakEnemies, save.state.enemies.length); assert.equal(partial.waves[0].damage, 0);
  for (let tick = 0; tick < 300; tick++) { original.update(.1); restored.update(.1); }
  close(restored.state.report!.totalDamage, restored.state.stats.damageDealt - initialDamage); assert.equal(restored.state.report!.totalKills, restored.state.kills - initialKills);
  const left = original.exportSave(), right = restored.exportSave(); delete left.state.report; delete right.state.report; assert.deepEqual(right, left);
});

test('full reports resume exactly, reset clears them, and internally inconsistent reports cannot overwrite a save', () => {
  const original = checkpoint(), save = original.exportSave(), restored = new GameEngine();
  assert.ok(isValidBattleReport(save.state.report, save.state, original.level, save.runtime.nextId)); assert.ok(restored.importSave(save).ok);
  for (let tick = 0; tick < 300; tick++) { original.update(.1); restored.update(.1); }
  assert.deepEqual(restored.exportSave(), original.exportSave()); const before = restored.exportSave();
  const mutations = [
    (copy: typeof save) => { copy.state.report!.totalDamage += 1; },
    (copy: typeof save) => { copy.state.report!.towers[0].damage += 1; },
    (copy: typeof save) => { copy.state.report!.towers[0].soldAt = copy.state.time; },
    (copy: typeof save) => { copy.state.report!.towers[0].level = 3; },
    (copy: typeof save) => { copy.state.report!.hero.deaths = -1; },
    (copy: typeof save) => { copy.state.report!.startedAt = copy.state.time + 1; },
    (copy: typeof save) => { copy.state.report!.waves.push({ ...copy.state.report!.waves[0] }); },
    (copy: typeof save) => { copy.state.report!.waves[0].furthestProgress = 99999; },
    (copy: typeof save) => { copy.state.report!.mapActivations = 1; },
    (copy: typeof save) => { copy.state.report!.leaks.goblin = { count: 1, lives: 1 }; },
  ];
  for (const mutate of mutations) { const corrupt = structuredClone(save); mutate(corrupt); assert.equal(restored.importSave(corrupt).ok, false); assert.deepEqual(restored.exportSave(), before); }
  restored.reset(); assert.equal(restored.state.report!.partial, false); assert.equal(restored.state.report!.totalDamage, 0);
  assert.equal(restored.state.report!.totalKills, 0); assert.deepEqual(restored.state.report!.towers, []); assert.deepEqual(restored.state.report!.waves, []);
});
