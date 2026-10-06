import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTIES, HARD_DIFFICULTIES } from '../src/difficulties';
import { PROGRESS_KEY, ProgressStore } from '../src/progress';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import type { ChallengeMode, Difficulty } from '../src/types';

const ids = ['forest', 'marsh', 'frost', 'volcano'];
function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const save = (levelId: string, difficulty: Difficulty, challenge: ChallengeMode = 'standard') => ({
  version: 1, levelId, difficulty, challenge, state: { phase: 'battle', wave: 2 },
  upgrades: { rangedDamageMultiplier: 1.04, soldierHpMultiplier: 1, heroHpMultiplier: 1, skillCooldownMultiplier: .96 },
});

test('all shared hard difficulties keep their best campaign badge across weaker replays and reload', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20);
  for (const difficulty of HARD_DIFFICULTIES) {
    store.recordVictory('forest', 10, 20, false, difficulty);
    store.recordVictory('forest', 20, 20, false, difficulty);
    store.recordVictory('forest', 2, 20, false, difficulty);
  }
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.completed.forest.challengeStars, Object.fromEntries(HARD_DIFFICULTIES.map(difficulty => [difficulty, 3])));
  assert.equal(reloaded.progress.completed.forest.victories, 1 + HARD_DIFFICULTIES.length * 3);
  assert.equal(reloaded.earnedStars(), 3);
  assert.equal(Object.hasOwn(reloaded.progress.completed.forest.challengeStars!, 'normal'), false);
});

test('nightmare and inferno campaign victories obey prerequisite unlocks and never multiply twelve training stars', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  assert.equal(store.recordVictory('volcano', 20, 20, false, 'inferno'), null);
  assert.equal(store.recordVictory('marsh', 20, 20, false, 'nightmare'), null);
  for (const id of ids) store.recordVictory(id, 20);
  assert.equal(store.earnedStars(), 12);
  for (const difficulty of HARD_DIFFICULTIES) for (const id of ids) store.recordVictory(id, 20, 20, false, difficulty);
  const reloaded = new ProgressStore(storage, ids);
  assert.equal(reloaded.earnedStars(), 12); assert.equal(reloaded.availableStars(), 12);
  assert.equal(reloaded.progress.completed.volcano.challengeStars?.nightmare, 3);
  assert.equal(reloaded.progress.completed.volcano.challengeStars?.inferno, 3);
});

test('both rule challenges record all five difficulties independently without granting campaign rewards', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 2);
  const completed = structuredClone(store.progress.completed);
  for (const mode of ['four-towers', 'no-meteor'] as const) for (const [index, difficulty] of DIFFICULTIES.entries()) {
    const lives = index + 1;
    assert.deepEqual(store.recordRuleVictory('forest', mode, lives, 20, false, difficulty), { medal: 1, bestLives: lives, victories: 1 });
  }
  store.recordRuleVictory('forest', 'four-towers', 20, 20, false, 'inferno');
  store.recordRuleVictory('forest', 'no-meteor', 10, 20, false, 'nightmare');
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.completed, completed); assert.equal(reloaded.earnedStars(), 1);
  for (const mode of ['four-towers', 'no-meteor'] as const) for (const [index, difficulty] of DIFFICULTIES.entries()) {
    const record = reloaded.getRuleRecord('forest', mode, difficulty)!; assert.ok(record);
    if (mode === 'four-towers' && difficulty === 'inferno') assert.deepEqual(record, { medal: 3, bestLives: 20, victories: 2 });
    else if (mode === 'no-meteor' && difficulty === 'nightmare') assert.deepEqual(record, { medal: 2, bestLives: 10, victories: 2 });
    else assert.deepEqual(record, { medal: 1, bestLives: index + 1, victories: 1 });
  }
  assert.equal(reloaded.isUnlocked('frost'), false);
});

