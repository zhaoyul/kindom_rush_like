import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerStats, TOWER_ABILITIES } from '../src/data';
import { DIFFICULTY_MULTIPLIERS } from '../src/difficulties';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import { getTowerInvestment } from '../src/tower-branches';
import type { Difficulty, Enemy, TowerAbilityKind, TowerKind } from '../src/types';

const trainingRanks = { marksman: 3, bulwark: 3, guardian: 3, focus: 3 };
const training = deriveBattleUpgrades(trainingRanks);
const plans: Record<'forest' | 'volcano', [number, TowerKind][]> = {
  forest: [[1, 'cannon'], [5, 'mage'], [6, 'barracks'], [3, 'mage'], [7, 'mage'], [0, 'arrow']],
  volcano: [[1, 'cannon'], [2, 'mage'], [3, 'mage'], [6, 'barracks'], [8, 'mage'], [4, 'mage'], [7, 'cannon'], [0, 'arrow']],
};
const specialties: Record<TowerKind, TowerAbilityKind[]> = {
  cannon: ['cannon-cluster', 'cannon-quake'], mage: ['mage-chain', 'mage-frost'],
  barracks: ['barracks-fortify', 'barracks-cleave'], arrow: ['arrow-deadeye', 'arrow-volley'],
};

/** Concentrate early earned gold in one cannon, then fund control and mixed damage. */
function improveDefense(engine: GameEngine): void {
  for (const [slotId, kind] of plans[engine.level.id as 'forest' | 'volcano']) {
    let tower = engine.state.towers.find(tower => tower.slotId === slotId);
    if (!tower) {
      if (engine.state.gold < getTowerStats(kind, 1).cost) return;
      assert.ok(engine.build(slotId, kind).ok); tower = engine.state.towers.at(-1)!;
    }
    if (kind === 'mage') assert.ok(engine.setTowerPriority(tower.id, 'strong').ok);
    while (tower.level < 3 && engine.state.gold >= getTowerStats(kind, tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
    if (tower.level < 3) return;
    for (const ability of specialties[kind]) if (!tower.abilities[ability]) {
      if (engine.state.gold < TOWER_ABILITIES[ability].costs[0]) return;
      assert.ok(engine.buyTowerAbility(tower.id, ability).ok);
    }
  }
  for (const tower of engine.state.towers.filter(tower => tower.level === 3)) {
    for (const ability of Object.values(TOWER_ABILITIES).filter(ability => ability.towerKind === tower.kind)) {
      const rank = tower.abilities[ability.id] ?? 0;
      if (rank < 2 && engine.state.gold >= ability.costs[rank]) assert.ok(engine.buyTowerAbility(tower.id, ability.id).ok);
    }
  }
}

function cluster(enemies: Enemy[]): Enemy | undefined {
  let chosen: Enemy | undefined, score = 0;
  for (const enemy of enemies) {
    if (enemy.x < 30 || enemy.x > 1170) continue;
    const candidate = enemies.reduce((sum, foe) => sum + (Math.hypot(enemy.x - foe.x, enemy.y - foe.y) < 95 ? Math.min(foe.hp, 300) : 0), 0);
    if (candidate > score) { score = candidate; chosen = enemy; }
  }
  return chosen;
}

/** One spell decision every two seconds, actual individual cooldowns, at most ten casts per wave. */
function useTactics(engine: GameEngine): void {
  const live = engine.state.enemies, hero = engine.state.allies[0];
  const front = live.filter(enemy => enemy.x > 30 && enemy.x < 1170).sort((a, b) => b.progress - a.progress)[0];
  if (!front) return;
  const boss = live.find(enemy => enemy.bossCast && Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 260);
  if (boss && engine.castSkill('hero-roots', boss.x, boss.y).ok) return;
  const closeEnemies = live.filter(enemy => Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 115);
  if (hero.hp > 0 && (hero.hp < hero.maxHp * .7 || closeEnemies.length >= 3) && engine.castSkill('hero', hero.x, hero.y).ok) return;
  if (hero.hp > 0 && hero.hp < hero.maxHp * .8 && engine.castSkill('hero-oath', hero.x, hero.y).ok) return;
  const group = cluster(live);
  if (group && (live.length >= 5 || group.hp > 600) && engine.castSkill('meteor', group.x, group.y).ok) return;
  const rootedGroup = cluster(live.filter(enemy => Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 260));
  if (rootedGroup && engine.castSkill('hero-roots', rootedGroup.x, rootedGroup.y).ok) return;
  if (front.progress > engine.pathLength * .4 && engine.castSkill('reinforce', front.x, front.y).ok) return;
  if (closeEnemies.length >= 3) engine.castSkill('hero-dash', closeEnemies[0].x, closeEnemies[0].y);
}

function activeCampaign(levelId: 'forest' | 'volcano', difficulty: 'nightmare' | 'inferno'): GameEngine {
  assert.equal(Object.values(trainingRanks).reduce((sum, rank) => sum + rank, 0), 12);
  const engine = new GameEngine(0x63e071, levelId, { difficulty, upgrades: training });
  assert.equal(engine.state.gold, engine.level.startGold);
  assert.ok(engine.build(1, 'cannon').ok); assert.ok(engine.upgrade(engine.state.towers[0].id).ok);
  if (levelId === 'volcano') assert.ok(engine.build(2, 'mage').ok);
  assert.ok(engine.moveHero(levelId === 'forest' ? 400 : 350, levelId === 'forest' ? 425 : 150).ok);
  engine.update(3);
  let nextDecision = 0, frames = 0, checkpoints = 0;
  const history: object[] = [];
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok); let waveCasts = 0;
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
      if (engine.state.time >= nextDecision) {
        nextDecision = engine.state.time + 2;
        improveDefense(engine);
        const castsBefore = engine.state.stats.skillsUsed;
        if (waveCasts < 10) useTactics(engine);
        const casts = engine.state.stats.skillsUsed - castsBefore;
        assert.ok(casts <= 1); waveCasts += casts;
      }
      let restored: GameEngine | undefined;
      if (frames++ % 50 === 0) {
        restored = new GameEngine(1, 'marsh'); assert.ok(restored.importSave(engine.exportSave()).ok);
        assert.equal(restored.difficulty, difficulty); assert.deepEqual(restored.upgrades, training); checkpoints++;
      }
      engine.update(.1);
      if (restored) { restored.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave()); }
      assert.ok(Number.isFinite(engine.state.gold) && engine.state.gold >= 0);
      for (const enemy of engine.state.enemies) assert.equal(enemy.maxHp, ENEMY_STATS[enemy.kind].hp * DIFFICULTY_MULTIPLIERS[difficulty].hp);
    }
    history.push({ wave: engine.state.wave, lives: engine.state.lives, kills: engine.state.kills, gold: engine.state.gold });
    assert.notEqual(engine.state.phase, 'battle', 'Every original wave resolves, without permanently stalled blockers.');
    if (engine.state.phase === 'intermission') { improveDefense(engine); engine.update(2); }
  }
  assert.equal(engine.state.phase, 'victory', `${levelId}/${difficulty}: ${JSON.stringify(history)}`);
  assert.equal(engine.state.wave, engine.level.waves.length); assert.equal(engine.state.lives, 20, JSON.stringify(history));
  const roster = engine.level.waves.flatMap(wave => wave.enemies);
  assert.equal(engine.state.kills, roster.reduce((sum, group) => sum + group.count, 0));
  const bounty = roster.reduce((sum, group) => sum + group.count * ENEMY_STATS[group.kind].gold, 0);
  const supply = engine.level.waves.reduce((sum, _, index) => sum + 25 + (index + 1) * 5, 0);
  assert.equal(engine.state.stats.goldEarned, bounty + supply, 'No enemy, starting purse, supply or skill cooldown is rewritten by the strategy.');
  assert.equal(engine.state.gold, engine.level.startGold + bounty + supply - engine.state.towers.reduce((sum, tower) => sum + getTowerInvestment(tower), 0));
  assert.equal(engine.state.stats.earlyWavesCalled, 0); assert.ok(checkpoints >= 40);
  assert.ok(engine.state.stats.skillsUsed > 0 && engine.state.stats.skillsUsed <= engine.level.waves.length * 10);
  assert.ok(engine.state.time < 600);
  const report = engine.state.report!;
  assert.equal(report.partial, false); assert.equal(report.totalKills, engine.state.kills);
  assert.equal(report.waves.reduce((sum, wave) => sum + wave.kills, 0), engine.state.kills);
  assert.equal(report.waves.reduce((sum, wave) => sum + wave.livesLost, 0), 0);
  return engine;
}

