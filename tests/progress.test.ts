import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStore, PROGRESS_KEY, victoryStars } from '../src/progress';
import { deriveBattleUpgrades, type DoctrineId } from '../src/doctrines';
const ids = ['forest', 'marsh', 'frost', 'volcano'];
function memory() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
test('the original forest best score migrates and unlocks the new marsh without inventing remaining lives', () => {
  const storage=memory(); storage.setItem('verdant-best','2');
  const store=new ProgressStore(storage,ids);
  assert.equal(store.isUnlocked('marsh'),true);
  assert.deepEqual(store.progress.completed.forest,{stars:2,bestLives:0,victories:1});
  store.checkpoint({},'forest');
  assert.equal(new ProgressStore(storage,ids).progress.completed.forest.stars,2);
});
test('campaign unlocks in order and preserves best stars across reload and weaker replays', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  assert.equal(store.isUnlocked('marsh'), false);
  assert.equal(store.recordVictory('volcano', 20), null);
  store.recordVictory('forest', 20); store.recordVictory('forest', 2);
  assert.equal(store.isUnlocked('marsh'), true); assert.equal(store.isUnlocked('frost'), false);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.completed.forest, { stars: 3, bestLives: 20, victories: 2 });
  assert.equal(reloaded.isUnlocked('marsh'), true);
});
test('battle checkpoint and campaign records survive a fresh store instance', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  const checkpoint = { version: 1, levelId: 'forest', state: { gold: 175, wave: 3 } };
  assert.equal(store.checkpoint(checkpoint, 'forest'), true);
  assert.deepEqual(new ProgressStore(storage, ids).progress.checkpoint, checkpoint);
  assert.equal(store.checkpoint(checkpoint, 'marsh'), false);
  store.recordVictory('forest',20);
  store.checkpoint({version:1,levelId:'marsh'},'marsh');
  assert.deepEqual(store.getCheckpoint('forest'),checkpoint);
  store.discardCheckpoint('forest');
  assert.equal(store.getCheckpoint('forest'),null);
  store.discardCheckpoint(); assert.equal(new ProgressStore(storage, ids).progress.checkpoint, null);
});
test('a restored victory repairs missing stars and unlocks without counting an existing win twice', () => {
  const storage=memory(),store=new ProgressStore(storage,ids);
  store.checkpoint({version:1,levelId:'forest',state:{phase:'victory',lives:20}},'forest');
  const resumed=new ProgressStore(storage,ids);
  resumed.recordVictory('forest',20,20,true);
  assert.equal(resumed.isUnlocked('marsh'),true);
  assert.deepEqual(resumed.progress.completed.forest,{stars:3,bestLives:20,victories:1});
  resumed.recordVictory('forest',20,20,true);
  assert.equal(resumed.progress.completed.forest.victories,1);
  resumed.recordVictory('forest',2);
  resumed.recordVictory('forest',2,20,true);
  assert.deepEqual(new ProgressStore(storage,ids).progress.completed.forest,{stars:3,bestLives:20,victories:2});
});
test('corrupt records, unknown levels and invalid stars cannot unlock campaign', () => {
  const storage = memory(); storage.setItem(PROGRESS_KEY, JSON.stringify({version:1, selectedLevelId:'volcano', completed:{forest:{stars:100},marsh:{stars:-1},other:{stars:3}}}));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(store.progress.completed, {}); assert.equal(store.progress.selectedLevelId, 'forest');
  assert.equal(store.isUnlocked('other'), false); assert.equal(store.isUnlocked('volcano'), false);
});
test('storage exceptions are contained and star thresholds follow each level starting lives', () => {
  const store = new ProgressStore({getItem(){throw Error('denied')},setItem(){throw Error('quota')}}, ids);
  assert.equal(store.checkpoint({}, 'forest'), false); assert.equal(store.available, false);
  assert.equal(victoryStars(27,30),3); assert.equal(victoryStars(15,30),2); assert.equal(victoryStars(14,30),1);
});

test('earned stars buy permanent training once and persist through reload and weaker victories', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  assert.equal(store.learnDoctrine('marksman').ok, false);
  store.recordVictory('forest', 20);
  assert.equal(store.earnedStars(), 3);
  for (let rank = 1; rank <= 3; rank++) assert.equal(store.learnDoctrine('marksman').ok, true);
  assert.equal(store.spentStars(), 3);
  assert.equal(store.availableStars(), 0);
  assert.equal(store.learnDoctrine('marksman').ok, false);
  assert.equal(store.learnDoctrine('guardian').ok, false);
  assert.equal(store.learnDoctrine('unknown' as DoctrineId).ok, false);
  store.recordVictory('forest', 20); store.recordVictory('forest', 2);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.doctrines, { marksman: 3 });
  assert.equal(reloaded.earnedStars(), 3);
  assert.equal(reloaded.availableStars(), 0);
  reloaded.recordVictory('marsh', 10);
  assert.equal(reloaded.earnedStars(), 5);
  assert.equal(reloaded.learnDoctrine('guardian').ok, true);
  assert.equal(reloaded.availableStars(), 1);
});

test('free training reset preserves scores, unlocks and every independent checkpoint', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20); store.recordVictory('marsh', 20);
  store.checkpoint({ version: 1, levelId: 'forest' }, 'forest');
  store.checkpoint({ version: 1, levelId: 'frost' }, 'frost');
  store.learnDoctrine('marksman'); store.learnDoctrine('bulwark');
  const deployed = deriveBattleUpgrades(store.progress.doctrines);
  const completed = structuredClone(store.progress.completed), checkpoints = structuredClone(store.progress.checkpoints);
  assert.equal(store.resetDoctrines().ok, true);
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.doctrines, {});
  assert.deepEqual(reloaded.progress.completed, completed);
  assert.deepEqual(reloaded.progress.checkpoints, checkpoints);
  assert.equal(reloaded.isUnlocked('frost'), true);
  assert.equal(reloaded.isUnlocked('volcano'), false);
  assert.equal(reloaded.availableStars(), 6);
  assert.equal(deployed.rangedDamageMultiplier, 1.04);
  assert.equal(deployed.soldierHpMultiplier, 1.06);
  assert.equal(reloaded.learnDoctrine('focus').ok, true);
  assert.equal(reloaded.availableStars(), 5);
});

