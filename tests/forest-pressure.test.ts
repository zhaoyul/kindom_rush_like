import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ENEMY_STATS, getLevelForRules, getTowerStats, LEGACY_FOREST_WAVES, LEVELS, TOWER_ABILITIES, WAVES } from '../src/data';
import { GameEngine } from '../src/engine';
import { TOWER_BRANCHES } from '../src/tower-branches';
import type { Tower, TowerAbilityKind, TowerBranchId, TowerKind, Wave } from '../src/types';

interface Pressure { wave: number; furthest: number; peakEnemies: number; peakHp: number; lives: number }
const seed = 0x51f0a7;
const count = (waves: Wave[]) => waves.flatMap(wave => wave.enemies).reduce((sum, group) => sum + group.count, 0);
const bounty = (waves: Wave[]) => waves.flatMap(wave => wave.enemies).reduce((sum, group) => sum + group.count * ENEMY_STATS[group.kind].gold, 0);

function upgradeFully(engine: GameEngine, tower: Tower): void {
  while (tower.level < 3 && engine.state.gold >= getTowerStats(tower.kind, tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
}

function buyFirstRank(engine: GameEngine, tower: Tower, abilities: TowerAbilityKind[]): void {
  for (const kind of abilities) if (!tower.abilities[kind] && engine.state.gold >= TOWER_ABILITIES[kind].costs[0]) assert.ok(engine.buyTowerAbility(tower.id, kind).ok);
}

/** The observed three-tower route; every purchase uses the starting purse or earned gold. */
function threeTowerRoute(rulesVersion: 1 | 2, activeHero = false): { engine: GameEngine; pressure: Pressure[] } {
  const engine = new GameEngine(seed, 'forest', { rulesVersion });
  assert.ok(engine.build(1, 'cannon').ok);
  const cannon = engine.state.towers[0];
  assert.ok(engine.upgrade(cannon.id).ok); engine.update(2);
  const improve = () => {
    if (engine.state.wave >= 1) upgradeFully(engine, cannon);
    if (engine.state.wave >= 2) buyFirstRank(engine, cannon, ['cannon-cluster', 'cannon-quake']);
    if (engine.state.wave >= 4 && !engine.state.towers.some(tower => tower.kind === 'mage')) {
      assert.ok(engine.build(5, 'mage').ok);
      assert.ok(engine.setTowerPriority(engine.state.towers.at(-1)!.id, 'strong').ok);
    }
    if (engine.state.wave >= 6 && !engine.state.towers.some(tower => tower.kind === 'barracks')) assert.ok(engine.build(6, 'barracks').ok);
    if (engine.state.phase !== 'battle') {
      const mage = engine.state.towers.find(tower => tower.kind === 'mage');
      const barracks = engine.state.towers.find(tower => tower.kind === 'barracks');
      if (mage) upgradeFully(engine, mage);
      if (barracks) upgradeFully(engine, barracks);
      if (mage && engine.state.wave >= 7) buyFirstRank(engine, mage, ['mage-chain', 'mage-overload', 'mage-frost']);
    }
  };
  const pressure: Pressure[] = [];
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok); improve();
    const row: Pressure = { wave: engine.state.wave, furthest: 0, peakEnemies: 0, peakHp: 0, lives: engine.state.lives };
    let casts = 0, decisionTime = 0;
    if (activeHero && engine.state.wave >= 4) assert.ok(engine.moveHero(400, 425).ok);
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
      improve();
      if (activeHero && engine.state.wave >= 4 && casts < 2 && engine.state.time >= decisionTime) {
        decisionTime = engine.state.time + 2;
        const hero = engine.state.allies.find(ally => ally.type === 'hero')!;
        const target = engine.state.enemies.filter(enemy => Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 105).sort((a, b) => b.hp - a.hp)[0];
        if (target) {
          if (hero.hp < hero.maxHp * .7 && engine.castSkill('hero', hero.x, hero.y).ok) casts++;
          else if (engine.castSkill('hero-roots', target.x, target.y).ok) casts++;
        }
      }
      engine.update(.1);
      row.furthest = Math.max(row.furthest, ...engine.state.enemies.map(enemy => enemy.progress));
      row.peakEnemies = Math.max(row.peakEnemies, engine.state.enemies.length);
      row.peakHp = Math.max(row.peakHp, engine.state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0));
      assert.ok(engine.state.gold >= 0);
    }
    assert.notEqual(engine.state.phase, 'battle');
    row.lives = engine.state.lives; pressure.push(row); improve(); engine.update(2);
  }
  assertVictoryEconomy(engine);
  assert.equal(engine.state.towers.length, 3);
  assert.ok(engine.state.stats.skillsUsed <= (activeHero ? 10 : 0));
  return { engine, pressure };
}

function assertVictoryEconomy(engine: GameEngine): void {
  assert.equal(engine.state.phase, 'victory'); assert.equal(engine.state.kills, 168);
  assert.equal(engine.state.wave, 8); assert.equal(engine.state.lives, 20);
  const supply = engine.level.waves.reduce((sum, _, index) => sum + 25 + (index + 1) * 5, 0);
  assert.equal(engine.state.stats.goldEarned, bounty(engine.level.waves) + supply);
  assert.ok(engine.state.time < 360, 'The first level remains shorter than six simulated minutes.');
}

