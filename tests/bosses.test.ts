import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getLevelForRules, LEGACY_FOREST_WAVES } from '../src/data';
import { deriveBattleUpgrades } from '../src/doctrines';
import { DIFFICULTY_MULTIPLIERS, GameEngine } from '../src/engine';
import type { Difficulty, Enemy, GameSave } from '../src/types';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .00001, `${actual} should equal ${expected}`);
function bossScene(kind: 'chieftain' | 'juggernaut', difficulty: Difficulty = 'normal', rulesVersion: 1 | 2 = 2): { engine: GameEngine; boss: Enemy } {
  const engine = new GameEngine(554, 'forest', { difficulty, rulesVersion });
  engine.moveHero(1180, 680); engine.update(4); engine.startWave(); engine.update(10);
  // Keep real generated IDs, path coordinates, wave schedule and private runtime for save validation.
  const boss = engine.state.enemies[0]; boss.kind = kind; boss.hp = boss.maxHp = ENEMY_STATS[kind].hp * DIFFICULTY_MULTIPLIERS[difficulty].hp;
  boss.attackTimer = 0; boss.bossCooldown = 0; boss.bossRecover = 0; engine.state.enemies = [boss];
  const hero = engine.state.allies[0]; hero.x = hero.targetX = boss.x; hero.y = hero.targetY = boss.y;
  hero.hp = hero.maxHp; hero.attackTimer = 5; hero.engagedWith = boss.id; boss.blockedBy = hero.id;
  return { engine, boss };
}

for (const kind of ['chieftain', 'juggernaut'] as const) test(`${kind} telegraphs a stationary, locked area attack before applying mitigated group damage`, () => {
  const { engine, boss } = bossScene(kind), hero = engine.state.allies[0], progress = boss.progress;
  engine.castSkill('reinforce', hero.x, hero.y);
  const [near, far] = engine.state.allies.filter(ally => ally.type === 'reinforcement');
  near.attackTimer = far.attackTimer = 5;
  far.x = far.targetX = hero.x + 200; far.y = far.targetY = hero.y + 100;
  engine.update(.01);
  const duration = kind === 'chieftain' ? 1.8 : 2.1, radius = kind === 'chieftain' ? 82 : 92;
  assert.ok(boss.bossCast); assert.equal(boss.bossCast.duration, duration); assert.equal(boss.bossCast.remaining, duration);
  assert.equal(boss.bossCast.radius, radius); assert.equal(hero.hp, hero.maxHp);
  const warning = engine.state.effects.find(effect => effect.type === 'boss-warning')!;
  assert.ok(warning); assert.equal(warning.sourceId, boss.id); assert.equal(warning.life, duration);
  engine.update(duration - .1); assert.equal(hero.hp, hero.maxHp); assert.equal(near.hp, near.maxHp);
  close(boss.progress, progress); assert.ok(boss.bossCast!.remaining > 0);
  engine.update(.12);
  assert.equal(boss.bossCast, undefined); assert.equal(engine.state.effects.some(effect => effect.type === 'boss-warning'), false);
  assert.ok(engine.state.effects.some(effect => effect.type === 'ring' && effect.style === 'boss-slam' && effect.radius === radius));
  const damage = kind === 'chieftain' ? 112 : 148;
  close(hero.hp, hero.maxHp - damage * .7); close(near.hp, near.maxHp - damage * .75); assert.equal(far.hp, far.maxHp);
  close(boss.progress, progress); assert.ok(boss.bossRecover! > .7); assert.ok(boss.bossCooldown! > 9);
});

test('moving out of the warning dodges it because the boss does not chase the target center', () => {
  const { engine, boss } = bossScene('chieftain'), hero = engine.state.allies[0];
  engine.update(.01); const cast = { ...boss.bossCast! }, progress = boss.progress;
  engine.moveHero(hero.x + 180, hero.y + 100); engine.update(1.7);
  close(boss.bossCast!.x, cast.x); close(boss.bossCast!.y, cast.y); close(boss.progress, progress);
  assert.ok(Math.hypot(hero.x - cast.x, hero.y - cast.y) > cast.radius);
  engine.update(.2); assert.equal(hero.hp, hero.maxHp); assert.equal(boss.bossCast, undefined);
});

