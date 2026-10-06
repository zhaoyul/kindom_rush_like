import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerAbilities, getTowerStats, LEVELS, PATH, PATH_LENGTH, SLOTS, TOWER_ABILITIES, WAVES } from '../src/data';
import { GameEngine } from '../src/engine';
import type { Enemy, EnemyKind, GameSave, LevelId, Tower, TowerKind } from '../src/types';

function close(actual: number, expected: number): void { assert.ok(Math.abs(actual - expected) < 0.001, `${actual} should equal ${expected}`); }
let foeId = 500_000;
function enemy(engine: GameEngine, kind: EnemyKind, progress: number, hp = ENEMY_STATS[kind].hp): Enemy {
  return { id: foeId++, kind, ...engine.samplePath(progress), hp, maxHp: hp, progress, attackTimer: 1000, blockedBy: null, slowTimer: 0, hitTimer: 0 };
}
function fakeBattle(engine: GameEngine): void {
  engine.state.phase = 'battle'; engine.state.wave = 1; engine.state.spawnQueue = [{ kind: 'goblin', time: 10000 }];
  const hero = engine.state.allies[0]; hero.x = hero.targetX = 1180; hero.y = hero.targetY = 680;
}
function cannon(engine: GameEngine, tier = 1): Tower {
  engine.state.gold = 20000; assert.ok(engine.build(0, 'cannon').ok);
  const tower = engine.state.towers[0]; while (tower.level < tier) assert.ok(engine.upgrade(tower.id).ok);
  return tower;
}

test('four campaign maps preserve the original level and have distinct usable routes and defenses', () => {
  assert.deepEqual(LEVELS.map(level => level.id), ['forest', 'marsh', 'frost', 'volcano']);
  assert.equal(LEVELS[0].path, PATH); assert.equal(LEVELS[0].slots, SLOTS); assert.equal(LEVELS[0].waves, WAVES); assert.equal(LEVELS[0].pathLength, PATH_LENGTH);
  assert.equal(new Set(LEVELS.map(level => JSON.stringify(level.path))).size, 4);
  assert.equal(new Set(LEVELS.map(level => JSON.stringify(level.slots))).size, 4);
  for (const level of LEVELS) {
    assert.ok(level.waves.length >= 6 && level.pathLength > 1500);
    const engine = new GameEngine(91, level.id);
    assert.equal(engine.state.gold, level.startGold); assert.equal(engine.state.lives, level.lives);
    assert.deepEqual({ x: engine.state.allies[0].x, y: engine.state.allies[0].y }, level.heroSpawn);
    for (const slot of level.slots) {
      const rally = engine.nearestPathPoint(slot), sampled = engine.samplePath(rally.progress);
      close(rally.x, sampled.x); close(rally.y, sampled.y);
      assert.ok(Math.hypot(rally.x - slot.x, rally.y - slot.y) < 150, 'Every construction site has an accessible road.');
    }
    assert.deepEqual(engine.samplePath(engine.pathLength), level.path.at(-1));
    assert.equal(engine.build(level.slots[0].id, 'cannon').ok, true);
    engine.reset(); assert.equal(engine.level.id, level.id); assert.equal(engine.state.gold, level.startGold);
  }
});

test('all six new ground enemy roles appear in the campaign and expose complete combat profiles', () => {
  const kinds: EnemyKind[] = ['bogling', 'serpent', 'icewolf', 'frostguard', 'imp', 'juggernaut'];
  assert.equal(Object.keys(ENEMY_STATS).length, 12);
  const used = new Set(LEVELS.flatMap(level => level.waves.flatMap(wave => wave.enemies.map(group => group.kind))));
  for (const kind of kinds) {
    const stats = ENEMY_STATS[kind]; assert.ok(used.has(kind));
    for (const key of ['hp', 'speed', 'damage', 'attackRate', 'gold', 'lives'] as const) assert.ok(stats[key] > 0);
    assert.ok(stats.armor >= 0 && stats.armor < 1 && stats.magicResist >= 0 && stats.magicResist < 1);
    assert.ok(stats.description.length > 10);
  }
  assert.ok(LEVELS.at(-1)!.waves.at(-1)!.enemies.some(group => group.kind === 'juggernaut'));
});