test('rules two preserves both introductory waves, all original units and the exact legacy schedule', () => {
  const digest = createHash('sha256').update(JSON.stringify(LEGACY_FOREST_WAVES)).digest('hex');
  assert.equal(digest, '4b61ce22919908f638788c481e48a7540dc1793d232bb855ca15abf747bb56cd');
  assert.deepEqual(WAVES.slice(0, 2), LEGACY_FOREST_WAVES.slice(0, 2));
  assert.equal(WAVES.length, 8); assert.equal(count(WAVES), 168); assert.equal(bounty(WAVES), bounty(LEGACY_FOREST_WAVES));
  for (let index = 0; index < WAVES.length; index++) {
    assert.equal(count([WAVES[index]]), count([LEGACY_FOREST_WAVES[index]]));
    assert.equal(bounty([WAVES[index]]), bounty([LEGACY_FOREST_WAVES[index]]));
    const roster = (wave: Wave) => wave.enemies.reduce<Record<string, number>>((sum, group) => { sum[group.kind] = (sum[group.kind] ?? 0) + group.count; return sum; }, {});
    assert.deepEqual(roster(WAVES[index]), roster(LEGACY_FOREST_WAVES[index]));
  }
  assert.equal(getLevelForRules('forest', 1).waves, LEGACY_FOREST_WAVES);
  assert.equal(getLevelForRules('forest', 2).waves, WAVES);
  for (const level of LEVELS.filter(level => level.id !== 'forest')) assert.equal(getLevelForRules(level.id, 1), getLevelForRules(level.id, 2));
  assert.equal(getLevelForRules('forest', 2).startGold, 360);
});

test('the three-tower route remains viable while later waves push further and create a second peak', () => {
  const legacy = threeTowerRoute(1), current = threeTowerRoute(2);
  assert.deepEqual(current.pressure.slice(0, 2), legacy.pressure.slice(0, 2));
  assert.ok(current.pressure[5].furthest > legacy.pressure[5].furthest * 1.15);
  assert.ok(current.pressure[6].furthest > legacy.pressure[6].furthest * 1.2);
  assert.ok(current.pressure[7].peakEnemies >= legacy.pressure[7].peakEnemies + 5);
  assert.ok(current.pressure[7].peakHp > legacy.pressure[7].peakHp * 1.15);
  assert.equal(current.engine.state.gold, legacy.engine.state.gold);
  assert.ok(current.engine.state.time <= legacy.engine.state.time, 'Pressure is not purchased by extending the level.');
});

test('moving the hero into the fire zone and at most two casts per late wave reduce penetration', () => {
  const passive = threeTowerRoute(2), active = threeTowerRoute(2, true);
  assert.ok(active.engine.state.stats.skillsUsed > 0 && active.engine.state.stats.skillsUsed <= 10);
  assert.ok(active.pressure[6].furthest < passive.pressure[6].furthest * .8);
  assert.ok(active.pressure[7].furthest < passive.pressure[7].furthest * .9);
  assert.ok(active.engine.state.time < passive.engine.state.time);
  assert.equal(active.engine.state.gold, passive.engine.state.gold);
});

test('a dispersed mixed defense with paid tier-three branches clears the new forest without active skills', () => {
  const engine = new GameEngine(seed, 'forest');
  const plan: [number, TowerKind, TowerBranchId][] = [[5, 'mage', 'mage-arcane'], [1, 'arrow', 'arrow-ranger'], [8, 'barracks', 'barracks-warden'], [7, 'mage', 'mage-frost'], [3, 'cannon', 'cannon-siege'], [0, 'arrow', 'arrow-sniper'], [9, 'arrow', 'arrow-ranger']];
  for (const [slot, kind] of [[1, 'arrow'], [5, 'mage'], [8, 'barracks']] as const) assert.ok(engine.build(slot, kind).ok);
  engine.update(2);
  const improve = () => {
    for (const [slot, kind, branch] of plan) {
      let tower = engine.state.towers.find(tower => tower.slotId === slot);
      if (!tower) {
        if (engine.state.gold < getTowerStats(kind, 1).cost) return;
        assert.ok(engine.build(slot, kind).ok); tower = engine.state.towers.at(-1)!;
      }
      if (kind === 'mage') assert.ok(engine.setTowerPriority(tower.id, 'strong').ok);
      upgradeFully(engine, tower); if (tower.level < 3) return;
      if (!tower.branch) {
        if (engine.state.gold < TOWER_BRANCHES[branch].cost) return;
        assert.ok(engine.chooseTowerBranch(tower.id, branch).ok);
      }
    }
  };
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok);
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) engine.update(.1);
    assert.notEqual(engine.state.phase, 'battle');
    if (engine.state.phase === 'intermission') { improve(); engine.update(2); }
  }
  assertVictoryEconomy(engine); assert.equal(engine.state.stats.skillsUsed, 0);
  assert.ok(engine.state.towers.length >= 5);
  assert.ok(engine.state.towers.some(tower => tower.branch === 'mage-arcane'));
  assert.ok(engine.state.towers.some(tower => tower.branch === 'cannon-siege'));
});