for (const difficulty of ['nightmare', 'inferno'] as const) for (const levelId of ['forest', 'volcano'] as const) {
  test(`${difficulty}/${levelId} can be cleared using twelve legal stars, earned gold and ordinary independent skill cooldowns`, () => {
    const engine = activeCampaign(levelId, difficulty);
    assert.equal(engine.state.kills, levelId === 'forest' ? 168 : 380);
  });
}

/** The old passive three-tower sequence, with the same twelve-star loadout. */
function conservativeForest(difficulty: Difficulty) {
  const engine = new GameEngine(0x51f0a7, 'forest', { difficulty, upgrades: training });
  engine.build(1, 'cannon'); const cannon = engine.state.towers[0]; engine.upgrade(cannon.id); engine.update(2);
  let peakEnemies = 0, peakHp = 0, furthest = 0;
  const fullyUpgrade = () => {
    for (const tower of engine.state.towers) while (tower.level < 3 && engine.state.gold >= getTowerStats(tower.kind, tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
  };
  const improve = () => {
    if (engine.state.wave >= 1) while (cannon.level < 3 && engine.state.gold >= getTowerStats('cannon', cannon.level).upgradeCost) assert.ok(engine.upgrade(cannon.id).ok);
    if (engine.state.wave >= 2) for (const ability of ['cannon-cluster', 'cannon-quake'] as const) {
      if (!cannon.abilities[ability] && engine.state.gold >= TOWER_ABILITIES[ability].costs[0]) assert.ok(engine.buyTowerAbility(cannon.id, ability).ok);
    }
    if (engine.state.wave >= 4 && !engine.state.towers.some(tower => tower.kind === 'mage')) {
      assert.ok(engine.build(5, 'mage').ok); assert.ok(engine.setTowerPriority(engine.state.towers.at(-1)!.id, 'strong').ok);
    }
    if (engine.state.wave >= 6 && !engine.state.towers.some(tower => tower.kind === 'barracks')) assert.ok(engine.build(6, 'barracks').ok);
    if (engine.state.phase !== 'battle') {
      fullyUpgrade();
      const mage = engine.state.towers.find(tower => tower.kind === 'mage');
      if (mage && engine.state.wave >= 7) for (const ability of ['mage-chain', 'mage-overload', 'mage-frost'] as const) {
        if (!mage.abilities[ability] && engine.state.gold >= TOWER_ABILITIES[ability].costs[0]) assert.ok(engine.buyTowerAbility(mage.id, ability).ok);
      }
    }
  };
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok); improve();
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
      improve(); engine.update(.1);
      peakEnemies = Math.max(peakEnemies, engine.state.enemies.length);
      peakHp = Math.max(peakHp, engine.state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0));
      furthest = Math.max(furthest, ...engine.state.enemies.map(enemy => enemy.progress));
      assert.ok(engine.state.gold >= 0);
    }
    assert.notEqual(engine.state.phase, 'battle'); improve(); engine.update(2);
  }
  assert.equal(engine.state.stats.skillsUsed, 0); assert.equal(engine.state.towers.length, 3);
  return { engine, peakEnemies, peakHp, furthest };
}

test('the old passive three-tower route loses eleven lives on nightmare and fails inferno instead of trivializing the new deployments', () => {
  const normal = conservativeForest('normal'), nightmare = conservativeForest('nightmare'), inferno = conservativeForest('inferno');
  assert.equal(normal.engine.state.phase, 'victory'); assert.equal(normal.engine.state.lives, 20);
  assert.equal(nightmare.engine.state.phase, 'victory'); assert.ok(nightmare.engine.state.lives <= 10);
  assert.equal(inferno.engine.state.phase, 'defeat'); assert.equal(inferno.engine.state.lives, 0);
  assert.ok(nightmare.peakEnemies > normal.peakEnemies && inferno.peakEnemies > nightmare.peakEnemies);
  assert.ok(nightmare.peakHp > normal.peakHp * 1.5 && inferno.peakHp > nightmare.peakHp);
  assert.ok(nightmare.furthest > normal.furthest * 1.5);
  assert.ok(nightmare.engine.state.report!.waves.reduce((sum, wave) => sum + wave.livesLost, 0) >= 10);
});
