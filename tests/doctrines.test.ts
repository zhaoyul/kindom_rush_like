import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCTRINES, deriveBattleUpgrades, sanitizeDoctrineRanks } from '../src/doctrines';

test('training defines four bilingual three-rank upgrades for one star per rank', () => {
  assert.deepEqual(Object.keys(DOCTRINES), ['marksman', 'bulwark', 'guardian', 'focus']);
  for (const doctrine of Object.values(DOCTRINES)) {
    assert.equal(doctrine.maxRank, 3);
    assert.equal(doctrine.cost, 1);
    assert.ok(doctrine.name && doctrine.nameEn && doctrine.description && doctrine.descriptionEn && doctrine.icon);
  }
});

test('training derives linear bonuses and a fresh deployment owns its values', () => {
  assert.deepEqual(deriveBattleUpgrades(), {
    rangedDamageMultiplier: 1, soldierHpMultiplier: 1,
    heroHpMultiplier: 1, skillCooldownMultiplier: 1,
  });
  const ranks = { marksman: 2, bulwark: 1, guardian: 3, focus: 2 };
  const deployed = deriveBattleUpgrades(ranks);
  assert.deepEqual(deployed, {
    rangedDamageMultiplier: 1.08, soldierHpMultiplier: 1.06,
    heroHpMultiplier: 1.18, skillCooldownMultiplier: .92,
  });
  ranks.marksman = 3;
  assert.equal(deployed.rangedDamageMultiplier, 1.08);
  assert.equal(deriveBattleUpgrades(ranks).rangedDamageMultiplier, 1.12);
  assert.deepEqual(deriveBattleUpgrades({ marksman: 3, bulwark: 3, guardian: 3, focus: 3 }), {
    rangedDamageMultiplier: 1.12, soldierHpMultiplier: 1.18,
    heroHpMultiplier: 1.18, skillCooldownMultiplier: .88,
  });
});

test('unknown, inherited, fractional and out-of-range ranks cannot grant bonuses', () => {
  assert.deepEqual(sanitizeDoctrineRanks({ marksman: 4, bulwark: 1.5, guardian: -1, focus: '3', cheat: 3 }), {});
  assert.deepEqual(sanitizeDoctrineRanks({ marksman: 0, bulwark: 2, guardian: NaN, focus: Infinity }), { bulwark: 2 });
  assert.deepEqual(sanitizeDoctrineRanks(Object.create({ marksman: 3 })), {});
  for (const corrupt of [null, undefined, 3, '3', [3]]) assert.deepEqual(sanitizeDoctrineRanks(corrupt), {});
  assert.deepEqual(deriveBattleUpgrades({ marksman: 100, bulwark: -10, guardian: 1.5, focus: NaN }), deriveBattleUpgrades());
});