test('new difficulty victory snapshots merge their highest badge without counting repeated refreshes', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 10, 20, true, 'nightmare');
  store.recordVictory('forest', 20, 20, true, 'inferno');
  store.recordVictory('forest', 2, 20, true, 'nightmare');
  assert.equal(store.progress.completed.forest.victories, 1);
  assert.deepEqual(store.progress.completed.forest.challengeStars, { nightmare: 2, inferno: 3 });
  store.recordRuleVictory('forest', 'no-meteor', 10, 20, true, 'inferno');
  store.recordRuleVictory('forest', 'no-meteor', 20, 20, true, 'inferno');
  store.recordRuleVictory('forest', 'no-meteor', 2, 20, true, 'inferno');
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.getRuleRecord('forest', 'no-meteor', 'inferno'), { medal: 3, bestLives: 20, victories: 1 });
  assert.equal(reloaded.earnedStars(), 3);
});

test('selected nightmare and inferno resume slots preserve their deployment and do not overwrite other modes or levels', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20); store.recordVictory('marsh', 20); store.learnDoctrine('marksman'); store.learnDoctrine('focus');
  const standard = save('forest', 'nightmare'), four = save('forest', 'inferno', 'four-towers');
  const noMeteor = save('forest', 'nightmare', 'no-meteor'), marsh = save('marsh', 'inferno');
  assert.ok(store.checkpoint(standard, 'forest')); assert.ok(store.checkpoint(four, 'forest', 'four-towers'));
  assert.ok(store.checkpoint(marsh, 'marsh')); assert.ok(store.checkpoint(noMeteor, 'forest', 'no-meteor'));
  const reloaded = new ProgressStore(storage, ids);
  assert.equal(reloaded.progress.selectedLevelId, 'forest'); assert.equal(reloaded.progress.selectedChallenge, 'no-meteor');
  assert.deepEqual(reloaded.progress.checkpoint, noMeteor);
  assert.deepEqual(reloaded.getCheckpoint('forest'), standard); assert.deepEqual(reloaded.getCheckpoint('forest', 'four-towers'), four);
  assert.deepEqual(reloaded.getCheckpoint('marsh'), marsh); assert.deepEqual(reloaded.progress.doctrines, { marksman: 1, focus: 1 });
});

test('existing three difficulty badges, rule results and snapshots stay intact without inventing newer wins', () => {
  const storage = memory();
  const legacy = { version: 1, levelId: 'forest', state: { phase: 'battle', wave: 2 } };
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, selectedLevelId: 'forest',
    completed: { forest: { stars: 3, bestLives: 20, victories: 4, challengeStars: { veteran: 2, heroic: 1 } } },
    checkpoints: { forest: legacy }, doctrines: { guardian: 2 },
    ruleRecords: { 'forest::four-towers': { normal: { medal: 3, bestLives: 20, victories: 1 }, veteran: { medal: 2, bestLives: 10, victories: 2 }, heroic: { medal: 1, bestLives: 2, victories: 1 } } },
  }));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(store.progress.completed.forest, { stars: 3, bestLives: 20, victories: 4, challengeStars: { veteran: 2, heroic: 1 } });
  assert.deepEqual(store.getCheckpoint('forest'), legacy); assert.deepEqual(store.progress.doctrines, { guardian: 2 });
  assert.equal(store.getRuleRecord('forest', 'four-towers', 'nightmare'), null); assert.equal(store.getRuleRecord('forest', 'four-towers', 'inferno'), null);
  assert.deepEqual(store.getRuleRecord('forest', 'four-towers', 'heroic'), { medal: 1, bestLives: 2, victories: 1 });
});

test('unknown difficulty results and snapshots are rejected without altering valid campaign records', () => {
  const store = new ProgressStore(memory(), ids); store.recordVictory('forest', 20);
  assert.ok(store.checkpoint(save('forest', 'inferno'), 'forest'));
  const before = structuredClone(store.progress);
  for (const difficulty of ['impossible', 'toString', '__proto__', '', null, 10] as unknown as Difficulty[]) {
    assert.equal(store.recordVictory('forest', 20, 20, false, difficulty), null);
    assert.equal(store.recordRuleVictory('forest', 'four-towers', 20, 20, false, difficulty), null);
    assert.equal(store.getRuleRecord('forest', 'four-towers', difficulty), null);
    assert.equal(store.checkpoint(save('forest', difficulty), 'forest'), false);
    assert.equal(store.checkpoint(save('forest', difficulty, 'no-meteor'), 'forest', 'no-meteor'), false);
  }
  assert.deepEqual(store.progress, before);
});

