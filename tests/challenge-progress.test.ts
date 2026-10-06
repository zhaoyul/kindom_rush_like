import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, describeChallenge, getChallenge, isChallengeMode, isRuleChallenge } from '../src/challenges';
import { ProgressStore, PROGRESS_KEY } from '../src/progress';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import type { ChallengeMode, Difficulty } from '../src/types';

const ids = ['forest', 'marsh', 'frost', 'volcano'];
const modes = ['four-towers', 'no-meteor'] as const;
function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const snapshot = (levelId: string, challenge: ChallengeMode) => ({ version: 1, levelId, challenge, difficulty: 'veteran', state: { phase: 'battle', wave: 3 } });

test('challenge definitions identify the exact restrictions and reject prototype names', () => {
  assert.deepEqual(Object.keys(CHALLENGES), ['standard', 'four-towers', 'no-meteor']);
  assert.equal(getChallenge('four-towers')?.name, '四塔防线');
  assert.equal(getChallenge('no-meteor')?.name, '禁咒试炼');
  assert.ok(describeChallenge('four-towers').includes('出售后重建'));
  assert.ok(describeChallenge('no-meteor').includes('援军与全部英雄技能'));
  assert.equal(isRuleChallenge('standard'), false);
  for (const value of ['toString', '__proto__', 'cheat', null, 1, {}]) {
    assert.equal(isChallengeMode(value), false); assert.equal(isRuleChallenge(value), false);
  }
  assert.equal(getChallenge('unknown'), undefined);
});

test('each rule challenge requires a standard victory on that same level', () => {
  const store = new ProgressStore(memory(), ids), before = structuredClone(store.progress);
  for (const mode of modes) {
    assert.equal(store.isChallengeUnlocked('forest', mode), false);
    assert.equal(store.recordRuleVictory('forest', mode, 20), null);
    assert.equal(store.checkpoint(snapshot('forest', mode), 'forest', mode), false);
    assert.equal(store.getCheckpoint('forest', mode), null);
    assert.equal(store.getRuleRecord('forest', mode), null);
  }
  assert.deepEqual(store.progress, before);
  store.recordVictory('forest', 20);
  assert.equal(store.isChallengeUnlocked('marsh', 'standard'), true);
  assert.equal(store.isChallengeUnlocked('marsh', 'four-towers'), false);
  assert.equal(store.recordRuleVictory('marsh', 'four-towers', 20), null);
  store.recordVictory('marsh', 10);
  assert.equal(store.isChallengeUnlocked('marsh', 'four-towers'), true);
});

test('rule medals and difficulty records never add campaign stars, training currency or unlocks', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 2); assert.ok(store.learnDoctrine('focus').ok);
  const completed = structuredClone(store.progress.completed), doctrines = structuredClone(store.progress.doctrines);
  for (const mode of modes) for (const difficulty of ['normal', 'veteran', 'heroic'] as const) {
    assert.deepEqual(store.recordRuleVictory('forest', mode, 20, 20, false, difficulty), { medal: 3, bestLives: 20, victories: 1 });
  }
  assert.deepEqual(store.progress.completed, completed); assert.deepEqual(store.progress.doctrines, doctrines);
  assert.equal(store.earnedStars(), 1); assert.equal(store.spentStars(), 1); assert.equal(store.availableStars(), 0);
  assert.equal(store.isUnlocked('frost'), false);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.completed, completed); assert.deepEqual(reloaded.progress.doctrines, doctrines);
  assert.equal(reloaded.earnedStars(), 1);
  assert.deepEqual(reloaded.getRuleRecord('forest', 'four-towers', 'heroic'), { medal: 3, bestLives: 20, victories: 1 });
});

test('rule results preserve best medals independently for each level, rule and difficulty', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20); store.recordVictory('marsh', 20);
  store.recordRuleVictory('forest', 'four-towers', 10);
  store.recordRuleVictory('forest', 'four-towers', 2);
  store.recordRuleVictory('forest', 'four-towers', 20, 20, false, 'veteran');
  store.recordRuleVictory('forest', 'no-meteor', 2);
  store.recordRuleVictory('marsh', 'four-towers', 18);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.getRuleRecord('forest', 'four-towers'), { medal: 2, bestLives: 10, victories: 2 });
  assert.deepEqual(reloaded.getRuleRecord('forest', 'four-towers', 'veteran'), { medal: 3, bestLives: 20, victories: 1 });
  assert.deepEqual(reloaded.getRuleRecord('forest', 'no-meteor'), { medal: 1, bestLives: 2, victories: 1 });
  assert.deepEqual(reloaded.getRuleRecord('marsh', 'four-towers'), { medal: 3, bestLives: 18, victories: 1 });
  assert.equal(reloaded.getRuleRecord('forest', 'four-towers', 'heroic'), null);
});

