import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerStats } from '../src/data';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import { getBranchChoiceCost, getTowerBranch, getTowerCombatStats, getTowerInvestment, TOWER_BRANCHES } from '../src/tower-branches';
import type { Enemy, Tower, TowerBranchId, TowerKind } from '../src/types';

let foeId = 750_000;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} should equal ${expected}`);
function elite(engine: GameEngine, kind: TowerKind, slot = 0): Tower {
  engine.state.gold = 20_000; assert.ok(engine.build(slot, kind).ok);
  const tower = engine.state.towers.at(-1)!;
  assert.ok(engine.upgrade(tower.id).ok); assert.ok(engine.upgrade(tower.id).ok);
  return tower;
}
function foe(engine: GameEngine, progress: number, kind: 'golem' | 'orc' = 'golem'): Enemy {
  return { id: foeId++, kind, ...engine.samplePath(progress), progress, hp: 10_000, maxHp: 10_000,
    attackTimer: 1000, blockedBy: null, slowTimer: 0, hitTimer: 0 };
}
function combat(engine: GameEngine): void {
  engine.state.phase = 'battle'; engine.state.wave = 1; engine.state.spawnQueue = [{ kind: 'goblin', time: 10000 }];
  const hero = engine.state.allies[0]; hero.x = hero.targetX = 1180; hero.y = hero.targetY = 680;
}

test('four elite towers expose exactly two mutually exclusive branches with real numerical tradeoffs', () => {
  assert.equal(Object.keys(TOWER_BRANCHES).length, 8);
  for (const kind of ['arrow', 'mage', 'cannon', 'barracks'] as const) {
    const options = Object.values(TOWER_BRANCHES).filter(branch => branch.towerKind === kind);
    assert.equal(options.length, 2);
    const engine = new GameEngine(), tower = elite(engine, kind);
    const first = getTowerCombatStats({ ...tower, branch: options[0].id }), second = getTowerCombatStats({ ...tower, branch: options[1].id });
    assert.notEqual(first.damage, second.damage); assert.notEqual(first.rate, second.rate);
    assert.ok(first.damage > 0 && second.damage > 0 && first.range > 0 && second.range > 0);
    for (const branch of options) assert.ok(branch.cost > 0 && branch.description && branch.stats && branch.icon);
  }
});

test('branch choices reject insufficient tier, funds, wrong class and repeat clicks without altering state', () => {
  const engine = new GameEngine(); engine.build(0, 'arrow'); const tower = engine.state.towers[0];
  const snapshot = engine.exportSave();
  for (const [id, branch] of [[tower.id, 'arrow-ranger'], [tower.id, 'mage-frost'], [9999, 'arrow-sniper'], [tower.id, 'bogus']] as [number, TowerBranchId][]) {
    assert.equal(engine.chooseTowerBranch(id, branch).ok, false); assert.deepEqual(engine.exportSave(), snapshot);
  }
  engine.state.gold = 1000; engine.upgrade(tower.id); engine.upgrade(tower.id); engine.state.gold = 119;
  const before = engine.exportSave(); assert.equal(engine.chooseTowerBranch(tower.id, 'arrow-ranger').ok, false); assert.deepEqual(engine.exportSave(), before);
  engine.state.gold = 120; assert.ok(engine.chooseTowerBranch(tower.id, 'arrow-ranger').ok);
  assert.equal(engine.state.gold, 0); assert.equal(tower.branchGoldSpent, 120);
  const chosen = engine.exportSave(); assert.equal(engine.chooseTowerBranch(tower.id, 'arrow-ranger').ok, false); assert.deepEqual(engine.exportSave(), chosen);
  assert.equal(getBranchChoiceCost(tower, 'arrow-ranger'), 0); assert.equal(getBranchChoiceCost(tower, 'arrow-sniper'), 60);
  engine.state.gold = 60; assert.ok(engine.chooseTowerBranch(tower.id, 'arrow-sniper').ok);
  assert.equal(engine.state.gold, 0); assert.equal(tower.branchGoldSpent, 180);
  assert.equal(getTowerBranch(tower)?.id, 'arrow-sniper'); assert.equal(getTowerCombatStats(tower).damage, 105);
});

test('conversion preserves specialties, their independent timers, targeting and all actual investment refunds', () => {
  const engine = new GameEngine(), tower = elite(engine, 'arrow');
  engine.buyTowerAbility(tower.id, 'arrow-deadeye'); engine.buyTowerAbility(tower.id, 'arrow-deadeye');
  tower.abilityTimers['arrow-deadeye'] = 2; engine.setTowerPriority(tower.id, 'strong');
  for (const id of ['arrow-ranger', 'arrow-sniper', 'arrow-ranger'] as TowerBranchId[]) assert.ok(engine.chooseTowerBranch(tower.id, id).ok);
  assert.deepEqual(tower.abilities, { 'arrow-deadeye': 2 }); assert.equal(tower.abilityTimers['arrow-deadeye'], 2);
  assert.equal(tower.targetPriority, 'strong'); assert.equal(tower.branchGoldSpent, 240);
  assert.equal(getTowerInvestment(tower), 840);
  const before = engine.state.gold; assert.ok(engine.sell(tower.id).ok); assert.equal(engine.state.gold - before, 588);
  engine.build(0, 'arrow'); assert.equal(engine.state.towers[0].branch, undefined); assert.equal(engine.state.towers[0].branchGoldSpent, undefined);
});

test('ranger actually fires rapidly while sniper reaches distant targets at its slower rate', () => {
  for (const branch of ['arrow-ranger', 'arrow-sniper'] as const) {
    const engine = new GameEngine(), tower = elite(engine, 'arrow'); engine.chooseTowerBranch(tower.id, branch); combat(engine);
    const target = foe(engine, 180); engine.state.enemies = [target]; engine.update(.7);
    const shots = branch === 'arrow-ranger' ? 3 : 1;
    close(target.hp, 10000 - shots * getTowerCombatStats(tower).damage * .35);
    const distant = foe(engine, 420); engine.state.enemies = [distant]; tower.attackTimer = 0; engine.update(.01);
    assert.equal(distant.hp < 10000, branch === 'arrow-sniper');
  }
});

test('arcane and frost spells deliver their different damage, rate and persistent control profiles', () => {
  for (const branch of ['mage-arcane', 'mage-frost'] as const) {
    const engine = new GameEngine(), tower = elite(engine, 'mage'); engine.chooseTowerBranch(tower.id, branch); combat(engine);
    const target = foe(engine, 180); engine.state.enemies = [target]; engine.update(.01);
    const stats = getTowerCombatStats(tower);
    close(target.hp, 10000 - stats.damage * .88); close(target.slowAmount!, stats.slowAmount!);
    close(target.slowTimer, stats.slowDuration!); close(tower.attackTimer, stats.rate);
  }
  const engine = new GameEngine(), tower = elite(engine, 'mage'); engine.chooseTowerBranch(tower.id, 'mage-frost'); combat(engine);
  const target = foe(engine, 180); engine.state.enemies = [target]; engine.update(.01); tower.attackTimer = 1000;
  engine.chooseTowerBranch(tower.id, 'mage-arcane'); tower.attackTimer = 0; engine.update(.01); tower.attackTimer = 1000;
  close(target.slowAmount!, .55);
  engine.update(1.8); tower.attackTimer = 0; engine.update(.01); tower.attackTimer = 1000;
  engine.update(.4); close(target.slowAmount!, .25);
});

test('cluster artillery really covers a wider area and siege artillery trades reach for armor/resistance breaking', () => {
  for (const branch of ['cannon-cluster', 'cannon-siege'] as const) {
    const engine = new GameEngine(), tower = elite(engine, 'cannon'); engine.chooseTowerBranch(tower.id, branch); combat(engine);
    const primary = foe(engine, 220), neighbor = foe(engine, 150), outside = foe(engine, 60);
    engine.state.enemies = [primary, neighbor, outside]; engine.update(.01);
    assert.ok(primary.hp < 10000); assert.equal(neighbor.hp < 10000, branch === 'cannon-cluster'); assert.equal(outside.hp, 10000);
    const radius = branch === 'cannon-cluster' ? 105 : 44;
    assert.ok(engine.state.effects.some(effect => effect.type === 'explosion' && effect.radius === radius));
    if (branch === 'cannon-siege') {
      close(primary.hp, 10000 - 132 * (1 - .65 + .18));
      close(primary.armorBreakAmount!, .18); close(primary.magicBreakAmount!, .12);
      const mage = elite(engine, 'mage', 1); tower.attackTimer = 1000; engine.update(.01); mage.attackTimer = 1000;
      close(primary.hp, 10000 - 132 * .53 - 118);
      engine.update(3.1); assert.equal(primary.armorBreakTimer, 0); assert.equal(primary.magicBreakTimer, 0);
    }
  }
});

test('barracks conversions preserve injured HP ratio and all doctrines/fortify through death and respawn', () => {
  const upgrades = deriveBattleUpgrades({ bulwark: 3 }), engine = new GameEngine(88, 'forest', { upgrades });
  const tower = elite(engine, 'barracks', 1); engine.buyTowerAbility(tower.id, 'barracks-fortify');
  const soldiers = engine.state.allies.filter(ally => ally.towerId === tower.id);
  soldiers[0].hp = soldiers[0].maxHp * .25; soldiers[1].hp = 0; soldiers[1].respawnTimer = .2;
  assert.ok(engine.chooseTowerBranch(tower.id, 'barracks-warden').ok);
  close(soldiers[0].maxHp, 390 * 1.18 + 55); close(soldiers[0].hp / soldiers[0].maxHp, .25);
  close(soldiers[0].armor, .63); assert.equal(soldiers[0].damage, 22); assert.equal(soldiers[1].hp, 0);
  assert.ok(engine.chooseTowerBranch(tower.id, 'barracks-blade').ok);
  close(soldiers[0].maxHp, 230 * 1.18 + 55); close(soldiers[0].hp / soldiers[0].maxHp, .25);
  close(soldiers[0].armor, .36); assert.equal(soldiers[0].damage, 49);
  engine.buyTowerAbility(tower.id, 'barracks-fortify');
  close(soldiers[0].maxHp, 230 * 1.18 + 110); close(soldiers[0].armor, .44);
  assert.equal(soldiers[1].hp, 0); combat(engine); engine.update(.3); assert.equal(soldiers[1].hp, soldiers[1].maxHp);
});

test('branch tower damage applies the captured permanent multiplier once and old tier III towers retain their original profile', () => {
  const engine = new GameEngine(88, 'forest', { upgrades: deriveBattleUpgrades({ marksman: 3 }) }), tower = elite(engine, 'arrow');
  assert.deepEqual(getTowerCombatStats(tower), getTowerStats('arrow', 3));
  engine.chooseTowerBranch(tower.id, 'arrow-ranger'); combat(engine);
  const target = foe(engine, 180); engine.state.enemies = [target]; engine.update(.01); close(target.hp, 10000 - 38 * 1.12 * .35);
});

test('branched soldiers and cumulative conversion costs restore exactly, and tampering fails atomically', () => {
  const engine = new GameEngine(88, 'forest', { upgrades: deriveBattleUpgrades({ bulwark: 3 }) }), tower = elite(engine, 'barracks', 1);
  engine.buyTowerAbility(tower.id, 'barracks-fortify'); engine.chooseTowerBranch(tower.id, 'barracks-warden'); engine.chooseTowerBranch(tower.id, 'barracks-blade');
  const soldiers = engine.state.allies.filter(a => a.type === 'soldier'); soldiers[0].hp *= .3; soldiers[1].hp = 0; soldiers[1].respawnTimer = 2;
  const save = engine.exportSave(), restored = new GameEngine(); assert.ok(restored.importSave(save).ok); assert.deepEqual(restored.exportSave(), save);
  for (let tick = 0; tick < 40; tick++) { engine.update(.1); restored.update(.1); }
  assert.deepEqual(restored.exportSave(), engine.exportSave());
  const mutations = [
    (copy: typeof save) => { copy.state.towers[0].branch = 'arrow-sniper'; },
    (copy: typeof save) => { copy.state.towers[0].level = 2; },
    (copy: typeof save) => { copy.state.towers[0].branchGoldSpent = 0; },
    (copy: typeof save) => { copy.state.towers[0].branchGoldSpent = 196; },
    (copy: typeof save) => { copy.state.allies.find(a => a.type === 'soldier')!.maxHp += 5; },
  ];
  const receiverBefore = restored.exportSave();
  for (const mutate of mutations) { const corrupt = structuredClone(save); mutate(corrupt); assert.equal(restored.importSave(corrupt).ok, false); assert.deepEqual(restored.exportSave(), receiverBefore); }
});
