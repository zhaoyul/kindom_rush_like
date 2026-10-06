import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getLevelForRules, LEVELS, WAVES } from '../src/data';
import { analyzeWave, getEnemyCounters, getLevelTactics } from '../src/tactical-guide';
import type { EnemyKind, LevelDefinition, LevelId, TowerKind } from '../src/types';

test('opening intelligence derives wave size, bounty, health and last spawn from current data', () => {
  const intel = analyzeWave('forest', 0)!;
  assert.equal(intel.waveNumber, 1); assert.equal(intel.name, WAVES[0].name);
  assert.equal(intel.enemyCount, 12); assert.equal(intel.bounty, 120); assert.equal(intel.totalBaseHp, 840);
  assert.equal(intel.spawnDuration, 14); assert.equal(intel.peakSpawnCount, 3);
  assert.equal(intel.fastCount, 0); assert.equal(intel.armoredCount, 0); assert.equal(intel.healerCount, 0);
  assert.ok(intel.recommendedTowers.includes('arrow')); assert.ok(!intel.tags.includes('boss'));
});

test('spawn forecasts respect delayed groups and overlapping pressure rather than summing durations', () => {
  const source: LevelDefinition = { ...LEVELS[0], waves: [{ name:'Synthetic pressure', description:'not a copied campaign wave', enemies:[
    {kind:'goblin',count:3,interval:1}, {kind:'orc',count:2,interval:2}, {kind:'wolf',count:2,interval:.5,delay:1},
  ] }] };
  const intel = analyzeWave(source, 0)!;
  assert.equal(intel.name, 'Synthetic pressure'); assert.equal(intel.enemyCount, 7);
  assert.equal(intel.spawnDuration, 5); assert.equal(intel.peakSpawnCount, 6);
  assert.ok(intel.tags.includes('swarm')); assert.equal(intel.armoredCount, 2); assert.equal(intel.fastCount, 2);
  assert.equal(intel.bounty, 3 * ENEMY_STATS.goblin.gold + 2 * ENEMY_STATS.orc.gold + 2 * ENEMY_STATS.wolf.gold);
});

test('invalid, fractional and completed wave indices return no forecast', () => {
  for (const index of [-1, .5, NaN, Infinity, WAVES.length, 9000]) assert.equal(analyzeWave('forest', index), null);
  assert.equal(analyzeWave('unknown' as LevelId, 0), null);
  assert.throws(() => getEnemyCounters('toString' as EnemyKind), /Unknown enemy/);
});

test('heavy armor recommends magical damage while magic resistance recommends physical towers', () => {
  const golem = getEnemyCounters('golem'), shaman = getEnemyCounters('shaman');
  assert.equal(golem.physicalRetention, 1 - ENEMY_STATS.golem.armor); assert.equal(golem.magicRetention, 1 - ENEMY_STATS.golem.magicResist);
  assert.ok(golem.tags.includes('armored')); assert.ok(golem.recommendedTowers.includes('mage'));
  assert.ok(shaman.tags.includes('magic-resistant')); assert.ok(shaman.tags.includes('healer'));
  assert.equal(shaman.recommendedTowers[0], 'arrow'); assert.ok(shaman.recommendedSkills.includes('hero-dash'));
  assert.ok(golem.advice.join('').includes(`${Math.round(ENEMY_STATS.golem.armor * 100)}%`));
});

test('special mechanics recommend the real control, healing and spacing tools', () => {
  const wolf = getEnemyCounters('icewolf'); assert.ok(wolf.tags.includes('slow-resistant'));
  assert.ok(wolf.recommendedSkills.includes('hero-roots')); assert.ok(wolf.recommendedTowers.includes('barracks'));
  const serpent = getEnemyCounters('serpent'); assert.ok(serpent.tags.includes('poison')); assert.ok(serpent.recommendedSkills.includes('hero-oath'));
  const bog = getEnemyCounters('bogling'); assert.ok(bog.tags.includes('regeneration')); assert.equal(bog.recommendedTowers[0], 'cannon');
  const imp = getEnemyCounters('imp'); assert.ok(imp.tags.includes('explosive')); assert.ok(imp.advice.some(advice => advice.includes('远程')));
  const lord = getEnemyCounters('juggernaut'); assert.ok(lord.tags.includes('boss')); assert.ok(lord.advice.some(advice => advice.includes('分开')));
});

test('mixed heavy, healer and fast waves expose appropriate priorities and a bounded actionable briefing', () => {
  const intel = analyzeWave('forest', 7)!;
  assert.equal(intel.bossCount, 1); assert.equal(intel.healerCount, 4); assert.equal(intel.fastCount, 10);
  assert.equal(intel.armoredCount, 15); assert.equal(intel.magicResistantCount, 4);
  assert.ok(intel.targetingAdvice.some(advice => advice.towerKind === 'mage' && advice.priority === 'strong'));
  assert.ok(intel.targetingAdvice.some(advice => advice.towerKind === 'arrow' && advice.priority === 'first'));
  assert.ok(intel.advice.length > 0 && intel.advice.length <= 3); assert.ok(intel.warnings.join('').includes('8'));
});