test('restored rule victories repair missing results and merge better badges without repeat counting', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 2);
  const win = { ...snapshot('forest', 'no-meteor'), state: { phase: 'victory', lives: 20 } };
  assert.ok(store.checkpoint(win, 'forest', 'no-meteor'));
  const resumed = new ProgressStore(storage, ids);
  assert.deepEqual(resumed.recordRuleVictory('forest', 'no-meteor', 10, 20, true), { medal: 2, bestLives: 10, victories: 1 });
  resumed.recordRuleVictory('forest', 'no-meteor', 10, 20, true);
  resumed.recordRuleVictory('forest', 'no-meteor', 2);
  resumed.recordRuleVictory('forest', 'no-meteor', 20, 20, true);
  resumed.recordRuleVictory('forest', 'no-meteor', 2, 20, true);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.getRuleRecord('forest', 'no-meteor'), { medal: 3, bestLives: 20, victories: 2 });
  assert.deepEqual(reloaded.progress.completed.forest, { stars: 1, bestLives: 2, victories: 1 });
});

test('ordinary and both rule checkpoints remain independent through reload and mode-specific discard', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20); store.recordVictory('marsh', 20);
  const normal = snapshot('forest', 'standard'), four = snapshot('forest', 'four-towers'), noMeteor = snapshot('forest', 'no-meteor');
  const marsh = snapshot('marsh', 'four-towers');
  assert.ok(store.checkpoint(normal, 'forest'));
  assert.ok(store.checkpoint(four, 'forest', 'four-towers'));
  assert.ok(store.checkpoint(marsh, 'marsh', 'four-towers'));
  assert.ok(store.checkpoint(noMeteor, 'forest', 'no-meteor'));
  const reloaded = new ProgressStore(storage, ids);
  assert.equal(reloaded.progress.selectedChallenge, 'no-meteor');
  assert.deepEqual(reloaded.progress.checkpoint, noMeteor);
  assert.deepEqual(reloaded.getCheckpoint('forest'), normal);
  assert.deepEqual(reloaded.getCheckpoint('forest', 'four-towers'), four);
  assert.deepEqual(reloaded.getCheckpoint('marsh', 'four-towers'), marsh);
  assert.ok(reloaded.discardCheckpoint());
  assert.equal(reloaded.getCheckpoint('forest', 'no-meteor'), null);
  assert.deepEqual(reloaded.getCheckpoint('forest'), normal);
  assert.ok(reloaded.discardCheckpoint('forest', 'four-towers'));
  assert.deepEqual(reloaded.getCheckpoint('marsh', 'four-towers'), marsh);
  assert.deepEqual(new ProgressStore(storage, ids).getCheckpoint('forest'), normal);
});

test('cross-level and cross-rule snapshots cannot overwrite a valid slot or change selection', () => {
  const store = new ProgressStore(memory(), ids); store.recordVictory('forest', 20);
  assert.ok(store.checkpoint(snapshot('forest', 'standard'), 'forest'));
  const before = structuredClone(store.progress);
  for (const [save, level, mode] of [
    [snapshot('marsh', 'four-towers'), 'forest', 'four-towers'],
    [snapshot('forest', 'no-meteor'), 'forest', 'four-towers'],
    [snapshot('forest', 'four-towers'), 'forest', 'standard'],
    [{ version: 1, levelId: 'forest' }, 'forest', 'four-towers'],
    [[], 'forest', 'standard'], [null, 'forest', 'standard'],
  ] as [unknown, string, ChallengeMode][]) assert.equal(store.checkpoint(save, level, mode), false);
  assert.equal(store.checkpoint({}, 'forest', 'invalid' as ChallengeMode), false);
  assert.equal(store.discardCheckpoint('unknown', 'standard'), false);
  assert.deepEqual(store.progress, before);
});

test('untrusted challenge records and locked snapshots are discarded without changing valid old progress', () => {
  const storage = memory();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, selectedLevelId: 'marsh', selectedChallenge: 'four-towers',
    completed: { forest: { stars: 2, bestLives: 10, victories: 1 } }, doctrines: { focus: 2 },
    checkpoints: { forest: snapshot('forest', 'standard'), marsh: snapshot('forest', 'standard') },
    challengeCheckpoints: { 'forest::four-towers': snapshot('forest', 'four-towers'), 'forest::no-meteor': snapshot('forest', 'four-towers'),
      'marsh::four-towers': snapshot('marsh', 'four-towers'), 'cheat::four-towers': snapshot('cheat', 'four-towers') },
    ruleRecords: {
      'forest::four-towers': { normal: { medal: 2, bestLives: 10, victories: 2 }, veteran: { medal: 4, bestLives: 20, victories: 1 }, heroic: { medal: 3, bestLives: 0, victories: 1 }, cheat: { medal: 3, bestLives: 20, victories: 1 } },
      'forest::no-meteor': { normal: { medal: 3, bestLives: 20, victories: -1 } },
      'marsh::four-towers': { normal: { medal: 3, bestLives: 20, victories: 1 } },
      'forest::standard': { normal: { medal: 3, bestLives: 20, victories: 1 } },
    },
  }));
  const store = new ProgressStore(storage, ids);
  assert.equal(store.progress.selectedLevelId, 'marsh'); assert.equal(store.progress.selectedChallenge, 'standard');
  assert.deepEqual(store.progress.doctrines, { focus: 2 }); assert.equal(store.availableStars(), 0);
  assert.deepEqual(store.progress.completed.forest, { stars: 2, bestLives: 10, victories: 1 });
  assert.deepEqual(store.progress.ruleRecords, { 'forest::four-towers': { normal: { medal: 2, bestLives: 10, victories: 2 } } });
  assert.deepEqual(Object.keys(store.progress.challengeCheckpoints), ['forest::four-towers']);
  assert.equal(store.getCheckpoint('marsh', 'four-towers'), null);
  assert.equal(store.getRuleRecord('marsh', 'four-towers'), null);
  assert.equal(store.getCheckpoint('marsh'), null);
});

