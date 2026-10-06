import type { LevelId, Point } from './types';

export interface MapEventDefinition {
  id: 'marsh-floodgate'; levelId: 'marsh'; name: string; description: string;
  position: Readonly<Point>; areaCenter: Readonly<Point>;
  triggerRadius: number; radius: number; slowAmount: number; duration: number; cooldown: number;
}

export const MARSH_FLOODGATE: Readonly<MapEventDefinition> = Object.freeze({
  id: 'marsh-floodgate', levelId: 'marsh', name: '沼泽水闸',
  description: '艾琳靠近水闸后可开闸，在关口制造 6 秒洪流，使敌人减速 55%。',
  position: Object.freeze({ x: 655, y: 245 }), areaCenter: Object.freeze({ x: 620, y: 285 }),
  triggerRadius: 100, radius: 130, slowAmount: .55, duration: 6, cooldown: 35,
});
export const MAP_EVENTS = Object.freeze({ 'marsh-floodgate': MARSH_FLOODGATE });
export function getMapEventDefinition(levelId: LevelId, rulesVersion: 1 | 2): Readonly<MapEventDefinition> | null {
  return levelId === 'marsh' && rulesVersion === 2 ? MARSH_FLOODGATE : null;
}