test('old campaign and original forest saves receive spendable stars without invented training', () => {
  const storage = memory();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, completed: { forest: { stars: 2, bestLives: 10, victories: 1 } } }));
  const oldCampaign = new ProgressStore(storage, ids);
  assert.deepEqual(oldCampaign.progress.doctrines, {});
  assert.equal(oldCampaign.availableStars(), 2);
  assert.equal(oldCampaign.learnDoctrine('focus').ok, true);
  const legacyStorage = memory(); legacyStorage.setItem('verdant-best', '3');
  const oldForest = new ProgressStore(legacyStorage, ids);
  assert.equal(oldForest.earnedStars(), 3);
  assert.equal(oldForest.learnDoctrine('guardian').ok, true);
});

test('saved training drops invalid ranks and refuses an overdrawn allocation', () => {
  const storage = memory();
  const completed = { forest: { stars: 3, bestLives: 20, victories: 1 } };
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, completed, doctrines: { marksman: 100, bulwark: 1.5, guardian: -1, focus: 2, cheat: 3 } }));
  const sanitized = new ProgressStore(storage, ids);
  assert.deepEqual(sanitized.progress.doctrines, { focus: 2 });
  assert.equal(sanitized.availableStars(), 1);
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, completed, doctrines: { marksman: 3, bulwark: 1 } }));
  const overdrawn = new ProgressStore(storage, ids);
  assert.deepEqual(overdrawn.progress.doctrines, {});
  assert.equal(overdrawn.availableStars(), 3);
  assert.deepEqual(deriveBattleUpgrades(overdrawn.progress.doctrines), deriveBattleUpgrades());
});

test('locked or unknown saved victories cannot fund training and total earned stars is at most twelve', () => {
  const storage = memory();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, selectedLevelId: 'volcano',
    completed: { forest: { stars: 2 }, frost: { stars: 3 }, volcano: { stars: 3 }, cheat: { stars: 3 } },
    doctrines: { marksman: 3 },
  }));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(Object.keys(store.progress.completed), ['forest']);
  assert.deepEqual(store.progress.doctrines, {});
  assert.equal(store.progress.selectedLevelId, 'forest');
  assert.equal(store.earnedStars(), 2);
  assert.equal(store.recordVictory('frost', 20), null);
  assert.equal(store.learnDoctrine('marksman').ok, true);
  assert.equal(store.learnDoctrine('marksman').ok, true);
  assert.equal(store.learnDoctrine('marksman').ok, false);
  for (const id of ids) store.recordVictory(id, 20);
  assert.equal(store.earnedStars(), 12);
  for (const id of ids) store.recordVictory(id, 20);
  assert.equal(store.earnedStars(), 12);
});

test('difficulty challenge badges retain their highest stars without duplicating campaign currency', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 20);
  assert.deepEqual(store.progress.completed.forest, { stars: 3, bestLives: 20, victories: 1 });
  store.recordVictory('forest', 10, 20, false, 'veteran');
  store.recordVictory('forest', 2, 20, false, 'heroic');
  store.recordVictory('forest', 20, 20, false, 'veteran');
  store.recordVictory('forest', 2, 20, false, 'veteran');
  store.recordVictory('forest', 20);
  const reloaded = new ProgressStore(storage, ids);
  assert.equal(reloaded.earnedStars(), 3);
  assert.deepEqual(reloaded.progress.completed.forest.challengeStars, { veteran: 3, heroic: 1 });
  assert.equal(reloaded.progress.completed.forest.victories, 6);
});

test('restored challenge victories merge badges and repair missing records idempotently', () => {
  const storage = memory(), store = new ProgressStore(storage, ids);
  store.recordVictory('forest', 10, 20, true, 'heroic');
  store.recordVictory('forest', 10, 20, true, 'heroic');
  assert.deepEqual(store.progress.completed.forest, { stars: 2, bestLives: 10, victories: 1, challengeStars: { heroic: 2 } });
  assert.equal(store.isUnlocked('marsh'), true);
  store.recordVictory('forest', 20, 20, true, 'veteran');
  store.recordVictory('forest', 2, 20, true, 'heroic');
  const reloaded = new ProgressStore(storage, ids);
  assert.deepEqual(reloaded.progress.completed.forest, { stars: 3, bestLives: 20, victories: 1, challengeStars: { veteran: 3, heroic: 2 } });
  assert.equal(reloaded.earnedStars(), 3);
});

test('corrupt challenge badge values and unknown difficulties are discarded on read', () => {
  const storage = memory();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, completed: {
    forest: { stars: 3, challengeStars: { veteran: 2, heroic: 4, normal: 3, cheat: 3 } },
    marsh: { stars: 2, challengeStars: { veteran: -1, heroic: 1.5 } },
    frost: { stars: 1, challengeStars: { veteran: '3', heroic: 1 } },
  } }));
  const store = new ProgressStore(storage, ids);
  assert.deepEqual(store.progress.completed.forest.challengeStars, { veteran: 2 });
  assert.equal(Object.hasOwn(store.progress.completed.marsh, 'challengeStars'), false);
  assert.deepEqual(store.progress.completed.frost.challengeStars, { heroic: 1 });
  assert.equal(store.earnedStars(), 6);
});