test('older progress and missing challenge fields default to standard without changing migration or training', () => {
  const storage = memory(); storage.setItem('verdant-best', '3');
  const legacy = new ProgressStore(storage, ids);
  assert.equal(legacy.progress.selectedChallenge, 'standard'); assert.deepEqual(legacy.progress.ruleRecords, {});
  assert.deepEqual(legacy.progress.challengeCheckpoints, {}); assert.equal(legacy.earnedStars(), 3);
  const old = { version: 1, selectedLevelId: 'forest', completed: { forest: { stars: 2, bestLives: 10, victories: 1 } },
    checkpoint: { version: 1, levelId: 'forest' }, doctrines: { marksman: 1 } };
  storage.setItem(PROGRESS_KEY, JSON.stringify(old));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(store.getCheckpoint('forest'), old.checkpoint);
  assert.equal(store.progress.selectedChallenge, 'standard'); assert.equal(store.earnedStars(), 2); assert.equal(store.spentStars(), 1);
});

test('malformed challenge containers cannot break valid campaign records or grant a rule result', () => {
  const storage = memory();
  for (const corrupt of [[], 'bad', 5, null]) {
    storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, completed: { forest: { stars: 3, bestLives: 20, victories: 1 } },
      doctrines: { guardian: 1 }, selectedChallenge: 'toString', ruleRecords: corrupt, challengeCheckpoints: corrupt }));
    const store = new ProgressStore(storage, ids);
    assert.equal(store.available, true); assert.equal(store.earnedStars(), 3); assert.equal(store.spentStars(), 1);
    assert.equal(store.progress.selectedChallenge, 'standard'); assert.deepEqual(store.progress.ruleRecords, {});
  }
});

test('invalid rule victories and difficulties fail without changing ordinary progress or stored bests', () => {
  const store = new ProgressStore(memory(), ids); store.recordVictory('forest', 20);
  const before = structuredClone(store.progress);
  for (const lives of [-1, 0, .5, 21, Infinity, NaN]) assert.equal(store.recordRuleVictory('forest', 'four-towers', lives), null);
  for (const starting of [0, -1, .5, 101, Infinity]) assert.equal(store.recordRuleVictory('forest', 'four-towers', 1, starting), null);
  assert.equal(store.recordRuleVictory('forest', 'standard', 20), null);
  assert.equal(store.recordRuleVictory('forest', 'four-towers', 20, 20, false, 'cheat' as Difficulty), null);
  assert.equal(store.recordRuleVictory('unknown', 'four-towers', 20), null);
  assert.deepEqual(store.progress, before);
});

test('rule checkpoint recovery preserves deployed difficulty and legally purchased training after a free respec', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  for (const id of ids) store.recordVictory(id, 20);
  for (const id of ['marksman', 'bulwark', 'guardian', 'focus'] as const) for (let rank = 0; rank < 3; rank++) assert.ok(store.learnDoctrine(id).ok);
  assert.equal(store.earnedStars(), 12); assert.equal(store.spentStars(), 12);
  const upgrades = deriveBattleUpgrades(store.progress.doctrines);
  const engine = new GameEngine(17, 'forest', { challenge: 'no-meteor', difficulty: 'heroic', upgrades });
  assert.ok(engine.build(1, 'arrow').ok); assert.ok(engine.build(5, 'mage').ok); assert.ok(engine.build(8, 'barracks').ok);
  engine.update(2); assert.ok(engine.startWave().ok); engine.update(8);
  const save = engine.exportSave(); assert.ok(store.checkpoint(save, 'forest', 'no-meteor'));
  assert.ok(store.resetDoctrines().ok);
  const reloaded = new ProgressStore(storage, ids), restored = new GameEngine();
  assert.deepEqual(reloaded.progress.doctrines, {});
  assert.ok(restored.importSave(reloaded.getCheckpoint('forest', 'no-meteor')).ok);
  assert.equal(restored.challenge, 'no-meteor'); assert.equal(restored.difficulty, 'heroic'); assert.deepEqual(restored.upgrades, upgrades);
  assert.deepEqual(restored.exportSave(), save);
  restored.update(.1); engine.update(.1); assert.deepEqual(restored.exportSave(), engine.exportSave());
});