test('both active hero control skills interrupt a casting boss and remove every pending warning', () => {
  for (const kind of ['chieftain', 'juggernaut'] as const) for (const skill of ['hero-dash', 'hero-roots'] as const) {
    const { engine, boss } = bossScene(kind); engine.update(.01);
    assert.ok(boss.bossCast); assert.ok(engine.castSkill(skill, boss.x, boss.y).ok);
    assert.equal(boss.bossCast, undefined); assert.equal(engine.state.effects.some(effect => effect.type === 'boss-warning'), false);
    assert.ok(engine.state.effects.some(effect => effect.type === 'ring' && effect.style === 'boss-interrupted'));
    assert.ok(boss.bossCooldown! >= 6); assert.ok(boss.bossRecover! > 0);
    engine.moveHero(1180, 680); engine.update(2.3);
    assert.equal(engine.state.effects.some(effect => effect.style === 'boss-slam'), false);
  }
});

test('passive slowing does not interrupt the charge and invalid active skills spend no cooldown', () => {
  const { engine, boss } = bossScene('chieftain'); engine.update(.01);
  const warningId = engine.state.effects.find(effect => effect.type === 'boss-warning')!.id;
  assert.ok(engine.build(2, 'mage').ok); engine.update(.01);
  assert.ok(boss.slowTimer > 0); assert.ok(boss.bossCast); assert.ok(engine.state.effects.some(effect => effect.id === warningId));
  const priorCooldown = { ...engine.state.skillCooldowns }, priorCast = { ...boss.bossCast! };
  assert.equal(engine.castSkill('hero-dash', 1180, 680).ok, false);
  assert.equal(engine.castSkill('hero-roots', 1180, 680).ok, false);
  assert.deepEqual(engine.state.skillCooldowns, priorCooldown); assert.deepEqual(boss.bossCast, priorCast);
});

test('dying during a cast immediately cancels the warning and never deals delayed slam damage', () => {
  const { engine, boss } = bossScene('juggernaut'), hero = engine.state.allies[0]; engine.update(.01);
  boss.hp = 100; assert.ok(engine.castSkill('meteor', boss.x, boss.y).ok);
  assert.equal(engine.state.enemies.some(enemy => enemy.id === boss.id), false);
  assert.equal(engine.state.effects.some(effect => effect.type === 'boss-warning'), false);
  const hp = hero.hp; engine.moveHero(1180, 680); engine.update(2.3); assert.equal(hero.hp, hp);
  assert.equal(engine.state.effects.some(effect => effect.style === 'boss-slam'), false);
});

test('slam damage follows deployment difficulty and the defender armor including oath', () => {
  for (const difficulty of ['normal', 'veteran', 'heroic'] as const) {
    const { engine, boss } = bossScene('juggernaut', difficulty), hero = engine.state.allies[0];
    assert.ok(engine.castSkill('hero-oath', hero.x, hero.y).ok); engine.update(.01); engine.update(2.11);
    close(hero.hp, hero.maxHp - 148 * DIFFICULTY_MULTIPLIERS[difficulty].damage * .5);
    assert.equal(boss.bossCast, undefined);
  }
});

test('a paused cast checkpoint resumes the exact same warning, recovery, damage and future simulation', () => {
  for (const kind of ['chieftain', 'juggernaut'] as const) {
    const { engine } = bossScene(kind); engine.update(.01); engine.update(.7);
    const save = engine.exportSave(); engine.update(0); engine.update(Number.NaN); assert.deepEqual(engine.exportSave(), save);
    const restored = new GameEngine(); assert.ok(restored.importSave(save).ok); assert.deepEqual(restored.exportSave(), save);
    for (let tick = 0; tick < 70; tick++) { engine.update(.1); restored.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave()); }
  }
});