test('ordinary cannon shells apply bounded area damage with each enemy physical armor', () => {
  for (const tier of [1, 2, 3]) {
    const engine = new GameEngine(); const tower = cannon(engine, tier); fakeBattle(engine);
    const foes = [enemy(engine, 'orc', 200, 1000), enemy(engine, 'golem', 170, 1000), enemy(engine, 'wolf', 90, 1000)];
    engine.state.enemies = foes; engine.update(0.01);
    close(foes[0].hp, 1000 - getTowerStats('cannon', tier).damage * (1 - ENEMY_STATS.orc.armor));
    close(foes[1].hp, 1000 - getTowerStats('cannon', tier).damage * (1 - ENEMY_STATS.golem.armor));
    assert.equal(foes[2].hp, 1000);
    assert.ok(engine.state.effects.some(effect => effect.type === 'shell' && effect.maxLife === 0.45 && effect.style === 'cannon'));
    assert.ok(engine.state.effects.some(effect => effect.type === 'explosion' && effect.radius === [48, 58, 68][tier - 1] && effect.maxLife === 1.03));
    close(tower.attackAnimation!, 0.45);
  }
});

test('cannon elite purchases unlock three two-rank specialties and keep economy transactional', () => {
  const engine = new GameEngine(); const tower = cannon(engine); const initialGold = engine.state.gold;
  assert.equal(engine.buyTowerAbility(tower.id, 'cannon-cluster').ok, false); assert.equal(engine.state.gold, initialGold);
  engine.upgrade(tower.id); engine.upgrade(tower.id);
  for (const ability of getTowerAbilities('cannon')) {
    assert.ok(engine.buyTowerAbility(tower.id, ability.id).ok); assert.ok(engine.buyTowerAbility(tower.id, ability.id).ok);
    assert.equal(engine.buyTowerAbility(tower.id, ability.id).ok, false); assert.equal(tower.abilities[ability.id], 2);
  }
  assert.equal(engine.buyTowerAbility(tower.id, 'mage-chain').ok, false);
  const beforeSell = engine.state.gold;
  const invested = 130 + 140 + 205 + getTowerAbilities('cannon').reduce((total, ability) => total + ability.costs[0] + ability.costs[1], 0);
  assert.ok(engine.sell(tower.id).ok); assert.equal(engine.state.gold - beforeSell, Math.floor(invested * 70 / 100));
});

test('cluster blast increases reach and quake slows a whole group for the purchased duration', () => {
  for (const rank of [1, 2]) for (const kind of ['cannon-cluster', 'cannon-quake'] as const) {
    const engine = new GameEngine(); const tower = cannon(engine, 3); fakeBattle(engine);
    for (let index = 0; index < rank; index++) assert.ok(engine.buyTowerAbility(tower.id, kind).ok);
    tower.attackTimer = 1000;
    const targets = [enemy(engine, 'goblin', 200, 1000), enemy(engine, 'goblin', 130, 1000), enemy(engine, 'goblin', 30, 1000)]; engine.state.enemies = targets;
    engine.update(0.01);
    const damage = kind === 'cannon-cluster' ? rank === 1 ? 80 : 125 : rank === 1 ? 30 : 50;
    close(targets[0].hp, 1000 - damage); close(targets[1].hp, 1000 - damage); assert.equal(targets[2].hp, 1000);
    assert.ok(tower.abilityTimers[kind]! > 6);
    if (kind === 'cannon-quake') { close(targets[0].slowAmount!, rank === 1 ? 0.4 : 0.6); close(targets[0].slowTimer, rank === 1 ? 3 : 4); }
    else assert.ok(engine.state.effects.some(effect => effect.type === 'shell' && effect.style === kind));
  }
});

test('piercing critical shells weaken armor temporarily and seeded rolls survive resets', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine(1); const tower = cannon(engine, 3); fakeBattle(engine);
    for (let index = 0; index < rank; index++) engine.buyTowerAbility(tower.id, 'cannon-pierce');
    const target = enemy(engine, 'golem', 180, 1000); engine.state.enemies = [target]; engine.update(0.01);
    assert.equal(target.armorBreakAmount, rank === 1 ? 0.2 : 0.35);
    close(target.hp, 1000 - 98 * (rank === 1 ? 2.5 : 3.5) * (1 - 0.65 + (rank === 1 ? 0.2 : 0.35)));
    tower.attackTimer = 1000; engine.update((rank === 1 ? 3 : 5) + 0.01);
    assert.equal(target.armorBreakAmount, 0); assert.equal(target.armorBreakTimer, 0);
  }
});

