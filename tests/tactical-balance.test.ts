import assert from 'node:assert/strict';
import test from 'node:test';
import { ENEMY_STATS, getTowerAbilities, getTowerStats } from '../src/data';
import { deriveBattleUpgrades } from '../src/doctrines';
import { GameEngine } from '../src/engine';
import type { Difficulty, Enemy, LevelId, TowerKind } from '../src/types';

const trained = deriveBattleUpgrades({ marksman:3, bulwark:3, guardian:3, focus:3 });
const plans: Record<'forest' | 'volcano', [number, TowerKind][]> = {
  forest: [[5,'mage'],[1,'arrow'],[8,'barracks'],[7,'mage'],[3,'mage'],[0,'arrow'],[9,'cannon'],[2,'mage'],[4,'cannon'],[6,'arrow']],
  volcano: [[1,'cannon'],[2,'mage'],[3,'barracks'],[4,'mage'],[5,'arrow'],[6,'mage'],[7,'cannon'],[8,'mage'],[9,'arrow'],[0,'arrow']],
};
function improveDefense(engine: GameEngine, plan: [number, TowerKind][]): void {
  for (const [slotId, kind] of plan) {
    let tower = engine.state.towers.find(tower => tower.slotId === slotId);
    if (!tower && engine.state.gold >= getTowerStats(kind,1).cost) { assert.ok(engine.build(slotId,kind).ok); tower=engine.state.towers.at(-1)!; }
    if (!tower) break;
    if (tower.kind !== 'barracks') assert.ok(engine.setTowerPriority(tower.id, tower.kind === 'mage' ? 'strong' : 'first').ok);
    while (tower.level < 3 && engine.state.gold >= getTowerStats(kind,tower.level).upgradeCost) assert.ok(engine.upgrade(tower.id).ok);
  }
  for (const tower of engine.state.towers.filter(tower=>tower.level===3)) for (const ability of getTowerAbilities(tower.kind)) {
    const rank=tower.abilities[ability.id]??0;
    if (rank<2&&engine.state.gold>=ability.costs[rank]) assert.ok(engine.buyTowerAbility(tower.id,ability.id).ok);
  }
}
function chooseCluster(enemies: Enemy[]): Enemy | undefined {
  let best: Enemy | undefined, score=0;
  for(const enemy of enemies) {
    if(enemy.x<30||enemy.x>1170) continue;
    const candidate=enemies.reduce((sum,foe)=>sum+(Math.hypot(enemy.x-foe.x,enemy.y-foe.y)<=95?Math.min(foe.hp,300):0),0);
    if(candidate>score){score=candidate;best=enemy;}
  }
  return best;
}
function useTactics(engine: GameEngine): boolean {
  const live=engine.state.enemies, front=live.filter(enemy=>enemy.x>30&&enemy.x<1170).sort((a,b)=>b.progress-a.progress)[0];
  if(!front)return false;
  const hero=engine.state.allies.find(ally=>ally.type==='hero')!;
  const charging=live.find(enemy=>enemy.bossCast&&Math.hypot(enemy.x-hero.x,enemy.y-hero.y)<=260);
  if(charging&&engine.castSkill('hero-roots',charging.x,charging.y).ok)return true;
  if(hero.hp>0&&hero.hp<hero.maxHp*.6&&engine.castSkill('hero',hero.x,hero.y).ok)return true;
  if(hero.hp>0&&hero.hp<hero.maxHp*.8&&engine.castSkill('hero-oath',hero.x,hero.y).ok)return true;
  const cluster=chooseCluster(live);
  if(cluster&&(live.length>=5||cluster.hp>=600)&&engine.castSkill('meteor',cluster.x,cluster.y).ok)return true;
  if(engine.castSkill('hero-roots',front.x,front.y).ok)return true;
  if(front.progress>engine.level.pathLength*.65&&engine.castSkill('hero-dash',front.x,front.y).ok)return true;
  if(front.progress>engine.level.pathLength*.45&&engine.castSkill('reinforce',front.x,front.y).ok)return true;
  return false;
}
function campaign(levelId: 'forest' | 'volcano', difficulty: Difficulty, training = false, early = false): GameEngine {
  const engine = new GameEngine(0x63e071,levelId,{ difficulty, ...(training?{upgrades:trained}:{}) });
  const plan=plans[levelId];
  const initial: [number,TowerKind][]=levelId==='forest'?[[1,'arrow'],[5,'mage'],[8,'barracks']]:plan.slice(0,3);
  for(const[slotId,kind]of initial)assert.ok(engine.build(slotId,kind).ok);
  engine.update(2); const history: object[]=[]; let frames=0, checkpoints=0, decisionTime=0, actionWave=0, waveActions=0;
  while(engine.state.phase!=='victory'&&engine.state.phase!=='defeat') {
    if(engine.state.phase==='preparation'||engine.state.phase==='intermission')assert.ok(engine.startWave().ok);
    for(let tick=0;tick<9000&&engine.state.phase==='battle';tick++) {
      if(actionWave!==engine.state.wave){actionWave=engine.state.wave;waveActions=0;}
      if(engine.state.time>=decisionTime){
        decisionTime=engine.state.time+2;
        if(waveActions<(levelId==='volcano'?6:3)&&useTactics(engine))waveActions++;
      }
      if(early&&engine.canCallEarlyWave&&engine.state.enemies.length<=3) {
        improveDefense(engine,plan); const previous=engine.state.wave;
        assert.ok(engine.callEarlyWave().ok); assert.equal(engine.state.wave,previous+1);
      }
      engine.update(.1); frames++;
      assert.ok(engine.state.gold>=0&&Number.isFinite(engine.state.gold));
      for(const enemy of engine.state.enemies)assert.equal(enemy.maxHp,ENEMY_STATS[enemy.kind].hp*(difficulty==='normal'?1:difficulty==='veteran'?1.25:1.5));
      if(frames%50===0){
        const save=engine.exportSave(),restored=new GameEngine(); assert.ok(restored.importSave(save).ok,`${difficulty}/${levelId}: ${engine.state.time}`);
        assert.equal(restored.difficulty,difficulty); assert.deepEqual(restored.upgrades,engine.upgrades);
        restored.update(.1); engine.update(.1); assert.deepEqual(restored.exportSave(),engine.exportSave()); checkpoints++;
      }
    }
    history.push({wave:engine.state.wave,lives:engine.state.lives,gold:engine.state.gold});
    assert.notEqual(engine.state.phase,'battle','Waves should resolve without permanent stalling.');
    if(engine.state.phase==='intermission'){improveDefense(engine,plan);engine.update(2);}
  }
  assert.equal(engine.state.phase,'victory',`${difficulty}/${levelId}: ${JSON.stringify(history)}`);
  assert.ok(engine.state.lives>0); assert.equal(engine.state.wave,engine.level.waves.length);
  const total=engine.level.waves.flatMap(wave=>wave.enemies).reduce((sum,group)=>sum+group.count,0);
  assert.equal(engine.state.kills,total,`The strategy kills the original roster, with no injected enemies: ${JSON.stringify(history)}`);
  const killGold=engine.level.waves.flatMap(wave=>wave.enemies).reduce((sum,group)=>sum+group.count*ENEMY_STATS[group.kind].gold,0);
  const supply=engine.level.waves.reduce((sum,_wave,index)=>sum+25+(index+1)*5,0);
  assert.equal(engine.state.stats.goldEarned,killGold+supply+(engine.state.stats.earlyWaveGold??0),'Each original wave awards its supply exactly once.');
  assert.ok(engine.state.stats.skillsUsed>0&&checkpoints>=10);
  assert.ok(engine.state.stats.skillsUsed<=engine.level.waves.length*(levelId==='volcano'?6:3),'Tactical decisions are limited to three forest/six volcano casts per wave, checked every two seconds.');
  assert.ok(engine.state.time<600,`The challenge should stay under ten simulated minutes: ${engine.state.time}`);
  return engine;
}

test('veteran forest is winnable without permanent training using earned gold and ordinary tactical actions',()=>{
  const engine=campaign('forest','veteran'); assert.deepEqual(engine.upgrades,deriveBattleUpgrades());
  assert.ok(engine.state.lives>=10);
});

test('heroic forest remains winnable with a legal twelve-star training loadout and independent skills',()=>{
  const engine=campaign('forest','heroic',true); assert.deepEqual(engine.upgrades,trained); assert.ok(engine.state.lives>=10);
});

test('heroic volcano boss can be defeated using mixed defenses, targeting and twelve-star training',()=>{
  const engine=campaign('volcano','heroic',true); assert.ok(engine.state.kills>=380); assert.ok(engine.state.lives>=10);
});

test('calling safe early waves is a viable faster forest strategy and preserves the original roster',()=>{
  const engine=campaign('forest','normal',false,true);
  assert.ok((engine.state.stats.earlyWavesCalled??0)>=1); assert.ok((engine.state.stats.earlyWaveGold??0)>0);
  const regular=campaign('forest','normal');
  assert.ok(engine.state.time<regular.state.time,`${engine.state.time} should be faster than ${regular.state.time}`);
});