test('illegal boss and warning states are rejected atomically rather than importing partial combat', () => {
  const { engine } = bossScene('juggernaut'); engine.update(.01); engine.update(.3); const save = engine.exportSave();
  const receiver = new GameEngine(8, 'marsh'); receiver.build(1, 'arrow'); const before = receiver.exportSave();
  const edits: ((copy: GameSave) => void)[] = [
    copy => { copy.rulesVersion = 3 as 2; }, copy => { copy.rulesVersion = 1; },
    copy => { copy.state.enemies[0].bossCast!.remaining = -1; },
    copy => { copy.state.enemies[0].bossCast!.remaining = 5; },
    copy => { copy.state.enemies[0].bossCast!.duration = 1.8; },
    copy => { copy.state.enemies[0].bossCast!.radius = 500; },
    copy => { copy.state.enemies[0].bossCast!.kind = 'chieftain-slam'; },
    copy => { copy.state.enemies[0].bossCast!.x = 99999; },
    copy => { copy.state.enemies[0].bossRecover = .5; },
    copy => { copy.state.enemies[0].bossCooldown = 1; },
    copy => { copy.state.enemies[0].rootTimer = 1; },
    copy => { copy.state.effects.find(effect => effect.type === 'boss-warning')!.life += .1; },
    copy => { copy.state.effects = copy.state.effects.filter(effect => effect.type !== 'boss-warning'); },
    copy => { copy.state.effects.find(effect => effect.type === 'boss-warning')!.sourceId = 99999; },
  ];
  for (const edit of edits) { const corrupt = structuredClone(save); edit(corrupt); assert.equal(receiver.importSave(corrupt).ok, false); assert.deepEqual(receiver.exportSave(), before); }
});

test('legacy checkpoints without new fields keep their exact difficulty, talents, buildings and original wave schedule', () => {
  const upgrades = deriveBattleUpgrades({ bulwark: 3, guardian: 3, focus: 2 }), legacy = new GameEngine(412, 'forest', { difficulty: 'veteran', upgrades, rulesVersion: 1 });
  legacy.build(1, 'arrow'); legacy.build(8, 'barracks'); legacy.update(3); legacy.startWave(); legacy.update(8);
  const save = legacy.exportSave(); delete save.rulesVersion;
  for (const tower of save.state.towers) { delete tower.branch; delete tower.branchGoldSpent; }
  for (const enemy of save.state.enemies) { delete enemy.bossCast; delete enemy.bossCooldown; delete enemy.bossRecover; }
  const restored = new GameEngine(8, 'marsh'); assert.ok(restored.importSave(save).ok);
  assert.equal(restored.rulesVersion, 1); assert.equal(restored.level.waves, LEGACY_FOREST_WAVES);
  assert.equal(restored.difficulty, 'veteran'); assert.deepEqual(restored.upgrades, upgrades);
  assert.equal(restored.state.allies[0].maxHp, 440 * 1.18); assert.deepEqual(restored.state, save.state);
  for (let tick = 0; tick < 100; tick++) { legacy.update(.1); restored.update(.1); }
  assert.deepEqual(restored.exportSave(), legacy.exportSave());
  assert.equal(new GameEngine().rulesVersion, 2); assert.equal(getLevelForRules('forest', 1).waves, LEGACY_FOREST_WAVES);
});

test('rule-one bosses retain their ordinary strikes and do not start newly introduced telegraphs', () => {
  const { engine, boss } = bossScene('juggernaut', 'normal', 1), hero = engine.state.allies[0];
  engine.update(.01); close(hero.hp, hero.maxHp - ENEMY_STATS.juggernaut.damage * .7);
  assert.equal(boss.bossCast, undefined); assert.equal(engine.state.effects.some(effect => effect.type === 'boss-warning'), false);
});

test('a defeat caused elsewhere cancels pending boss attacks and the idle defeat screen stays resumable', () => {
  const { engine, boss } = bossScene('chieftain'); engine.update(.01);
  const leaking: Enemy = { ...boss, id: engine.exportSave().runtime.nextId - 1, kind: 'goblin',
    hp: 70, maxHp: 70, progress: engine.pathLength - .01, ...engine.samplePath(engine.pathLength - .01),
    blockedBy: null, bossCast: undefined, bossCooldown: undefined, bossRecover: undefined };
  engine.state.enemies.push(leaking); engine.state.lives = 1; engine.update(.01);
  assert.equal(engine.state.phase, 'defeat'); assert.equal(boss.bossCast, undefined);
  assert.equal(engine.state.effects.some(effect => effect.type === 'boss-warning'), false);
  engine.update(3);
  const receiver = new GameEngine(); assert.ok(receiver.importSave(engine.exportSave()).ok);
});