test('bog regeneration, icewolf slow resistance and serpent poison are actual simulation mechanics', () => {
  const regen = new GameEngine(); fakeBattle(regen); const mud = enemy(regen, 'bogling', 180); mud.hp -= 20; regen.state.enemies = [mud]; regen.update(1); close(mud.hp, mud.maxHp - 17);
  const normal = new GameEngine(); fakeBattle(normal); const wolf = enemy(normal, 'wolf', 180); wolf.slowTimer = 2; wolf.slowAmount = 0.6; normal.state.enemies = [wolf]; normal.update(1); close(wolf.progress, 180 + 88 * 0.4);
  const frozen = new GameEngine(); fakeBattle(frozen); const icewolf = enemy(frozen, 'icewolf', 180); icewolf.slowTimer = 2; icewolf.slowAmount = 0.6; frozen.state.enemies = [icewolf]; frozen.update(1); close(icewolf.progress, 180 + 83 * 0.7);
  const poison = new GameEngine(); fakeBattle(poison); const hero = poison.state.allies[0], snake = enemy(poison, 'serpent', 180);
  hero.x = hero.targetX = snake.x; hero.y = hero.targetY = snake.y; hero.attackTimer = 1000; hero.engagedWith = snake.id; snake.blockedBy = hero.id; snake.attackTimer = 0;
  poison.state.enemies = [snake]; poison.update(0.01); const hp = hero.hp; assert.equal(hero.poisonTimer, 3);
  snake.attackTimer = 1000; poison.update(1); close(hero.hp, hp - 4);
  poison.update(2.01); assert.equal(hero.poisonTimer, 0);
});

test('imp death bursts once and juggernaut hammer hurts nearby allies but not distant ones', () => {
  const engine = new GameEngine(); fakeBattle(engine); const hero = engine.state.allies[0], imp = enemy(engine, 'imp', 180);
  hero.x = hero.targetX = imp.x; hero.y = hero.targetY = imp.y; engine.state.enemies = [imp];
  assert.ok(engine.castSkill('meteor', imp.x, imp.y).ok); close(hero.hp, hero.maxHp - 24);
  engine.update(0.1); close(hero.hp, hero.maxHp - 24); assert.equal(engine.state.kills, 1);
  const boss = new GameEngine(); fakeBattle(boss); const lord = enemy(boss, 'juggernaut', 180), guard = boss.state.allies[0];
  guard.x = guard.targetX = lord.x; guard.y = guard.targetY = lord.y; guard.attackTimer = 1000; guard.engagedWith = lord.id; lord.blockedBy = guard.id; lord.attackTimer = 0;
  boss.state.enemies = [lord]; boss.castSkill('reinforce', lord.x + 20, lord.y); const friends = boss.state.allies.filter(ally => ally.type === 'reinforcement');
  friends.forEach(friend => friend.attackTimer = 1000); boss.update(0.01);
  close(guard.hp, guard.maxHp - 58 * 0.7); friends.forEach(friend => close(friend.hp, 185 - 22 * 0.75));
});

function realCheckpoint(levelId: LevelId = 'forest'): GameEngine {
  const engine = new GameEngine(0x71f07, levelId);
  engine.build(1, 'arrow'); engine.build(5, 'mage'); engine.build(8, 'barracks'); engine.update(2);
  assert.ok(engine.startWave().ok); engine.update(8); return engine;
}

test('JSON checkpoints reproduce an ongoing battle, its random rolls and wave completion exactly', () => {
  for (const levelId of ['forest', 'marsh', 'frost', 'volcano'] as LevelId[]) {
    const original = realCheckpoint(levelId), restored = new GameEngine();
    const save = JSON.parse(JSON.stringify(original.exportSave())); assert.equal(restored.importSave(save).ok, true, levelId);
    assert.equal(restored.level.id, levelId); assert.deepEqual(restored.exportSave(), original.exportSave());
    for (let tick = 0; tick < 600; tick++) { original.update(0.1); restored.update(0.1); }
    assert.deepEqual(restored.exportSave(), original.exportSave(), `${levelId} resumes the exact same timeline.`);
  }
});

