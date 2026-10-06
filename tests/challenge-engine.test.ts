import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import type { ChallengeMode } from '../src/types';

test('four-tower defense caps simultaneous sites atomically but selling permits relocation', () => {
  const engine = new GameEngine(234, 'forest', { challenge: 'four-towers' }); engine.state.gold = 20000;
  for (const [slot, kind] of [[0,'arrow'],[1,'mage'],[4,'cannon'],[8,'barracks']] as const) assert.ok(engine.build(slot, kind).ok);
  assert.equal(engine.state.towers.length, 4); const before = engine.exportSave();
  assert.equal(engine.build(2, 'arrow').ok, false); assert.deepEqual(engine.exportSave(), before);
  const sold = engine.state.towers[0]; assert.ok(engine.sell(sold.id).ok); assert.ok(engine.build(2, 'arrow').ok);
  assert.equal(engine.state.towers.length, 4); assert.equal(engine.state.report?.towers.length, 5);
  assert.ok(engine.state.report?.towers.find(tower => tower.id === sold.id)?.soldAt !== undefined);
});

test('no-meteor prevents every meteor attempt transactionally and leaves the other skills usable', () => {
  const engine = new GameEngine(234, 'forest', { challenge: 'no-meteor' }); engine.startWave(); engine.update(.01);
  const target = engine.state.enemies[0], before = engine.exportSave();
  assert.equal(engine.castSkill('meteor', target.x, target.y).ok, false); assert.deepEqual(engine.exportSave(), before);
  assert.equal(engine.state.skillCooldowns.meteor, 0); assert.ok(engine.castSkill('reinforce', 300, 240).ok);
  const hero = engine.state.allies[0]; hero.hp -= 10; assert.ok(engine.castSkill('hero-oath', hero.x, hero.y).ok);
  assert.equal(engine.state.skillCooldowns.meteor, 0); assert.ok(engine.state.stats.skillsUsed >= 2);
});

test('challenge checkpoints retain their difficulty and captured training, while absent mode remains standard', () => {
  const upgrades = deriveBattleUpgrades({ guardian: 3, bulwark: 3 });
  for (const challenge of ['standard', 'four-towers', 'no-meteor'] as const) {
    const engine = new GameEngine(234, 'marsh', { challenge, difficulty: 'heroic', upgrades }); engine.build(1, 'arrow'); engine.startWave(); engine.update(8);
    const save = engine.exportSave(), receiver = new GameEngine(); assert.ok(receiver.importSave(save).ok);
    assert.equal(receiver.challenge, challenge); assert.equal(receiver.difficulty, 'heroic'); assert.deepEqual(receiver.upgrades, upgrades);
    for (let tick = 0; tick < 60; tick++) { engine.update(.1); receiver.update(.1); }
    assert.deepEqual(receiver.exportSave(), engine.exportSave()); receiver.reset(); assert.equal(receiver.challenge, challenge);
  }
  const legacy = new GameEngine(234, 'marsh', { difficulty: 'veteran', upgrades }), save = legacy.exportSave(); delete save.challenge;
  const receiver = new GameEngine(1, 'forest', { challenge: 'no-meteor' }); assert.ok(receiver.importSave(save).ok);
  assert.equal(receiver.challenge, 'standard'); assert.equal(receiver.difficulty, 'veteran'); assert.deepEqual(receiver.upgrades, upgrades);
});

test('unknown modes and rule-breaking saved buildings or cooldowns cannot overwrite a valid deployment', () => {
  assert.throws(() => new GameEngine(1, 'forest', { challenge: 'invalid' as ChallengeMode }));
  const receiver = new GameEngine(9, 'marsh'), before = receiver.exportSave(), ordinary = new GameEngine(); ordinary.state.gold = 20000;
  for (const slot of [0,1,2,3,4]) ordinary.build(slot, 'arrow');
  const excessive = ordinary.exportSave(); excessive.challenge = 'four-towers';
  assert.equal(receiver.importSave(excessive).ok, false); assert.deepEqual(receiver.exportSave(), before);
  const meteor = new GameEngine(); meteor.startWave(); meteor.update(.01); meteor.castSkill('meteor', 20, 240);
  const prohibited = meteor.exportSave(); prohibited.challenge = 'no-meteor'; assert.equal(receiver.importSave(prohibited).ok, false); assert.deepEqual(receiver.exportSave(), before);
  const unknown = ordinary.exportSave(); unknown.challenge = 'constructor' as ChallengeMode; assert.equal(receiver.importSave(unknown).ok, false); assert.deepEqual(receiver.exportSave(), before);
});
