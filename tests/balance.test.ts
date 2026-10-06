import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../src/engine';
import { ENEMY_STATS, getTowerStats, PATH_LENGTH, samplePath, WAVES } from '../src/data';
import type { Enemy, TowerKind } from '../src/types';

function advanceWave(engine: GameEngine, onTick?: () => void): void {
  assert.equal(engine.startWave().ok, true);
  for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
    onTick?.();
    engine.update(0.1);
    assertSimulationInvariants(engine);
  }
  assert.notEqual(engine.state.phase, 'battle', 'A wave should resolve within fifteen simulated minutes.');
}

function assertSimulationInvariants(engine: GameEngine): void {
  const { state } = engine;
  assert.ok(state.gold >= 0 && Number.isFinite(state.gold));
  assert.ok(state.lives >= 0 && state.lives <= 20);
  for (const enemy of state.enemies) {
    assert.ok(enemy.hp > 0 && enemy.hp <= enemy.maxHp);
    assert.ok(Number.isFinite(enemy.x) && Number.isFinite(enemy.y) && Number.isFinite(enemy.progress));
    if (enemy.blockedBy !== null) {
      const blocker = state.allies.find(a => a.id === enemy.blockedBy);
      assert.ok(blocker && blocker.hp > 0, 'Every blocked enemy should have a living ally.');
      assert.equal(blocker.engagedWith, enemy.id);
    }
  }
  for (const ally of state.allies) {
    assert.ok(ally.hp >= 0 && ally.hp <= ally.maxHp);
    assert.ok(Number.isFinite(ally.x) && Number.isFinite(ally.y));
    if (ally.engagedWith !== null) {
      const enemy = state.enemies.find(e => e.id === ally.engagedWith);
      assert.ok(enemy, 'Every engaged ally should point to an existing enemy.');
      assert.equal(enemy.blockedBy, ally.id);
    }
  }
}

function placeTower(engine: GameEngine, slotId: number, kind: TowerKind): void {
  assert.equal(engine.build(slotId, kind).ok, true, `${kind} at slot ${slotId} should be affordable.`);
}

function improveDefense(engine: GameEngine): void {
  const plan: [number, TowerKind][] = [[5, 'mage'], [1, 'arrow'], [8, 'barracks'], [7, 'mage'], [3, 'mage'], [0, 'arrow'], [9, 'arrow'], [2, 'mage']];
  for (const [slotId, kind] of plan) {
    let tower = engine.state.towers.find(t => t.slotId === slotId);
    if (!tower && engine.state.gold >= getTowerStats(kind, 1).cost) {
      assert.equal(engine.build(slotId, kind).ok, true);
      tower = engine.state.towers.find(t => t.slotId === slotId)!;
    }
    if (!tower) break;
    while (tower.level < 3) {
      const cost = getTowerStats(kind, tower.level).upgradeCost;
      if (engine.state.gold < cost) return;
      assert.equal(engine.upgrade(tower.id).ok, true);
    }
  }
}

test('The campaign gives each enemy role an explicit combat profile and a final boss', () => {
  assert.equal(WAVES.length, 8);
  assert.equal(ENEMY_STATS.orc.armor > ENEMY_STATS.goblin.armor, true);
  assert.equal(ENEMY_STATS.wolf.speed > ENEMY_STATS.goblin.speed, true);
  assert.equal(ENEMY_STATS.shaman.magicResist > ENEMY_STATS.orc.magicResist, true);
  assert.ok(WAVES.at(-1)?.enemies.some(group => group.kind === 'chieftain'));
  assert.ok(ENEMY_STATS.chieftain.hp > ENEMY_STATS.golem.hp * 3);
});

test('A mixed opening defense can clear the introductory wave without a skill', () => {
  const engine = new GameEngine();
  placeTower(engine, 1, 'arrow');
  placeTower(engine, 5, 'mage');
  placeTower(engine, 8, 'barracks');
  engine.update(2);
  advanceWave(engine);
  assert.equal(engine.state.phase, 'intermission');
  assert.equal(engine.state.lives, 20);
  assert.equal(engine.state.kills, 12);
  assert.equal(engine.state.gold, 220);
});

test('The whole campaign is winnable by a consistent mixed defense with upgrades', () => {
  const engine = new GameEngine();
  placeTower(engine, 1, 'arrow');
  placeTower(engine, 5, 'mage');
  placeTower(engine, 8, 'barracks');
  engine.update(2);
  const history: { wave: number; lives: number; gold: number; time: number }[] = [];
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    advanceWave(engine);
    history.push({ wave: engine.state.wave, lives: engine.state.lives, gold: engine.state.gold, time: engine.state.time });
    if (engine.state.phase === 'intermission') {
      improveDefense(engine);
      engine.update(4);
    }
  }
  assert.equal(engine.state.phase, 'victory', `Campaign results: ${JSON.stringify(history)}`);
  assert.ok(engine.state.lives >= 10, `First-level mixed defense should retain at least two stars: ${JSON.stringify(history)}`);
  assert.equal(engine.state.wave, WAVES.length);
  assert.equal(engine.state.kills, WAVES.flatMap(w => w.enemies).reduce((sum, e) => sum + e.count, 0));
});

test('Ignoring defense eventually ends the campaign and never awards gold for leaks', () => {
  const engine = new GameEngine();
  // Move the hero away so this measures enemy leakage rather than automatic melee defense.
  assert.equal(engine.moveHero(1180, 680).ok, true);
  engine.update(4);
  while (engine.state.phase !== 'defeat') {
    advanceWave(engine);
    if (engine.state.wave > 3) assert.fail('An undefended road should lose quickly.');
  }
  assert.equal(engine.state.lives, 0);
  assert.equal(engine.state.kills, 0);
  assert.equal(engine.state.stats.goldEarned, 30, 'Only the first completed-wave supply bonus is earned.');
});

test('Many same-step enemy leaks clamp life at zero and freeze terminal combat actions', () => {
  const engine = new GameEngine();
  const position = samplePath(PATH_LENGTH - 0.01);
  const enemies: Enemy[] = Array.from({ length: 4 }, (_, i) => ({
    id: 9000 + i, kind: 'chieftain', ...position, hp: 2200, maxHp: 2200,
    progress: PATH_LENGTH - 0.01, attackTimer: 0, blockedBy: null, slowTimer: 0, hitTimer: 0,
  }));
  engine.state.phase = 'battle';
  engine.state.enemies = enemies;
  engine.update(0.1);
  assert.equal(engine.state.phase, 'defeat');
  assert.equal(engine.state.lives, 0);
  assert.equal(engine.state.enemies.length, 0);
  assert.equal(engine.state.kills, 0);
  const before = engine.state.gold;
  assert.equal(engine.build(1, 'arrow').ok, false);
  assert.equal(engine.moveHero(500, 400).ok, false);
  assert.equal(engine.startWave().ok, false);
  assert.equal(engine.castSkill('reinforce', 750, 425).ok, false);
  assert.equal(engine.state.gold, before);
});