test('every enemy has valid counters and every campaign wave has a data-backed forecast', () => {
  const towers: TowerKind[] = ['arrow','mage','cannon','barracks'];
  for (const kind of Object.keys(ENEMY_STATS) as EnemyKind[]) {
    const counter = getEnemyCounters(kind); assert.equal(counter.kind, kind); assert.equal(counter.name, ENEMY_STATS[kind].name);
    assert.ok(counter.advice.length); assert.ok(counter.recommendedTowers.every(kind => towers.includes(kind)));
    assert.equal(new Set(counter.recommendedTowers).size, counter.recommendedTowers.length);
    assert.ok(counter.physicalRetention > 0 && counter.physicalRetention <= 1);
    assert.ok(counter.magicRetention > 0 && counter.magicRetention <= 1);
  }
  for (const level of LEVELS) for (let index=0; index<level.waves.length; index++) {
    const intel=analyzeWave(level,index)!; const wave=level.waves[index];
    assert.equal(intel.enemyCount,wave.enemies.reduce((total,group)=>total+group.count,0));
    assert.equal(intel.waveNumber,index+1); assert.ok(intel.recommendedTowers.length);
    assert.ok(intel.advice.length<=3&&intel.warnings.length<=3);
  }
});

test('level tactics differ with actual enemy roles and candidate sites belong to the current route', () => {
  const forest=getLevelTactics('forest'), marsh=getLevelTactics('marsh'), frost=getLevelTactics('frost'), volcano=getLevelTactics('volcano');
  assert.ok(!forest.specialties.includes('poison')); assert.ok(marsh.specialties.includes('poison'));
  assert.ok(frost.specialties.includes('slow-resistant')); assert.ok(volcano.specialties.includes('explosive'));
  for(const level of LEVELS) {
    const tactics=getLevelTactics(level); assert.equal(tactics.totalWaves,level.waves.length);
    assert.equal(tactics.enemyCount,level.waves.flatMap(wave=>wave.enemies).reduce((sum,group)=>sum+group.count,0));
    assert.ok(tactics.positions.length>0&&tactics.positions.length<=2);
    for(const position of tactics.positions) {
      const slot=level.slots.find(slot=>slot.id===position.slotId)!; assert.ok(slot);
      assert.deepEqual(position.point,{x:slot.x,y:slot.y}); assert.ok(position.coverage>0);
      assert.ok(position.pathProgress>0&&position.pathProgress<level.pathLength);
    }
  }
});

test('briefings are deterministic and neither mutate definitions nor share mutable output arrays', () => {
  const source=structuredClone(LEVELS[0]), before=structuredClone(source);
  const a=getLevelTactics(source), b=getLevelTactics(source); assert.deepEqual(a,b); assert.deepEqual(source,before);
  a.advice.push('changed'); a.firstWave.recommendedTowers.length=0; a.positions[0].point.x=-99;
  assert.deepEqual(getLevelTactics(source),b); assert.deepEqual(source,before);
});

test('split fast arrivals expose reserve-control advice while legacy briefings keep the original single group', () => {
  for (const index of [5, 7]) {
    const current = analyzeWave(getLevelForRules('forest', 2), index)!;
    const legacy = analyzeWave(getLevelForRules('forest', 1), index)!;
    assert.equal(current.fastArrivalBatches, 2); assert.equal(legacy.fastArrivalBatches, 1);
    assert.ok(current.advice[0].includes('后批')); assert.ok(current.advice[0].includes('保留'));
    assert.ok(current.warnings.some(warning => warning.includes('后续突袭')));
    assert.ok(current.warnings.some(warning => warning.includes('治疗者') && warning.includes('重甲')));
  }
  assert.equal(analyzeWave('forest', 0)!.fastArrivalBatches, 0);
});

test('fast-batch forecasts merge overlapping groups and use actual serial scheduling rather than group count', () => {
  const source: LevelDefinition = { ...LEVELS[0], waves: [{ name: 'Reserve control', description: '', enemies: [
    { kind: 'wolf', count: 5, interval: 1, delay: 0 }, { kind: 'icewolf', count: 2, interval: 1, delay: 3 },
    { kind: 'wolf', count: 3, interval: 1, delay: 8 },
  ] }] };
  assert.equal(analyzeWave(source, 0)!.fastArrivalBatches, 2);
  source.waves[0].enemies[2].delay = 5;
  const merged = analyzeWave(source, 0)!;
  assert.equal(merged.fastArrivalBatches, 1);
  assert.ok(!merged.warnings.some(warning => warning.includes('后续突袭')));
});
