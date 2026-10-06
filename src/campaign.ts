import type { LevelDefinition, LevelId, Point, Wave } from './types';

export function pathLength(path: Point[]): number {
  return path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
}

export function sampleLevelPath(level: Pick<LevelDefinition, 'path' | 'pathLength'>, progress: number): Point {
  let remaining = Math.max(0, Math.min(level.pathLength, progress));
  for (let index = 1; index < level.path.length; index++) {
    const start = level.path[index - 1], end = level.path[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining <= length) {
      const ratio = remaining / length;
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    remaining -= length;
  }
  return { ...level.path.at(-1)! };
}

export function nearestLevelPathPoint(level: Pick<LevelDefinition, 'path'>, point: Point): Point & { progress: number } {
  let walked = 0, bestDistance = Infinity;
  let best = { ...level.path[0], progress: 0 };
  for (let index = 1; index < level.path.length; index++) {
    const start = level.path[index - 1], end = level.path[index];
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length)));
    const x = start.x + dx * ratio, y = start.y + dy * ratio;
    const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = { x, y, progress: walked + length * ratio }; }
    walked += length;
  }
  return best;
}

const wave = (name: string, description: string, enemies: Wave['enemies']): Wave => ({ name, description, enemies });
function level(id: LevelId, name: string, subtitle: string, path: Point[], slotPoints: [number, number][], waves: Wave[], startGold: number, heroSpawn: Point): LevelDefinition {
  return { id, name, subtitle, theme: id, path, pathLength: pathLength(path), slots: slotPoints.map(([x, y], index) => ({ id: index, x, y })), waves, startGold, lives: 20, heroSpawn };
}