test('stored snapshots own their data and reset restores the saved level and seed', () => {
  const original = realCheckpoint('marsh'), checkpoint = original.exportSave(), restored = new GameEngine(2);
  assert.ok(restored.importSave(checkpoint).ok); checkpoint.state.gold = 999999; checkpoint.runtime.nextId = 888888;
  assert.notEqual(restored.state.gold, 999999); assert.notEqual(restored.exportSave().runtime.nextId, 888888);
  original.state.gold = 55555; assert.notEqual(checkpoint.state.gold, original.state.gold);
  restored.reset(); assert.equal(restored.level.id, 'marsh'); assert.equal(restored.state.gold, LEVELS[1].startGold);
  assert.equal(restored.exportSave().seed, 0x71f07);
});

test('invalid or corrupt saves fail atomically and cannot create broken combat references', () => {
  const receiver = realCheckpoint('marsh'); const original = receiver.exportSave(); const template = realCheckpoint().exportSave();
  const edits: ((save: GameSave) => void)[] = [
    save => { save.version = 2 as 1; }, save => { save.levelId = 'other' as LevelId; },
    save => { save.state.gold = -5; }, save => { save.state.gold = Number.NaN; }, save => { save.state.allies = []; },
    save => { save.state.towers[0].kind = 'unknown' as TowerKind; }, save => { save.state.towers[0].slotId = 500; },
    save => { save.state.towers[0].abilities['mage-chain'] = 2; }, save => { save.state.enemies[0].kind = 'unknown' as EnemyKind; },
    save => { save.state.enemies[0].blockedBy = 99999; }, save => { save.state.enemies[0].x += 50; },
    save => { save.state.allies[0].engagedWith = 99999; }, save => { save.state.skillCooldowns['hero-dash'] = 500; },
    save => { save.runtime.nextId = 1; }, save => { save.runtime.randomState = 0; }, save => { save.runtime.commandedMovement.push(99999); },
    save => { save.runtime.slowEffects.push([99999, [['frost', { amount: 0.5, remaining: 1 }]]]); },
    save => { save.runtime.frostZones.push({x:100,y:100,sourceId:9999,amount:0.5,radius:85,remaining:2}); },
  ];
  for (const edit of edits) { const damaged = structuredClone(template); edit(damaged); assert.equal(receiver.importSave(damaged).ok, false); assert.deepEqual(receiver.exportSave(), original); }
  for (const invalid of [null, undefined, [], {}, 'broken', { version: 1 }, { data: 'x'.repeat(2_000_001) }]) {
    assert.equal(receiver.importSave(invalid).ok, false); assert.deepEqual(receiver.exportSave(), original);
  }
});

