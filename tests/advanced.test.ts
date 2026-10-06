import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerAbilities, getTowerStats, HERO_SKILLS, HERO_STATS, nearestPathPoint, samplePath, SKILLS, TOWER_ABILITIES } from '../src/data';
import { GameEngine } from '../src/engine';
import type { Enemy, EnemyKind, Tower, TowerAbilityKind, TowerKind } from '../src/types';

let nextEnemy = 400_000;
function enemy(kind: EnemyKind, progress: number, hp = ENEMY_STATS[kind].hp): Enemy {
  return { id: nextEnemy++, kind, ...samplePath(progress), progress, hp, maxHp: hp,
    attackTimer: 10_000, blockedBy: null, slowTimer: 0, hitTimer: 0, rootTimer: 0 };
}
function close(actual: number, expected: number, tolerance = 0.001): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be ${expected}`);
}
function battle(engine: GameEngine): void {
  engine.state.phase = 'battle';
  engine.state.wave = 1;
  engine.state.spawnQueue = [{ kind: 'goblin', time: 100_000 }];
}
function maxTower(engine: GameEngine, kind: TowerKind, slotId = 0): Tower {
  engine.state.gold = 20_000;
  assert.ok(engine.build(slotId, kind).ok);
  const tower = engine.state.towers.at(-1)!;
  assert.ok(engine.upgrade(tower.id).ok);
  assert.ok(engine.upgrade(tower.id).ok);
  tower.attackTimer = 10_000;
  return tower;
}
function learn(engine: GameEngine, tower: Tower, kind: TowerAbilityKind, rank = 1): void {
  for (let level = 0; level < rank; level++) assert.ok(engine.buyTowerAbility(tower.id, kind).ok);
}
function remoteHero(engine: GameEngine): void {
  const hero = engine.state.allies[0];
  hero.x = hero.targetX = 1180;
  hero.y = hero.targetY = 680;
}

test('each elite tower has three distinct two-rank branches, and the hero has four independent powers', () => {
  assert.equal(Object.keys(TOWER_ABILITIES).length, 12);
  for (const kind of ['arrow', 'mage', 'barracks', 'cannon'] as const) {
    const abilities = getTowerAbilities(kind);
    assert.equal(abilities.length, 3);
    assert.equal(new Set(abilities.map(a => a.id)).size, 3);
    for (const ability of abilities) {
      assert.equal(ability.towerKind, kind);
      assert.equal(ability.costs.length, 2);
      assert.ok(ability.costs[0] > 0 && ability.costs[1] > 0);
      assert.ok(ability.rankDescriptions.every(Boolean));
    }
  }
  assert.deepEqual(HERO_SKILLS, ['hero', 'hero-dash', 'hero-roots', 'hero-oath']);
  assert.equal(SKILLS['hero-dash'].target, 'point');
  assert.equal(SKILLS['hero-oath'].target, 'hero');
});

test('ability purchase is transactional, tower-specific, requires tier III, and stops after rank II', () => {
  const engine = new GameEngine();
  engine.build(0, 'arrow');
  const tower = engine.state.towers[0];
  const initialGold = engine.state.gold;
  assert.equal(engine.buyTowerAbility(tower.id, 'arrow-volley').ok, false);
  assert.equal(engine.buyTowerAbility(tower.id, 'mage-chain').ok, false);
  assert.equal(engine.buyTowerAbility(9999, 'arrow-volley').ok, false);
  assert.equal(engine.buyTowerAbility(tower.id, 'invalid' as TowerAbilityKind).ok, false);
  assert.equal(engine.state.gold, initialGold);
  assert.deepEqual(tower.abilities, {});
  engine.state.gold = 20_000;
  engine.upgrade(tower.id);
  engine.upgrade(tower.id);
  engine.state.gold = 89;
  assert.equal(engine.buyTowerAbility(tower.id, 'arrow-volley').ok, false);
  assert.equal(engine.state.gold, 89);
  engine.state.gold = 230;
  assert.ok(engine.buyTowerAbility(tower.id, 'arrow-volley').ok);
  assert.equal(engine.state.gold, 140);
  assert.ok(engine.buyTowerAbility(tower.id, 'arrow-volley').ok);
  assert.equal(engine.state.gold, 0);
  assert.equal(tower.abilities['arrow-volley'], 2);
  assert.equal(engine.buyTowerAbility(tower.id, 'arrow-volley').ok, false);
  assert.equal(tower.abilities['arrow-deadeye'], undefined);
  assert.equal(tower.abilityTimers['arrow-volley'], 0);
  engine.state.phase = 'victory';
  engine.state.gold = 500;
  assert.equal(engine.buyTowerAbility(tower.id, 'arrow-deadeye').ok, false);
  assert.equal(engine.state.gold, 500);
});

test('selling refunds all purchased ranks at exactly seventy percent and new towers do not inherit skills', () => {
  const engine = new GameEngine();
  const tower = maxTower(engine, 'arrow');
  learn(engine, tower, 'arrow-deadeye', 2);
  learn(engine, tower, 'arrow-volley');
  const before = engine.state.gold;
  assert.ok(engine.sell(tower.id).ok);
  assert.equal(engine.state.gold - before, 483); // (330 base + 270 deadeye + 90 volley) * 70 / 100.
  engine.build(0, 'arrow');
  assert.deepEqual(engine.state.towers[0].abilities, {});
  assert.deepEqual(engine.state.towers[0].abilityTimers, {});
  const plain = new GameEngine();
  plain.build(0, 'arrow');
  plain.upgrade(plain.state.towers[0].id);
  plain.upgrade(plain.state.towers[0].id);
  const plainBefore = plain.state.gold;
  plain.sell(plain.state.towers[0].id);
  assert.equal(plain.state.gold - plainBefore, 231);
});

test('volley adds bounded physical area damage and each rank has its own cooldown', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'arrow');
    learn(engine, tower, 'arrow-volley', rank);
    const targets = [enemy('golem', 180, 1000), enemy('golem', 150, 1000), enemy('golem', 80, 1000)];
    engine.state.enemies = targets;
    battle(engine);
    engine.update(0.01);
    const damage = (rank === 1 ? 38 : 58) * (1 - ENEMY_STATS.golem.armor);
    close(targets[0].hp, 1000 - damage);
    close(targets[1].hp, 1000 - damage);
    assert.equal(targets[2].hp, 1000);
    close(tower.abilityTimers['arrow-volley']!, rank === 1 ? 8 : 6);
    assert.ok(engine.state.effects.some(e => e.type === 'ring' && e.style === 'arrow-volley' && e.radius === 70));
    const health = targets[0].hp;
    engine.update(1);
    assert.equal(targets[0].hp, health);
  }
});

function criticalTrace(kind: 'arrow' | 'mage', rank: number, seed: number, repeatEngine?: GameEngine): number[] {
  const engine = repeatEngine ?? new GameEngine(seed);
  remoteHero(engine);
  const tower = maxTower(engine, kind);
  learn(engine, tower, kind === 'arrow' ? 'arrow-deadeye' : 'mage-overload', rank);
  const boss = enemy('chieftain', 180, 1_000_000);
  engine.state.enemies = [boss];
  battle(engine);
  return Array.from({ length: 100 }, () => {
    tower.attackTimer = 0;
    const before = boss.hp;
    engine.update(0.001);
    return Math.round((before - boss.hp) * 1000) / 1000;
  });
}

test('deadeye and overload produce reproducible normal/critical shots at both ranks without executing bosses', () => {
  for (const kind of ['arrow', 'mage'] as const) {
    for (const rank of [1, 2]) {
      const trace = criticalTrace(kind, rank, 123456);
      assert.deepEqual(trace, criticalTrace(kind, rank, 123456));
      assert.notDeepEqual(trace, criticalTrace(kind, rank, 987654));
      const stats = getTowerStats(kind, 3);
      const base = stats.damage * (kind === 'arrow' ? 0.6 : 0.8);
      const multiplier = kind === 'arrow' ? (rank === 1 ? 3 : 4) : (rank === 1 ? 2.5 : 3.5);
      assert.ok(trace.some(damage => Math.abs(damage - base) < 0.001));
      assert.ok(trace.some(damage => Math.abs(damage - base * multiplier) < 0.001));
      assert.ok(trace.every(damage => Math.abs(damage - base) < 0.001 || Math.abs(damage - base * multiplier) < 0.001));
      assert.ok(Math.max(...trace) < ENEMY_STATS.chieftain.hp / 4);
    }
  }
});

test('poison-vine arrows reduce movement by the purchased fraction and then expire', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'arrow');
    learn(engine, tower, 'arrow-snare', rank);
    tower.attackTimer = 0;
    const target = enemy('golem', 180, 1000);
    engine.state.enemies = [target];
    battle(engine);
    engine.update(0.01);
    const amount = rank === 1 ? 0.35 : 0.55, duration = rank === 1 ? 2.5 : 3.5;
    close(target.slowAmount!, amount);
    close(target.slowTimer, duration);
    tower.attackTimer = 10_000;
    const progress = target.progress;
    engine.update(0.1);
    close(target.progress - progress, ENEMY_STATS.golem.speed * (1 - amount) * 0.1);
    engine.update(duration);
    assert.equal(target.slowTimer, 0);
    assert.equal(target.slowAmount, 0);
  }
});

test('chain lightning hits three or four unique enemies and follows their ordered positions', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'mage');
    learn(engine, tower, 'mage-chain', rank);
    const targets = [160, 180, 200, 220, 240].map(progress => enemy('golem', progress, 1000));
    engine.state.enemies = targets;
    battle(engine);
    engine.update(0.01);
    const hit = targets.filter(target => target.hp < 1000);
    assert.equal(hit.length, rank === 1 ? 3 : 4);
    for (const target of hit) close(target.hp, 1000 - (rank === 1 ? 85 : 125) * 0.88);
    const chain = engine.state.effects.find(effect => effect.type === 'chain')!;
    assert.ok(chain);
    assert.equal(chain.points!.length, hit.length + 1);
    assert.equal(chain.points![0].x, tower.x);
    close(tower.abilityTimers['mage-chain']!, rank === 1 ? 7 : 5);
  }
});

test('frost creates a lasting area, slows later entrants, and ends its control when the field expires', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'mage');
    learn(engine, tower, 'mage-frost', rank);
    const target = enemy('golem', 180, 1000), later = enemy('golem', 60, 1000);
    engine.state.enemies = [target, later];
    battle(engine);
    engine.update(0.01);
    close(target.hp, 1000 - (rank === 1 ? 30 : 50) * 0.88);
    close(target.slowAmount!, rank === 1 ? 0.5 : 0.65);
    assert.equal(later.slowTimer, 0);
    close(tower.abilityTimers['mage-frost']!, rank === 1 ? 9 : 7);
    assert.ok(engine.state.effects.some(e => e.type === 'frost-zone' && e.radius === 85));
    later.progress = 150;
    Object.assign(later, samplePath(later.progress));
    engine.update(0.01);
    close(later.slowAmount!, rank === 1 ? 0.5 : 0.65);
    assert.equal(later.hp, 1000, 'Entering after the opening burst gets control rather than repeated damage.');
    tower.abilityTimers['mage-frost'] = 10_000;
    engine.update((rank === 1 ? 3.5 : 4.5) + 0.2);
    assert.equal(engine.state.effects.some(e => e.type === 'frost-zone'), false);
    assert.equal(target.slowTimer, 0);
    assert.equal(later.slowTimer, 0);
  }
});

test('a weaker magic hit cannot erase an active stronger slow, and its remaining duration resumes later', () => {
  const engine = new GameEngine();
  remoteHero(engine);
  const arrow = maxTower(engine, 'arrow');
  const mage = maxTower(engine, 'mage', 1);
  learn(engine, arrow, 'arrow-snare', 2);
  const target = enemy('golem', 300, 10_000);
  engine.state.enemies = [target];
  battle(engine);
  arrow.attackTimer = 0;
  engine.update(0.01);
  arrow.attackTimer = 10_000;
  mage.attackTimer = 0;
  engine.update(0.01);
  close(target.slowAmount!, 0.55);
  mage.attackTimer = 10_000;
  engine.update(3.2);
  mage.attackTimer = 0;
  engine.update(0.01);
  mage.attackTimer = 10_000;
  close(target.slowAmount!, 0.55);
  engine.update(0.4);
  close(target.slowAmount!, 0.35);
  assert.ok(target.slowTimer > 0.8);
});

test('each soldier cleaves on its third hit, damaging nearby foes with the appropriate armor mitigation', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'barracks', 1);
    learn(engine, tower, 'barracks-cleave', rank);
    engine.update(3);
    const soldiers = engine.state.allies.filter(a => a.towerId === tower.id);
    const soldier = soldiers[0];
    for (const other of soldiers.slice(1)) { other.hp = 0; other.respawnTimer = 10_000; }
    const position = samplePath(180);
    soldier.x = soldier.targetX = position.x;
    soldier.y = soldier.targetY = position.y;
    const primary = enemy('golem', 180, 1000), neighbor = enemy('golem', 205, 1000);
    primary.blockedBy = soldier.id;
    soldier.engagedWith = primary.id;
    engine.state.enemies = [primary, neighbor];
    battle(engine);
    for (let hit = 0; hit < 2; hit++) { soldier.attackTimer = 0; engine.update(0.01); }
    assert.equal(neighbor.hp, 1000);
    soldier.attackTimer = 0;
    engine.update(0.01);
    const splash = (rank === 1 ? 22 : 36) * 0.35;
    close(neighbor.hp, 1000 - splash);
    close(primary.hp, 1000 - 3 * soldier.damage * 0.35 - splash);
    assert.ok(engine.state.effects.some(e => e.type === 'ring' && e.style === 'barracks-cleave' && e.sourceId === soldier.id && e.radius === 48));
  }
});

test('fortify improves living and dead soldiers, persists on respawn, and is local to its own barracks', () => {
  const engine = new GameEngine();
  const first = maxTower(engine, 'barracks', 1), second = maxTower(engine, 'barracks', 8);
  const soldiers = engine.state.allies.filter(a => a.towerId === first.id);
  soldiers[0].hp = 100;
  soldiers[1].hp = 0;
  soldiers[1].respawnTimer = 0.1;
  learn(engine, first, 'barracks-fortify');
  assert.equal(soldiers[0].hp, 155);
  assert.equal(soldiers[1].hp, 0);
  for (const soldier of soldiers) { assert.equal(soldier.maxHp, 340); close(soldier.armor, 0.48); }
  assert.ok(engine.buyTowerAbility(first.id, 'barracks-fortify').ok);
  for (const soldier of soldiers) { assert.equal(soldier.maxHp, 395); close(soldier.armor, 0.56); }
  assert.equal(soldiers[0].hp, 210);
  battle(engine);
  engine.update(0.2);
  assert.equal(soldiers[1].hp, 395);
  for (const soldier of engine.state.allies.filter(a => a.towerId === second.id)) { assert.equal(soldier.maxHp, 285); close(soldier.armor, 0.4); }
});

test('mend waits for injuries, heals living friends around the rally, and never heals dead or distant units', () => {
  for (const rank of [1, 2]) {
    const engine = new GameEngine();
    remoteHero(engine);
    const tower = maxTower(engine, 'barracks', 1);
    learn(engine, tower, 'barracks-mend', rank);
    battle(engine);
    engine.update(0.01);
    assert.equal(tower.abilityTimers['barracks-mend'], 0);
    const soldiers = engine.state.allies.filter(a => a.towerId === tower.id);
    for (const soldier of soldiers) { soldier.x = soldier.targetX = tower.rallyX; soldier.y = soldier.targetY = tower.rallyY; }
    soldiers[0].hp = 100;
    soldiers[1].hp = 0;
    soldiers[1].respawnTimer = 10_000;
    soldiers[2].hp = 100;
    soldiers[2].x = soldiers[2].targetX = tower.rallyX + 200;
    const hero = engine.state.allies[0];
    hero.x = hero.targetX = tower.rallyX;
    hero.y = hero.targetY = tower.rallyY;
    hero.hp = 10;
    engine.update(0.01);
    assert.equal(soldiers[0].hp, rank === 1 ? 150 : 185);
    assert.equal(hero.hp, rank === 1 ? 60 : 95);
    assert.equal(soldiers[1].hp, 0);
    assert.equal(soldiers[2].hp, 100);
    close(tower.abilityTimers['barracks-mend']!, rank === 1 ? 10 : 8);
    assert.ok(engine.state.effects.some(e => e.type === 'ring' && e.style === 'barracks-mend' && e.radius === 95));
  }
});

test('moonblade dash validates targets, disengages, moves the hero, and damages only its swept route', () => {
  const engine = new GameEngine();
  assert.equal(engine.castSkill('hero-dash', 900, 425).ok, false);
  battle(engine);
  const hero = engine.state.allies[0];
  assert.equal(engine.castSkill('hero-dash', 900, 425).ok, false);
  assert.equal(engine.state.skillCooldowns['hero-dash'], 0);
  const boss = enemy('chieftain', nearestPathPoint({ x: 825, y: 425 }).progress);
  const far = enemy('golem', nearestPathPoint({ x: 1040, y: 510 }).progress);
  engine.state.enemies = [boss, far];
  assert.equal(engine.castSkill('hero-dash', 1100, 425).ok, false);
  boss.blockedBy = hero.id;
  hero.engagedWith = boss.id;
  assert.ok(engine.castSkill('hero-dash', 900, 425).ok);
  assert.equal(hero.x, 900);
  assert.equal(hero.y, 425);
  assert.equal(hero.targetX, 900);
  assert.equal(hero.engagedWith, null);
  assert.equal(boss.blockedBy, null);
  assert.equal(boss.hp, 2080);
  assert.equal(far.hp, far.maxHp);
  assert.equal(engine.state.skillCooldowns['hero-dash'], 18);
  assert.equal(engine.state.skillCooldowns['hero-roots'], 0);
  const dash = engine.state.effects.find(e => e.type === 'hero-dash')!;
  assert.equal(dash.x, 750);
  assert.equal(dash.y, 445);
  assert.equal(dash.toX, 900);
  assert.equal(dash.toY, 425);
});

test('thorn binding freezes its targets before applying a timed slow and respects range and magic resistance', () => {
  const engine = new GameEngine();
  battle(engine);
  const boss = enemy('chieftain', nearestPathPoint({ x: 900, y: 425 }).progress);
  const far = enemy('golem', nearestPathPoint({ x: 1120, y: 530 }).progress);
  engine.state.enemies = [boss, far];
  assert.equal(engine.castSkill('hero-roots', 1180, 425).ok, false);
  assert.equal(engine.state.skillCooldowns['hero-roots'], 0);
  assert.ok(engine.castSkill('hero-roots', 900, 425).ok);
  close(boss.hp, 2200 - 55 * 0.8);
  assert.equal(boss.rootTimer, 2.5);
  assert.equal(far.rootTimer, 0);
  const progress = boss.progress;
  engine.update(2.4);
  close(boss.progress, progress);
  assert.ok(boss.rootTimer! > 0);
  engine.update(0.2);
  assert.equal(boss.rootTimer, 0);
  close(boss.slowAmount!, 0.55);
  assert.ok(boss.slowTimer > 3.8);
  const slowedProgress = boss.progress;
  engine.update(0.1);
  close(boss.progress - slowedProgress, ENEMY_STATS.chieftain.speed * 0.45 * 0.1);
  engine.update(4);
  assert.equal(boss.slowTimer, 0);
  assert.equal(boss.slowAmount, 0);
});

test('ancient-tree oath heals allies, amplifies their real attacks, mitigates damage, and expires cleanly', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  assert.equal(engine.castSkill('hero-oath', hero.x, hero.y).ok, false);
  assert.equal(engine.state.skillCooldowns['hero-oath'], 0);
  engine.castSkill('reinforce', 750, 425);
  const [near, far] = engine.state.allies.filter(a => a.type === 'reinforcement');
  near.x = near.targetX = hero.x + 75;
  near.y = near.targetY = hero.y;
  far.x = far.targetX = 1120;
  far.y = far.targetY = 660;
  near.hp = far.hp = 20;
  hero.hp = 100;
  const boss = enemy('chieftain', nearestPathPoint(hero).progress);
  boss.attackTimer = 0;
  engine.state.enemies = [boss];
  assert.ok(engine.castSkill('hero-oath', hero.x, hero.y).ok);
  assert.equal(hero.hp, 260);
  assert.equal(near.hp, 180);
  assert.equal(far.hp, 20);
  assert.equal(hero.damageMultiplier, 1.35);
  assert.equal(near.armorBonus, 0.2);
  assert.equal(far.buffTimer ?? 0, 0);
  engine.update(0.01);
  close(boss.hp, 2200 - HERO_STATS.damage * 1.35 * 0.6);
  close(hero.hp, 260 - ENEMY_STATS.chieftain.damage * 0.5);
  engine.state.enemies = [];
  engine.update(8.1);
  assert.equal(hero.buffTimer, 0);
  assert.equal(hero.damageMultiplier, 1);
  assert.equal(hero.armorBonus, 0);
  assert.equal(near.buffTimer, 0);
  assert.equal(near.damageMultiplier, 1);
  assert.equal(engine.state.effects.some(e => e.type === 'oath'), false);
});

test('hero death prevents every personal power and respawning removes the oath bonus', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  hero.hp = 10;
  assert.ok(engine.castSkill('hero-oath', hero.x, hero.y).ok);
  hero.hp = 0;
  hero.respawnTimer = 15;
  const cooldowns = { ...engine.state.skillCooldowns };
  for (const kind of HERO_SKILLS) assert.equal(engine.castSkill(kind, hero.x, hero.y).ok, false);
  assert.deepEqual(engine.state.skillCooldowns, cooldowns);
  engine.update(15.1);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(hero.buffTimer, 0);
  assert.equal(hero.damageMultiplier, 1);
  assert.equal(hero.armorBonus, 0);
});

test('selling cancels persistent frost and reset clears all cooldowns, controls, upgrades, and random sequence', () => {
  const engine = new GameEngine(123456);
  remoteHero(engine);
  const tower = maxTower(engine, 'mage');
  learn(engine, tower, 'mage-frost', 2);
  const foe = enemy('golem', 180, 1000);
  engine.state.enemies = [foe];
  battle(engine);
  engine.update(0.01);
  assert.ok(engine.state.effects.some(e => e.type === 'frost-zone'));
  engine.sell(tower.id);
  assert.equal(engine.state.effects.some(e => e.type === 'frost-zone'), false);
  engine.update(0.2);
  assert.equal(foe.slowTimer, 0);
  engine.reset();
  assert.equal(engine.state.phase, 'preparation');
  assert.equal(engine.state.towers.length, 0);
  assert.equal(engine.state.effects.length, 0);
  assert.equal(engine.state.enemies.length, 0);
  assert.ok(Object.values(engine.state.skillCooldowns).every(value => value === 0));
  assert.equal(engine.state.allies[0].buffTimer, 0);
  const first = criticalTrace('arrow', 2, 123456, engine);
  engine.reset();
  assert.deepEqual(criticalTrace('arrow', 2, 123456, engine), first);
});