/** The forest definition is supplied by data.ts so its original public constants remain unchanged. */
export function createCampaign(forest: LevelDefinition): LevelDefinition[] {
  return [forest,
    level('marsh', '毒沼渡口', '迷雾河滩 · 泥群再生与毒牙突袭', [
      { x: -45, y: 215 }, { x: 340, y: 215 }, { x: 340, y: 410 }, { x: 620, y: 410 },
      { x: 620, y: 185 }, { x: 855, y: 185 }, { x: 855, y: 515 }, { x: 1250, y: 515 },
    ], [[145,135],[265,305],[425,310],[470,505],[550,290],[700,100],[760,290],[780,460],[940,415],[1100,610]], [
      wave('迷雾来客', '泥群会在移动时再生，试试范围炮击。', [{ kind:'bogling', count:14, interval:1.2 }]),
      wave('毒牙河岸', '毒蛇攻击会使友军持续中毒。', [{ kind:'bogling',count:12,interval:1 },{ kind:'serpent',count:7,interval:1.6,delay:6 }]),
      wave('沼泽铁骑', '铁甲与毒蛇混合进军。', [{ kind:'orc',count:9,interval:1.6 },{ kind:'serpent',count:9,interval:1.2,delay:3 }]),
      wave('深潭仪式', '萨满保护再生泥群，用箭雨和炮击突破。', [{ kind:'bogling',count:22,interval:0.65 },{ kind:'shaman',count:5,interval:2.8,delay:5 },{ kind:'golem',count:4,interval:3.2,delay:9 }]),
      wave('毒潮奔涌', '高速毒蛇掩护沉重巨人。', [{ kind:'serpent',count:18,interval:0.8 },{ kind:'golem',count:6,interval:2.6,delay:3 },{ kind:'shaman',count:4,interval:3.1,delay:9 }]),
      wave('沼心集群', '泥潮与重甲同时压进，守住渡口。', [{ kind:'bogling',count:25,interval:0.6 },{ kind:'serpent',count:14,interval:0.85,delay:5 },{ kind:'golem',count:8,interval:2.9,delay:10 },{ kind:'shaman',count:5,interval:3,delay:12 }]),
    ], 420, { x: 680, y: 410 }),
    level('frost', '霜峰古道', '雪山峡谷 · 霜狼抗缓与冰甲防线', [
      { x: -45, y: 540 }, { x: 250, y: 540 }, { x: 345, y: 405 }, { x: 195, y: 280 },
      { x: 425, y: 135 }, { x: 615, y: 135 }, { x: 665, y: 335 }, { x: 865, y: 335 },
      { x: 960, y: 180 }, { x: 1120, y: 280 }, { x: 1250, y: 280 },
    ], [[145,445],[305,620],[420,410],[265,190],[490,225],[595,425],[720,230],[835,430],[1030,100],[1110,390]], [
      wave('雪线斥候', '霜狼会削弱减速，驻兵阻挡更可靠。', [{ kind:'goblin',count:14,interval:1.1 },{ kind:'icewolf',count:4,interval:2,delay:8 }]),
      wave('霜铠先遣', '55% 物理护甲，发展魔法与穿甲炮塔。', [{ kind:'frostguard',count:5,interval:2.4 },{ kind:'icewolf',count:6,interval:1.5,delay:8 }]),
      wave('冰谷群袭', '狼群快速穿越峡谷，及时调整集结点。', [{ kind:'icewolf',count:18,interval:0.8 },{ kind:'wolf',count:12,interval:0.75,delay:7 }]),
      wave('雪山祭司', '冰甲兵与萨满组成持久防线。', [{ kind:'frostguard',count:11,interval:1.9 },{ kind:'shaman',count:6,interval:2.8,delay:4 },{ kind:'icewolf',count:10,interval:1,delay:10 }]),
      wave('雪崩前夜', '巨人撕开峡谷，持续魔法集中火力。', [{ kind:'golem',count:9,interval:2.8 },{ kind:'frostguard',count:12,interval:1.5,delay:4 },{ kind:'icewolf',count:13,interval:0.8,delay:13 }]),
      wave('寒潮压境', '高速与厚甲同时逼近，用荆棘定身霜狼。', [{ kind:'icewolf',count:23,interval:0.7 },{ kind:'frostguard',count:16,interval:1.3,delay:5 },{ kind:'shaman',count:6,interval:2.5,delay:11 }]),
      wave('冰封军阵', '霜峰守军全线出击，坚持到最后。', [{ kind:'frostguard',count:20,interval:1.3 },{ kind:'golem',count:10,interval:2.6,delay:5 },{ kind:'icewolf',count:20,interval:0.7,delay:11 },{ kind:'shaman',count:6,interval:2.8,delay:15 }]),
    ], 470, { x: 720, y: 335 }),
    level('volcano', '熔火王座', '黑曜石要塞 · 爆裂小鬼与熔铠领主', [
      { x: -45, y: 275 }, { x: 270, y: 275 }, { x: 270, y: 150 }, { x: 565, y: 150 },
      { x: 685, y: 275 }, { x: 520, y: 400 }, { x: 730, y: 545 }, { x: 935, y: 545 },
      { x: 1000, y: 370 }, { x: 835, y: 270 }, { x: 1010, y: 140 }, { x: 1250, y: 140 },
    ], [[130,180],[350,250],[450,70],[600,375],[415,445],[670,610],[790,450],[1015,535],[935,245],[1110,70]], [
      wave('火山斥候', '小鬼阵亡会自爆，远程火力更安全。', [{ kind:'imp',count:18,interval:1.05 }]),
      wave('熔渣洪流', '快速小鬼和泥怪成群来袭。', [{ kind:'imp',count:22,interval:0.7 },{ kind:'bogling',count:16,interval:0.75,delay:6 }]),
      wave('黑曜石卫队', '厚甲步兵护送爆裂小鬼。', [{ kind:'frostguard',count:12,interval:1.6 },{ kind:'imp',count:22,interval:0.65,delay:4 },{ kind:'shaman',count:4,interval:3,delay:8 }]),
      wave('火脉巨人', '巨人和魔抗小鬼需要混合伤害。', [{ kind:'golem',count:9,interval:2.5 },{ kind:'imp',count:24,interval:0.65,delay:4 },{ kind:'serpent',count:12,interval:0.9,delay:10 }]),
      wave('烈焰突袭', '霜狼从支援队伍冲锋而来。', [{ kind:'icewolf',count:22,interval:0.7 },{ kind:'imp',count:25,interval:0.6,delay:4 },{ kind:'frostguard',count:13,interval:1.5,delay:10 }]),
      wave('王座近卫', '重甲和萨满保护领主的王座。', [{ kind:'frostguard',count:21,interval:1.3 },{ kind:'golem',count:12,interval:2.4,delay:6 },{ kind:'shaman',count:7,interval:2.6,delay:10 }]),
      wave('熔火大军', '所有军团集结，升级满级塔专精。', [{ kind:'imp',count:28,interval:0.55 },{ kind:'serpent',count:20,interval:0.7,delay:4 },{ kind:'frostguard',count:18,interval:1.1,delay:10 },{ kind:'golem',count:10,interval:2.3,delay:15 }]),
      wave('熔铠领主', '领主锤击有范围伤害，分散驻兵并用穿甲压制。', [{ kind:'frostguard',count:18,interval:1.2 },{ kind:'imp',count:30,interval:0.6,delay:7 },{ kind:'shaman',count:7,interval:2.6,delay:11 },{ kind:'juggernaut',count:1,interval:1,delay:19 },{ kind:'golem',count:9,interval:2.5,delay:22 }]),
    ], 520, { x: 765, y: 545 }),
  ];
}