function improve(engine: GameEngine, plan: [number, TowerKind][]): void {
  for (const [slotId, kind] of plan) {
    let tower = engine.state.towers.find(tower => tower.slotId === slotId);
    if (!tower && engine.state.gold >= getTowerStats(kind, 1).cost) { assert.ok(engine.build(slotId, kind).ok); tower = engine.state.towers.at(-1)!; }
    if (!tower) break;
    while (tower.level < 3 && engine.state.gold >= getTowerStats(kind, tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
  }
  for (const tower of engine.state.towers.filter(tower => tower.level === 3)) for (const ability of getTowerAbilities(tower.kind)) {
    const rank = tower.abilities[ability.id] ?? 0;
    if (rank < 2 && engine.state.gold >= ability.costs[rank]) assert.ok(engine.buyTowerAbility(tower.id, ability.id).ok);
  }
}

for (const level of LEVELS.slice(1)) test(`${level.name} is winnable with earned gold, mixed defenses and tactical skills`, () => {
  const engine = new GameEngine(12345, level.id);
  const plan: [number, TowerKind][] = level.id === 'frost'
    ? [[0,'arrow'],[3,'mage'],[2,'barracks'],[1,'cannon'],[4,'mage'],[6,'mage'],[7,'cannon'],[5,'arrow'],[8,'mage'],[9,'arrow']]
    : [[1,'cannon'],[2,'mage'],[3,'barracks'],[4,'mage'],[5,'arrow'],[6,'mage'],[7,'cannon'],[8,'mage'],[9,'arrow'],[0,'arrow']];
  for (const [slotId, kind] of plan.slice(0, level.id === 'frost' ? 4 : 3)) assert.ok(engine.build(slotId, kind).ok);
  engine.update(3); const history: object[] = []; const savedStatuses = new Set<string>();
  while (engine.state.phase !== 'victory' && engine.state.phase !== 'defeat') {
    assert.ok(engine.startWave().ok);
    for (let tick = 0; tick < 9000 && engine.state.phase === 'battle'; tick++) {
      const foe = engine.state.enemies.filter(enemy => enemy.x > 30).sort((a,b) => b.progress - a.progress)[0];
      if (foe) for (const kind of ['meteor', 'reinforce', 'hero-roots', 'hero-dash', 'hero', 'hero-oath'] as const) engine.castSkill(kind, foe.x, foe.y);
      engine.update(0.1); assert.ok(engine.state.gold >= 0); assert.ok(engine.state.lives >= 0 && engine.state.lives <= level.lives);
      const active = [
        ['poison', engine.state.allies.some(ally => (ally.poisonTimer ?? 0) > 0)],
        ['buff', engine.state.allies.some(ally => (ally.buffTimer ?? 0) > 0)],
        ['respawn', engine.state.allies.some(ally => ally.type !== 'reinforcement' && ally.hp === 0 && ally.respawnTimer > 0)],
        ['fortify', engine.state.towers.some(tower => (tower.abilities['barracks-fortify'] ?? 0) > 0)],
        ['pierce', engine.state.enemies.some(enemy => (enemy.armorBreakTimer ?? 0) > 0)],
        ['roots', engine.state.enemies.some(enemy => (enemy.rootTimer ?? 0) > 0)],
        ['quake', engine.state.effects.some(effect => effect.style === 'cannon-quake')],
        ['frost', engine.state.effects.some(effect => effect.type === 'frost-zone')],
      ] as const;
      for (const [name, present] of active) if (present && !savedStatuses.has(name)) {
        const save = engine.exportSave(), restored = new GameEngine();
        assert.ok(restored.importSave(save).ok, `${level.id} ${name} checkpoint`);
        assert.deepEqual(restored.exportSave(), save); savedStatuses.add(name);
      }
      if (tick % 50 === 0) {
        const save = engine.exportSave(), restored = new GameEngine();
        assert.ok(restored.importSave(save).ok, `${level.id} battle checkpoint at ${engine.state.time}`);
        restored.update(0.1); engine.update(0.1);
        assert.deepEqual(restored.exportSave(), engine.exportSave(), 'A restored checkpoint must match the continuing original.');
      }
    }
    history.push({ wave:engine.state.wave, lives:engine.state.lives, gold:engine.state.gold });
    assert.notEqual(engine.state.phase, 'battle', 'Every wave must resolve.');
    const checkpoint = engine.exportSave(), resumed = new GameEngine();
    assert.ok(resumed.importSave(checkpoint).ok, `End-of-wave save must be valid: ${JSON.stringify(history)}`);
    assert.deepEqual(resumed.exportSave(), checkpoint);
    if (engine.state.phase === 'intermission') { improve(engine, plan); engine.update(3); }
  }
  assert.equal(engine.state.phase, 'victory', JSON.stringify(history)); assert.equal(engine.state.lives, 20, JSON.stringify(history));
  assert.equal(engine.state.wave, level.waves.length); assert.equal(engine.state.kills, level.waves.flatMap(wave => wave.enemies).reduce((sum, group) => sum + group.count, 0));
  assert.ok(engine.state.stats.skillsUsed > 0);
  if (level.id === 'marsh') for (const status of ['poison']) assert.ok(savedStatuses.has(status), status);
  if (level.id === 'volcano') for (const status of ['poison', 'buff', 'respawn', 'fortify', 'pierce', 'roots', 'quake']) assert.ok(savedStatuses.has(status), status);
  engine.update(60); const completed = new GameEngine();
  assert.ok(completed.importSave(engine.exportSave()).ok, 'A victory screen left open remains resumable after temporary reinforcements expire.');
});
