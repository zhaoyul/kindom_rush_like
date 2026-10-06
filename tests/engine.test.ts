import assert from 'node:assert/strict';
import test from 'node:test';
import { damageAfterResistance, ENEMY_STATS, getTowerStats, HERO_STATS, nearestPathPoint, PATH, PATH_LENGTH, samplePath, SKILLS, WAVES } from '../src/data';
import { GameEngine } from '../src/engine';
import type { Enemy, EnemyKind } from '../src/types';

let enemyId = 100_000;
function makeEnemy(kind: EnemyKind, progress: number, hp = ENEMY_STATS[kind].hp): Enemy {
  return { id: enemyId++, kind, ...samplePath(progress), progress, hp, maxHp: hp,
    attackTimer: 0.5, blockedBy: null, slowTimer: 0, hitTimer: 0 };
}
function battle(engine: GameEngine): void {
  engine.state.phase = 'battle';
  engine.state.wave = 1;
  engine.state.spawnQueue = [{ kind: 'goblin', time: 100_000 }];
}
function close(actual: number, expected: number): void { assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≠ ${expected}`); }

test('path interpolation and projection share a continuous pixel progress coordinate', () => {
  assert.deepEqual(samplePath(-1), PATH[0]);
  assert.deepEqual(samplePath(PATH_LENGTH + 10), PATH.at(-1));
  for (const progress of [0, 100, 300, 600, 1100, PATH_LENGTH]) {
    const point = samplePath(progress);
    const projected = nearestPathPoint(point);
    close(projected.progress, progress);
    close(projected.x, point.x);
    close(projected.y, point.y);
  }
});

test('build, upgrade and sell enforce the economy and occupied slots', () => {
  const engine = new GameEngine();
  assert.equal(engine.state.gold, 360);
  assert.ok(engine.build(1, 'arrow').ok);
  assert.equal(engine.state.gold, 280);
  assert.equal(engine.build(1, 'mage').ok, false);
  const tower = engine.state.towers[0];
  assert.ok(engine.upgrade(tower.id).ok);
  assert.equal(engine.state.gold, 185);
  assert.equal(tower.level, 2);
  assert.ok(engine.upgrade(tower.id).ok);
  assert.equal(engine.state.gold, 30);
  assert.equal(tower.level, 3);
  assert.equal(engine.upgrade(tower.id).ok, false);
  assert.equal(engine.build(5, 'mage').ok, false);
  assert.equal(engine.state.gold, 30);
  assert.ok(engine.sell(tower.id).ok);
  assert.equal(engine.state.gold, 30 + Math.floor((80 + 95 + 155) * 70 / 100));
  assert.equal(engine.state.towers.length, 0);
  assert.equal(engine.sell(tower.id).ok, false);
});

test('physical, magical and true damage select the correct resistance', () => {
  close(damageAfterResistance(100, 0.65, 0.12, 'physical'), 35);
  close(damageAfterResistance(100, 0.65, 0.12, 'magic'), 88);
  close(damageAfterResistance(100, 0.65, 0.12, 'true'), 100);
  const engine = new GameEngine();
  engine.build(0, 'arrow');
  const earlier = makeEnemy('orc', 100, 1000);
  const later = makeEnemy('orc', 180, 1000);
  engine.state.enemies = [earlier, later];
  battle(engine);
  engine.update(0.1);
  assert.equal(earlier.hp, 1000);
  close(later.hp, 1000 - getTowerStats('arrow', 1).damage * 0.6);
  const mageEngine = new GameEngine();
  mageEngine.build(5, 'mage');
  const mage = mageEngine.state.towers[0];
  const armored = makeEnemy('orc', nearestPathPoint(mage).progress, 1000);
  mageEngine.state.enemies = [armored];
  battle(mageEngine);
  mageEngine.update(0.1);
  close(armored.hp, 1000 - getTowerStats('mage', 1).damage);
  assert.ok(armored.slowTimer > 0);
});

test('skills require valid targets, apply true AoE damage, and respect independent cooldowns', () => {
  const engine = new GameEngine();
  battle(engine);
  assert.equal(engine.castSkill('meteor', 200, 200).ok, false);
  assert.equal(engine.state.skillCooldowns.meteor, 0);
  const progress = nearestPathPoint({ x: 500, y: 350 }).progress;
  const enemies = [makeEnemy('golem', progress, 1000), makeEnemy('orc', progress + 20, 1000)];
  engine.state.enemies = enemies;
  assert.ok(engine.castSkill('meteor', enemies[0].x, enemies[0].y).ok);
  for (const enemy of enemies) close(enemy.hp, 700);
  assert.equal(engine.state.skillCooldowns.meteor, SKILLS.meteor.cooldown);
  assert.equal(engine.castSkill('meteor', enemies[0].x, enemies[0].y).ok, false);
  assert.ok(engine.castSkill('reinforce', 800, 425).ok);
  assert.equal(engine.state.allies.filter(a => a.type === 'reinforcement').length, 2);
  assert.equal(engine.state.skillCooldowns.reinforce, SKILLS.reinforce.cooldown);
  engine.update(1);
  close(engine.state.skillCooldowns.meteor, SKILLS.meteor.cooldown - 1);
  close(engine.state.skillCooldowns.reinforce, SKILLS.reinforce.cooldown - 1);
  engine.state.enemies = [];
  engine.update(24);
  assert.equal(engine.state.allies.filter(a => a.type === 'reinforcement').length, 0);
  close(engine.state.skillCooldowns.reinforce, 0);
});

test('hero blocks, takes mitigated damage, releases its target on death and respawns', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  hero.damage = 0;
  const enemy = makeEnemy('orc', nearestPathPoint(hero).progress, 1000);
  engine.state.enemies = [enemy];
  engine.update(0.1);
  assert.equal(enemy.blockedBy, hero.id);
  assert.equal(hero.engagedWith, enemy.id);
  const progress = enemy.progress;
  engine.update(0.5);
  close(enemy.progress, progress);
  close(hero.hp, HERO_STATS.hp - ENEMY_STATS.orc.damage * (1 - HERO_STATS.armor));
  hero.hp = 1;
  enemy.attackTimer = 0;
  engine.update(0.1);
  assert.equal(hero.hp, 0);
  assert.equal(hero.engagedWith, null);
  assert.equal(enemy.blockedBy, null);
  assert.ok(enemy.progress > progress);
  engine.state.enemies = [];
  engine.update(HERO_STATS.respawnTime + 0.1);
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(hero.respawnTimer, 0);
});

test('moving hero disengages immediately and permits movement away from melee', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  const enemy = makeEnemy('golem', nearestPathPoint(hero).progress);
  engine.state.enemies = [enemy];
  engine.update(0.1);
  assert.equal(enemy.blockedBy, hero.id);
  const startX = hero.x;
  assert.ok(engine.moveHero(1000, 650).ok);
  assert.equal(enemy.blockedBy, null);
  engine.update(0.5);
  assert.ok(hero.x > startX + 20);
  assert.equal(hero.engagedWith, null);
});

test('hero skill heals the hero and damages only nearby enemies with true damage', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  hero.hp = 100;
  const near = makeEnemy('golem', nearestPathPoint(hero).progress, 1000);
  const far = makeEnemy('golem', 200, 1000);
  engine.state.enemies = [near, far];
  assert.ok(engine.castSkill('hero', hero.x, hero.y).ok);
  assert.equal(hero.hp, 300);
  assert.equal(near.hp, 850);
  assert.equal(far.hp, 1000);
  assert.equal(engine.state.skillCooldowns.hero, SKILLS.hero.cooldown);
  assert.equal(engine.state.skillCooldowns.meteor, 0);
});

test('shamans periodically heal nearby allies without exceeding their maximum health', () => {
  const engine = new GameEngine();
  battle(engine);
  const shaman = makeEnemy('shaman', 300);
  const wounded = makeEnemy('orc', 305, 190);
  const distant = makeEnemy('orc', 700, 190);
  wounded.hp = 181;
  distant.hp = 100;
  engine.state.enemies = [shaman, wounded, distant];
  engine.update(3.1);
  assert.equal(wounded.hp, 190);
  assert.equal(distant.hp, 100);
  assert.equal(shaman.hp, shaman.maxHp);
  assert.ok(engine.state.effects.some(effect => effect.type === 'heal'));
});

test('reinforcement expiry immediately frees a foe it was blocking', () => {
  const engine = new GameEngine();
  battle(engine);
  engine.castSkill('reinforce', 200, 240);
  const reinforcement = engine.state.allies.find(a => a.type === 'reinforcement')!;
  reinforcement.damage = 0;
  const enemy = makeEnemy('golem', nearestPathPoint(reinforcement).progress, 1000);
  engine.state.enemies = [enemy];
  engine.update(0.1);
  assert.equal(enemy.blockedBy, reinforcement.id);
  reinforcement.expiresAt = engine.state.time + 0.02;
  const progress = enemy.progress;
  engine.update(0.04);
  assert.ok(!engine.state.allies.some(a => a.id === reinforcement.id));
  // The other reinforcement may immediately take over, which is also valid.
  assert.notEqual(enemy.blockedBy, reinforcement.id);
  if (enemy.blockedBy === null) assert.ok(enemy.progress > progress);
});

test('barracks upgrades live and dead soldiers, respawns independently, and selling frees blocked foes', () => {
  const engine = new GameEngine();
  engine.build(8, 'barracks');
  engine.update(2);
  const tower = engine.state.towers[0];
  const soldiers = engine.state.allies.filter(a => a.type === 'soldier');
  assert.equal(soldiers.length, 3);
  battle(engine);
  soldiers[0].hp = 1;
  soldiers[0].damage = 0;
  const enemy = makeEnemy('golem', nearestPathPoint(soldiers[0]).progress, 1000);
  enemy.attackTimer = 0;
  engine.state.enemies = [enemy];
  engine.update(0.1);
  assert.equal(soldiers[0].hp, 0);
  assert.ok(soldiers[0].respawnTimer > 8);
  engine.state.gold = 1000;
  assert.ok(engine.upgrade(tower.id).ok);
  for (const soldier of soldiers) {
    assert.equal(soldier.maxHp, getTowerStats('barracks', 2).soldierHp);
    assert.equal(soldier.damage, getTowerStats('barracks', 2).soldierDamage);
  }
  assert.equal(soldiers[0].hp, 0);
  engine.state.enemies = [];
  engine.update(9.2);
  assert.equal(soldiers[0].hp, soldiers[0].maxHp);
  engine.update(2);
  const next = makeEnemy('golem', nearestPathPoint(soldiers[1]).progress, 1000);
  engine.state.enemies = [next];
  engine.update(0.1);
  assert.ok(next.blockedBy !== null);
  assert.ok(engine.sell(tower.id).ok);
  assert.equal(next.blockedBy, null);
  assert.equal(engine.state.allies.filter(a => a.type === 'soldier').length, 0);
});

test('all arrived spawn entries are consumed and a wave waits for the last living enemy', () => {
  const engine = new GameEngine();
  assert.ok(engine.startWave().ok);
  assert.equal(engine.state.wave, 1);
  assert.equal(engine.startWave().ok, false);
  engine.update(5);
  assert.equal(engine.state.enemies.length, 5);
  assert.equal(engine.state.spawnQueue.length, 7);
  engine.state.spawnQueue = [];
  engine.update(0.1);
  assert.equal(engine.state.phase, 'battle');
  engine.state.enemies.forEach(enemy => { enemy.hp = 0; });
  engine.update(0.1);
  assert.equal(engine.state.phase, 'intermission');
  assert.equal(engine.state.kills, 5);
  assert.equal(engine.state.gold, 360 + 5 * ENEMY_STATS.goblin.gold + 30);
  engine.update(1);
  assert.equal(engine.state.gold, 440);
  assert.ok(engine.startWave().ok);
  assert.equal(engine.state.wave, 2);
});

test('leaked foes subtract lives once, award no kill gold, and defeat locks actions', () => {
  const engine = new GameEngine();
  battle(engine);
  const enemy = makeEnemy('chieftain', PATH_LENGTH - 1);
  engine.state.enemies = [enemy];
  engine.state.lives = 8;
  engine.update(0.2);
  assert.equal(engine.state.phase, 'defeat');
  assert.equal(engine.state.lives, 0);
  assert.equal(engine.state.gold, 360);
  assert.equal(engine.state.kills, 0);
  assert.equal(engine.state.enemies.length, 0);
  engine.update(2);
  assert.equal(engine.state.lives, 0);
  assert.equal(engine.build(0, 'arrow').ok, false);
  assert.equal(engine.moveHero(400, 400).ok, false);
  assert.equal(engine.castSkill('reinforce', 400, 400).ok, false);
});

test('a real first wave is defendable using the starting trio without skills or extra funds', () => {
  const engine = new GameEngine();
  assert.ok(engine.build(1, 'arrow').ok);
  assert.ok(engine.build(5, 'mage').ok);
  assert.ok(engine.build(8, 'barracks').ok);
  assert.equal(engine.state.gold, 70);
  engine.startWave();
  for (let seconds = 0; seconds < 150 && engine.state.phase === 'battle'; seconds++) engine.update(1);
  assert.equal(engine.state.phase, 'intermission');
  assert.equal(engine.state.lives, 20);
  assert.equal(engine.state.kills, 12);
});

test('the final cleared wave gives victory, and reset recreates a clean game', () => {
  const engine = new GameEngine();
  engine.state.wave = WAVES.length - 1;
  engine.state.phase = 'intermission';
  engine.startWave();
  assert.equal(engine.state.wave, 8);
  engine.state.spawnQueue = [];
  const boss = makeEnemy('chieftain', 500);
  boss.hp = 0;
  engine.state.enemies = [boss];
  engine.update(0.1);
  assert.equal(engine.state.phase, 'victory');
  assert.equal(engine.state.kills, 1);
  assert.equal(engine.startWave().ok, false);
  assert.equal(engine.build(0, 'arrow').ok, false);
  engine.reset();
  assert.equal(engine.state.phase, 'preparation');
  assert.equal(engine.state.wave, 0);
  assert.equal(engine.state.gold, 360);
  assert.equal(engine.state.allies.length, 1);
  assert.equal(engine.state.enemies.length, 0);
  assert.equal(engine.state.stats.damageDealt, 0);
});

test('hero melee has a directed full-length attack pose that finishes after its target dies', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  const enemy = makeEnemy('goblin', nearestPathPoint(hero).progress, 20);
  engine.state.enemies = [enemy];
  const source = { x: hero.x, y: hero.y };
  engine.update(0.01);
  assert.equal(engine.state.enemies.length, 0);
  assert.equal(hero.engagedWith, null);
  close(hero.attackAnimation!, 0.56);
  assert.equal(hero.attackVariant, 1);
  close(hero.facingX!, 0);
  close(hero.facingY!, -1);
  const slash = engine.state.effects.find(effect => effect.type === 'slash' && effect.sourceId === hero.id)!;
  assert.ok(slash);
  assert.equal(slash.style, 'hero');
  assert.equal(slash.attackVariant, hero.attackVariant);
  assert.equal(slash.targetId, enemy.id);
  close(slash.x, source.x);
  close(slash.y, source.y);
  close(slash.toX!, enemy.x);
  close(slash.toY!, enemy.y);
  close(slash.maxLife, 0.56);
  engine.update(0.1);
  close(hero.attackAnimation!, 0.46);
  close(slash.life, 0.46);
  engine.update(0.5);
  assert.equal(hero.attackAnimation, 0);
  assert.equal(engine.state.effects.some(effect => effect.id === slash.id), false);
  engine.moveHero(950, 625);
  engine.update(0.1);
  assert.ok(hero.facingX! > 0 && hero.facingY! > 0);
  close(Math.hypot(hero.facingX!, hero.facingY!), 1);
});

test('ranged towers animate only an actual shot and retain directed pose while their cooldown runs', () => {
  for (const kind of ['arrow', 'mage'] as const) {
    const engine = new GameEngine();
    engine.build(0, kind);
    battle(engine);
    const tower = engine.state.towers[0];
    engine.update(0.01);
    assert.equal(tower.attackAnimation, 0);
    assert.equal(tower.attackVariant, 0);
    const enemy = makeEnemy('orc', 180, 1000);
    engine.state.enemies = [enemy];
    engine.update(0.01);
    close(tower.attackAnimation!, 0.32);
    assert.equal(tower.attackVariant, 1);
    close(tower.facingX!, 0);
    close(tower.facingY!, 1);
    const projectile = engine.state.effects.find(effect => effect.type === (kind === 'arrow' ? 'arrow' : 'bolt'))!;
    assert.equal(projectile.sourceId, tower.id);
    assert.equal(projectile.targetId, enemy.id);
    assert.equal(projectile.style, kind);
    assert.ok(enemy.hitAnimation! > 0);
    close(enemy.hitAnimation!, enemy.hitTimer);
    engine.state.enemies = [];
    engine.update(0.1);
    close(tower.attackAnimation!, 0.22);
    close(tower.facingY!, 1);
    assert.equal(tower.attackVariant, 1);
  }
});

test('each enemy attack has its species pose, directed slash and ally hit reaction', () => {
  const durations: Record<EnemyKind, number> = { goblin: 0.45, wolf: 0.38, orc: 0.45, shaman: 0.52, golem: 0.64, chieftain: 0.62, bogling: 0.45, serpent: 0.38, icewolf: 0.38, frostguard: 0.45, imp: 0.52, juggernaut: 0.64 };
  for (const kind of Object.keys(durations) as EnemyKind[]) {
    const engine = new GameEngine();
    battle(engine);
    const hero = engine.state.allies[0];
    hero.hp = 1;
    const enemy = makeEnemy(kind, nearestPathPoint(hero).progress, 1000);
    enemy.attackTimer = 0;
    engine.state.enemies = [enemy];
    const allyPosition = { x: hero.x, y: hero.y };
    engine.update(0.01);
    assert.equal(hero.hp, 0);
    assert.equal(enemy.blockedBy, null);
    close(enemy.attackAnimation!, durations[kind]);
    close(hero.hitAnimation!, 0.2);
    close(enemy.facingX!, 0);
    close(enemy.facingY!, 1);
    const slash = engine.state.effects.find(effect => effect.type === 'slash' && effect.sourceId === enemy.id)!;
    assert.ok(slash);
    assert.equal(slash.style, kind);
    assert.equal(slash.attackVariant, enemy.attackVariant);
    assert.equal(slash.targetId, hero.id);
    close(slash.x, enemy.x);
    close(slash.y, enemy.y);
    close(slash.toX!, allyPosition.x);
    close(slash.toY!, allyPosition.y);
    close(slash.maxLife, durations[kind]);
    assert.ok(engine.state.effects.some(effect => effect.type === 'impact' && effect.targetId === hero.id && effect.sourceId === enemy.id));
    engine.update(0.1);
    close(enemy.attackAnimation!, durations[kind] - 0.1);
    close(hero.hitAnimation!, 0.1);
    close(enemy.facingY!, 1); // A killing blow completes before its facing follows the march.
    engine.update(durations[kind]);
    assert.ok(enemy.facingX! > 0);
  }
});

test('soldiers and reinforcements emit their own directed attacks without hero style', () => {
  for (const type of ['soldier', 'reinforcement'] as const) {
    const engine = new GameEngine();
    if (type === 'soldier') {
      engine.build(8, 'barracks');
      engine.update(2);
    }
    battle(engine);
    if (type === 'reinforcement') engine.castSkill('reinforce', 800, 425);
    const allies = engine.state.allies.filter(ally => ally.type === type);
    const ally = allies[type === 'soldier' ? 1 : 0];
    const enemy = makeEnemy('orc', nearestPathPoint(ally).progress, 1000);
    enemy.x = ally.x + 20;
    enemy.y = ally.y;
    engine.state.enemies = [enemy];
    engine.update(0.11);
    assert.equal(ally.engagedWith, enemy.id);
    assert.equal(ally.attackVariant, 1);
    assert.ok(ally.attackAnimation! > 0.28 && ally.attackAnimation! <= 0.4);
    close(ally.facingX!, 1);
    close(ally.facingY!, 0);
    close(enemy.hp, 1000 - ally.damage * (1 - ENEMY_STATS.orc.armor));
    const slash = engine.state.effects.find(effect => effect.type === 'slash' && effect.sourceId === ally.id)!;
    assert.equal(slash.style, 'soldier');
    assert.equal(slash.attackVariant, ally.attackVariant);
    assert.equal(slash.targetId, enemy.id);
    close(slash.x, ally.x);
    close(slash.y, ally.y);
    close(slash.toX!, enemy.x);
    close(slash.toY!, enemy.y);
    close(slash.maxLife, 0.4);
  }
});

test('hero skill emits its distinct burst and sets the hero pose toward its nearest target', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  const enemy = makeEnemy('golem', nearestPathPoint(hero).progress, 1000);
  engine.state.enemies = [enemy];
  const healthBefore = hero.hp;
  assert.ok(engine.castSkill('hero', hero.x, hero.y).ok);
  assert.equal(hero.hp, healthBefore);
  assert.equal(enemy.hp, 850);
  const burst = engine.state.effects.find(effect => effect.type === 'hero-burst')!;
  assert.ok(burst);
  assert.equal(burst.sourceId, hero.id);
  assert.equal(burst.style, 'hero');
  close(burst.maxLife, 0.9);
  close(burst.x, hero.x);
  close(burst.y, hero.y);
  close(hero.attackAnimation!, 0.56);
  close(hero.facingY!, -1);
  hero.attackTimer = 10;
  engine.update(0.1);
  close(hero.attackAnimation!, 0.46);
  close(burst.life, 0.8);
});

test('rally commands reject map bounds, distant terrain and out-of-range roads without mutating destinations', () => {
  const engine = new GameEngine();
  engine.build(8, 'barracks');
  const tower = engine.state.towers[0];
  assert.ok(engine.setRally(tower.id, 900, 470).ok); // Exactly 45 pixels from the road is valid.
  close(tower.rallyX, 900);
  close(tower.rallyY, 425);
  const savedTargets = engine.state.allies.filter(ally => ally.towerId === tower.id).map(ally => ({ x: ally.targetX, y: ally.targetY }));
  for (const point of [{ x: -1, y: 425 }, { x: 1201, y: 425 }, { x: 900, y: -1 }, { x: 900, y: 721 }, { x: Infinity, y: 425 }, { x: NaN, y: 425 }]) {
    assert.equal(engine.setRally(tower.id, point.x, point.y).ok, false);
  }
  assert.match(engine.setRally(tower.id, 900, 470.01).message, /道路/);
  assert.match(engine.setRally(tower.id, 700, 425).message, /范围/);
  close(tower.rallyX, 900);
  close(tower.rallyY, 425);
  assert.deepEqual(engine.state.allies.filter(ally => ally.towerId === tower.id).map(ally => ({ x: ally.targetX, y: ally.targetY })), savedTargets);
  // Validate the projected rally point, rather than the raw click's tower distance.
  assert.ok(engine.setRally(tower.id, 740, 380).ok);
  close(tower.rallyX, 740);
  close(tower.rallyY, 425);
});

test('a last killing swing keeps its facing while returning to rally, and a move command can interrupt it', () => {
  const engine = new GameEngine();
  battle(engine);
  const hero = engine.state.allies[0];
  hero.targetX = 700;
  const enemy = makeEnemy('goblin', nearestPathPoint(hero).progress, 20);
  enemy.x = hero.x + 25;
  enemy.y = hero.y;
  engine.state.enemies = [enemy];
  engine.update(0.01);
  assert.equal(engine.state.enemies.length, 0);
  close(hero.facingX!, 1);
  close(hero.attackAnimation!, 0.56);
  const attackX = hero.x;
  engine.update(0.1);
  assert.ok(hero.x < attackX);
  close(hero.facingX!, 1);
  close(hero.attackAnimation!, 0.46);
  assert.ok(engine.moveHero(650, hero.y).ok);
  assert.equal(hero.attackAnimation, 0);
  assert.equal(engine.state.effects.some(effect => effect.type === 'slash' && effect.sourceId === hero.id), false);
  engine.update(0.1);
  close(hero.facingX!, -1);
});

test('each barracks keeps its own rally through upgrades and soldier death and respawn', () => {
  const engine = new GameEngine();
  engine.build(8, 'barracks');
  engine.build(4, 'barracks');
  const [first, second] = engine.state.towers;
  assert.ok(engine.setRally(first.id, 900, 445).ok);
  assert.ok(engine.setRally(second.id, 400, 470).ok);
  const firstSoldiers = engine.state.allies.filter(ally => ally.towerId === first.id);
  const secondDestinations = engine.state.allies.filter(ally => ally.towerId === second.id).map(ally => ({ x: ally.targetX, y: ally.targetY }));
  firstSoldiers[0].hp = 0;
  firstSoldiers[0].respawnTimer = 1;
  assert.ok(engine.upgrade(first.id).ok);
  engine.update(3);
  close(first.rallyX, 900);
  close(first.rallyY, 425);
  close(second.rallyX, 400);
  close(second.rallyY, 470);
  firstSoldiers.forEach((soldier, i) => {
    assert.equal(soldier.hp, soldier.maxHp);
    assert.equal(soldier.maxHp, getTowerStats('barracks', 2).soldierHp);
    close(soldier.targetX, first.rallyX + (i - 1) * 17);
    close(soldier.targetY, first.rallyY + (i === 1 ? 8 : -5));
    close(soldier.x, soldier.targetX);
    close(soldier.y, soldier.targetY);
    close(Math.hypot(soldier.facingX!, soldier.facingY!), 1);
  });
  assert.deepEqual(engine.state.allies.filter(ally => ally.towerId === second.id).map(ally => ({ x: ally.targetX, y: ally.targetY })), secondDestinations);
});
