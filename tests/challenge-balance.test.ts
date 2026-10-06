import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerAbilities, getTowerStats } from '../src/data';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import type { ChallengeMode, TowerKind } from '../src/types';

const plans: Record<'forest' | 'marsh', [number, TowerKind][]> = {
  forest: [[5, 'mage'], [1, 'arrow'], [8, 'barracks'], [7, 'mage'], [3, 'cannon'], [0, 'arrow']],
  marsh: [[1, 'cannon'], [2, 'mage'], [3, 'barracks'], [4, 'mage'], [5, 'arrow'], [6, 'mage']],
};

function improve(engine: GameEngine, plan: [number, TowerKind][]): void {
  for (const [slot, kind] of plan) {
    let tower = engine.state.towers.find(tower => tower.slotId === slot);
    if (!tower && engine.state.gold >= getTowerStats(kind, 1).cost) {
      assert.ok(engine.build(slot, kind).ok); tower = engine.state.towers.at(-1)!;
    }
    if (!tower) break;
    while (tower.level < 3 && engine.state.gold >= getTowerStats(kind, tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
  }
  for (const tower of engine.state.towers.filter(tower => tower.level === 3)) for (const ability of getTowerAbilities(tower.kind)) {
    const rank = tower.abilities[ability.id] ?? 0;
    if (rank < 2 && engine.state.gold >= ability.costs[rank]) assert.ok(engine.buyTowerAbility(tower.id, ability.id).ok);
  }
}

function campaign(levelId: 'forest' | 'marsh', challenge: Exclude<ChallengeMode, 'standard'>): GameEngine {
  const engine = new GameEngine(12345, levelId, { challenge, difficulty: 'normal' });
  const plan = challenge === 'four-towers' ? plans[levelId].slice(0, 4) : plans[levelId];
  assert.equal(engine.state.gold, engine.level.startGold); assert.deepEqual(engine.upgrades, deriveBattleUpgrades());
  for (const [slot, kind] of plan.slice(0, 3)) assert.ok(engine.build(slot, kind).ok);
  engine.update(3);
  const history: object[] = []; let frames = 0, checkpoints = 0;
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok);
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
      engine.update(.1); frames++;
      assert.ok(engine.state.gold >= 0);
      assert.equal(engine.challenge, challenge);
      if (challenge === 'four-towers') assert.ok(engine.state.towers.length <= 4);
      if (frames % 50 === 0) {
        const save = JSON.parse(JSON.stringify(engine.exportSave()));
        const restored = new GameEngine(9, 'volcano', { difficulty: 'heroic' });
        assert.ok(restored.importSave(save).ok, `${levelId}/${challenge} at ${engine.state.time}`);
        assert.equal(restored.challenge, challenge); assert.equal(restored.difficulty, 'normal');
        assert.deepEqual(restored.upgrades, engine.upgrades); assert.equal(restored.level.id, levelId);
        restored.update(.1); engine.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave()); checkpoints++;
      }
    }
    history.push({ wave: engine.state.wave, lives: engine.state.lives, kills: engine.state.kills, gold: engine.state.gold });
    assert.notEqual(engine.state.phase, 'battle');
    if (engine.state.phase === 'intermission') { improve(engine, plan); engine.update(3); }
  }
  assert.equal(engine.state.phase, 'victory', JSON.stringify(history)); assert.equal(engine.state.lives, 20, JSON.stringify(history));
  const enemies = engine.level.waves.flatMap(wave => wave.enemies);
  assert.equal(engine.state.kills, enemies.reduce((sum, group) => sum + group.count, 0));
  const bounty = enemies.reduce((sum, group) => sum + group.count * ENEMY_STATS[group.kind].gold, 0);
  const supply = engine.level.waves.reduce((sum, _, index) => sum + 25 + (index + 1) * 5, 0);
  assert.equal(engine.state.stats.goldEarned, bounty + supply, 'Only original kills and regular wave supplies fund the defense.');
  assert.equal(engine.state.stats.skillsUsed, 0, 'The strategy requires neither repeated skill activation nor meteor casts.');
  const report = engine.state.report!;
  assert.equal(report.partial, false); assert.equal(report.totalKills, engine.state.kills);
  assert.equal(report.hero.kills + report.support.kills + report.towers.reduce((sum, tower) => sum + tower.kills, 0), report.totalKills);
  const attributedDamage = report.hero.damage + report.support.damage + report.towers.reduce((sum, tower) => sum + tower.damage, 0);
  assert.ok(Math.abs(attributedDamage - report.totalDamage) < .0001);
  assert.ok(Math.abs(report.totalDamage - engine.state.stats.damageDealt) < .0001);
  assert.equal(report.waves.length, engine.level.waves.length);
  assert.equal(report.waves.reduce((sum, wave) => sum + wave.kills, 0), report.totalKills);
  assert.equal(engine.state.mapEvent?.activations ?? 0, 0, 'The marsh gate is an optional tactical aid, not a requirement for this route.');
  assert.ok(engine.state.time < 600); assert.ok(checkpoints >= 20);
  return engine;
}

for (const levelId of ['forest', 'marsh'] as const) for (const challenge of ['four-towers', 'no-meteor'] as const) {
  test(`${levelId}/${challenge} is winnable with normal earned gold and preserves its rule through checkpoint recovery`, () => {
    const engine = campaign(levelId, challenge);
    if (challenge === 'four-towers') assert.equal(engine.state.towers.length, 4);
  });
}