test('untrusted new badges cannot forge prerequisite victories and unknown snapshot difficulty never imports', () => {
  const storage = memory();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, selectedLevelId: 'marsh', selectedChallenge: 'four-towers',
    completed: { forest: { stars: 2, bestLives: 10, victories: 1, challengeStars: { veteran: 2, nightmare: 3, inferno: 7, normal: 3, cheat: 3 } },
      frost: { stars: 3, bestLives: 20, victories: 1, challengeStars: { inferno: 3 } } },
    doctrines: { marksman: 2 }, checkpoints: { forest: save('forest', 'cheat' as Difficulty) },
    challengeCheckpoints: { 'forest::four-towers': save('forest', 'cheat' as Difficulty, 'four-towers'), 'marsh::four-towers': save('marsh', 'inferno', 'four-towers') },
    ruleRecords: { 'forest::four-towers': { inferno: { medal: 3, bestLives: 20, victories: 1 }, cheat: { medal: 3, bestLives: 20, victories: 1 } },
      'marsh::four-towers': { inferno: { medal: 3, bestLives: 20, victories: 1 } } },
  }));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(Object.keys(store.progress.completed), ['forest']);
  assert.deepEqual(store.progress.completed.forest.challengeStars, { veteran: 2, nightmare: 3 });
  assert.deepEqual(store.progress.doctrines, { marksman: 2 }); assert.equal(store.earnedStars(), 2);
  assert.equal(store.isUnlocked('frost'), false); assert.equal(store.isChallengeUnlocked('marsh', 'four-towers'), false);
  assert.equal(store.getRuleRecord('marsh', 'four-towers', 'inferno'), null);
  assert.deepEqual(store.progress.ruleRecords, { 'forest::four-towers': { inferno: { medal: 3, bestLives: 20, victories: 1 } } });
  assert.equal(store.getCheckpoint('forest'), null); assert.equal(store.getCheckpoint('forest', 'four-towers'), null);
  assert.equal(store.getCheckpoint('marsh', 'four-towers'), null); assert.equal(store.progress.selectedChallenge, 'standard');
});

test('real nightmare and inferno battle saves retain difficulty, wave timing and deployed training through each mode slot', () => {
  for (const difficulty of ['nightmare', 'inferno'] as const) {
    const storage = memory(), store = new ProgressStore(storage, ids);
    store.recordVictory('forest', 20); assert.ok(store.learnDoctrine('marksman').ok); assert.ok(store.learnDoctrine('focus').ok);
    const upgrades = deriveBattleUpgrades(store.progress.doctrines);
    const deployed = new Map<ChallengeMode, GameEngine>();
    for (const challenge of ['standard', 'four-towers', 'no-meteor'] as const) {
      const engine = new GameEngine(0x9201, 'forest', { difficulty, challenge, upgrades });
      assert.ok(engine.build(1, 'arrow').ok); assert.ok(engine.build(5, 'mage').ok); assert.ok(engine.build(8, 'barracks').ok);
      engine.update(2); assert.ok(engine.startWave().ok); engine.update(8);
      assert.ok(engine.state.enemies.length > 0 && engine.state.spawnQueue.length > 0);
      assert.ok(store.checkpoint(engine.exportSave(), 'forest', challenge)); deployed.set(challenge, engine);
    }
    assert.ok(store.resetDoctrines().ok);
    const reloaded = new ProgressStore(storage, ids);
    assert.equal(reloaded.progress.selectedChallenge, 'no-meteor'); assert.deepEqual(reloaded.progress.doctrines, {});
    for (const [challenge, original] of deployed) {
      const restored = new GameEngine(1, 'marsh');
      assert.ok(restored.importSave(reloaded.getCheckpoint('forest', challenge)).ok);
      assert.equal(restored.difficulty, difficulty); assert.equal(restored.challenge, challenge); assert.deepEqual(restored.upgrades, upgrades);
      assert.deepEqual(restored.state.spawnQueue, original.state.spawnQueue);
      assert.deepEqual(restored.exportSave(), original.exportSave());
      original.update(.1); restored.update(.1); assert.deepEqual(restored.exportSave(), original.exportSave());
    }
  }
});
