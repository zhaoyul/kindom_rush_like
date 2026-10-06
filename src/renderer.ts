import type { Ally, GameState, LevelDefinition, Point, RenderOptions, Tower } from './types';
import { drawTower, getTowerMuzzle } from './tower-art';
import { drawAlly, drawEnemy, drawEffect } from './combat-art';
import { MAP_WIDTH, MAP_HEIGHT, LEVELS, SKILLS } from './data';
import { sampleLevelPath, nearestLevelPathPoint } from './campaign';
import { getTowerCombatStats } from './tower-branches';
import { MARSH_FLOODGATE } from './map-events';
import { drawFloodgate, drawFloodgateFlow } from './map-event-art';
import { drawMarshCrossing, drawMarshWaterway, isMarshHydrologyReserved } from './marsh-terrain';

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;

function seeded(seed: number): () => number {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, width = 1.5) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function poly(c: Ctx, points: number[][], fill: string, stroke?: string, width = 1.5) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c: Ctx, points: number[][], color: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function round(c: Ctx, x: number, y: number, w: number, h: number, r: number | number[], fill: string, stroke?: string, width = 1.5) {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function shadow(c: Ctx, x: number, y: number, r: number, alpha = 0.23) {
  ellipse(c, x + 5, y + 4, r, r * 0.31, `rgba(24,34,23,${alpha})`);
}
function rock(c: Ctx, x: number, y: number, s: number, variant = 0) {
  shadow(c, x, y, s * 0.8, 0.13);
  poly(c, [[x - s, y], [x - s * .75, y - s * .7], [x - s * .1, y - s], [x + s * .72, y - s * .65], [x + s, y - s * .08], [x + s * .25, y + s * .19]], variant ? '#777d69' : '#8e937b', '#535e4e', 1);
  poly(c, [[x - s * .75, y - s * .7], [x - s * .1, y - s], [x + s * .72, y - s * .65], [x + s * .1, y - s * .34]], '#aab098');
  line(c, [[x + s * .1, y - s * .34], [x + s * .25, y + s * .19]], '#656e5b', 1);
  ellipse(c, x - s * .46, y - s * .29, s * .25, s * .12, '#637b48');
}

function pine(c: Ctx, x: number, y: number, s: number, shade = 0) {
  shadow(c, x + 6, y, s * .47, .22);
  poly(c, [[x - 4, y], [x - 4, y - 28], [x + 5, y - 30], [x + 6, y]], '#625c3b', '#35462d', 1.3);
  line(c, [[x + 1, y - 1], [x + 1, y - 25]], '#8c8154', 1);
  const color = shade ? '#345942' : '#3e6246';
  for (let layer = 0; layer < 3; layer++) {
    const sy = y - s * (.22 + layer * .22); const w = s * (.48 - layer * .1);
    poly(c, [[x, sy - s * .53], [x + w * .56, sy - s * .16], [x + w * .47, sy - s * .19], [x + w, sy], [x + w * .7, sy + 3], [x + w * .78, sy + 8], [x + w * .14, sy + 15], [x - w * .25, sy + 13], [x - w * .75, sy + 8], [x - w * .65, sy + 3], [x - w, sy], [x - w * .45, sy - s * .2], [x - w * .56, sy - s * .17]], color, '#294731', 1.6);
    poly(c, [[x, sy - s * .49], [x - w * .45, sy - s * .18], [x - w * .3, sy - s * .18], [x - w * .76, sy + 1], [x - w * .23, sy + 4], [x, sy + 1]], shade ? '#52734c' : '#5c7c51');
    line(c, [[x + w * .17, sy - s * .16], [x + w * .48, sy - s * .03]], '#456b47', 2);
  }
}

function bush(c: Ctx, x: number, y: number, s: number) {
  shadow(c, x, y, s, .12);
  ellipse(c, x - s * .5, y - s * .3, s * .65, s * .48, '#506c41', '#3f5733', 1);
  ellipse(c, x + s * .4, y - s * .4, s * .75, s * .56, '#526f42', '#3f5733', 1);
  ellipse(c, x, y - s * .66, s * .67, s * .6, '#66824a');
  ellipse(c, x - s * .2, y - s * .89, s * .27, s * .13, '#809555');
}

function roadPath(c: Ctx, path: Point[]) {
  c.beginPath(); path.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
}

function pond(c: Ctx) {
  c.save(); c.translate(863, 140);
  c.beginPath(); c.moveTo(-126, -25); c.bezierCurveTo(-105, -77, -26, -78, 25, -69);
  c.bezierCurveTo(75, -75, 145, -36, 157, 3); c.bezierCurveTo(168, 41, 98, 69, 28, 71);
  c.bezierCurveTo(-15, 95, -125, 49, -126, -25); c.closePath();
  c.fillStyle = '#405b43'; c.lineWidth = 16; c.strokeStyle = '#617f4d'; c.stroke(); c.fill();
  c.lineWidth = 7; c.strokeStyle = '#9caa66'; c.stroke();
  const water = c.createLinearGradient(0, -70, 0, 80); water.addColorStop(0, '#356a68'); water.addColorStop(.5, '#468984'); water.addColorStop(1, '#5b9990'); c.fillStyle = water; c.fill();
  c.save(); c.clip();
  const rand = seeded(450); for (let i = 0; i < 55; i++) { const x = rand() * 290 - 130, y = rand() * 142 - 68; line(c, [[x, y], [x + 8 + rand() * 29, y]], 'rgba(183,215,173,.22)', 1.5); }
  ellipse(c, 13, 30, 67, 9, 'rgba(124,180,156,.18)');
  c.restore();
  for (const [x, y, s] of [[-115, 5, 17], [-84, -64, 13], [40, -72, 16], [139, 23, 19], [108, 53, 12], [-31, 76, 17]]) rock(c, x, y, s);
  for (const [x, y] of [[-94, 43], [-66, 62], [84, -57], [130, -13]]) {
    line(c, [[x - 8, y + 8], [x - 12, y - 14]], '#788444', 2); line(c, [[x, y + 8], [x - 1, y - 22]], '#748044', 2); line(c, [[x + 4, y + 7], [x + 12, y - 12]], '#84954c', 2);
    round(c, x - 3, y - 29, 4, 13, 2, '#806847'); round(c, x - 13, y - 21, 3, 10, 2, '#947849');
  }
  for (const [x, y] of [[-54, -24], [-32, -17], [77, 25]]) {
    ellipse(c, x, y, 9, 3.5, '#86a968', '#486c4e', .7); poly(c, [[x, y], [x + 9, y - 3], [x + 9, y + 2]], '#4a8580');
  }
  ellipse(c, -54, -25, 2.5, 1.8, '#e4ce90');
  c.restore();
}

function ruins(c: Ctx, x: number, y: number) {
  c.save(); c.translate(x, y); shadow(c, 7, 6, 48, .18);
  poly(c, [[-30, 8], [-34, -24], [-18, -30], [-17, -52], [-2, -54], [0, -34], [15, -40], [15, -17], [31, -21], [34, 4]], '#92927a', '#5c6652', 1.5);
  poly(c, [[-34, -24], [-18, -30], [-17, -52], [-2, -54], [-7, -45], [-8, -18], [-27, -14]], '#b1ac8b');
  line(c, [[-31, -3], [26, -8]], '#69745c'); line(c, [[-29, -16], [15, -22]], '#69745c'); line(c, [[-10, -25], [-9, -5]], '#69745c');
  rock(c, 44, 6, 12); rock(c, -44, 13, 10); rock(c, 21, 19, 7);
  bush(c, -28, 13, 13); bush(c, 24, 10, 12);
  line(c, [[0, -35], [-4, -23], [3, -18], [-3, -3]], '#547049', 3); ellipse(c, 1, -23, 4, 2, '#658c47');
  c.restore();
}

function gate(c: Ctx, exit: Point = { x: 1138, y: 528 }) {
  c.save(); c.translate(exit.x, exit.y);
  c.scale(1, Math.min(1, Math.max(.65, (exit.y - 8) / 165)));
  shadow(c, 23, -3, 73, .2);
  // The royal outpost borders the road; the bright arch remains visibly open.
  poly(c, [[6, -73], [41, -88], [75, -73], [75, 43], [42, 53], [6, 36]], '#777e70', '#49594c', 2);
  poly(c, [[6, -73], [41, -88], [41, 53], [6, 36]], '#9e9f87', '#54614e', 1.5);
  c.beginPath(); c.moveTo(8, 23); c.lineTo(8, -25); c.bezierCurveTo(8, -49, 36, -61, 39, -30); c.lineTo(39, 39); c.closePath(); c.fillStyle = '#344e40'; c.fill();
  poly(c, [[12, 23], [12, -24], [17, -36], [29, -38], [34, -28], [34, 34]], '#c5ad73');
  poly(c, [[20, 27], [20, -27], [26, -31], [34, -28], [34, 34]], '#9c986a');
  for (let y = -57; y < 40; y += 17) { line(c, [[7, y], [14, y + 3]], '#78836b', 1); line(c, [[44, y + 1], [73, y - 8]], '#536454', 1); }
  for (const [x, y] of [[-9, -45], [56, 44]]) {
    ellipse(c, x + 5, y + 12, 26, 8, '#455649');
    poly(c, [[x - 18, y + 8], [x - 20, y - 52], [x + 17, y - 56], [x + 23, y + 7], [x + 3, y + 16]], '#969d86', '#4d5f4b', 1.5);
    poly(c, [[x + 3, y - 54], [x + 17, y - 56], [x + 23, y + 7], [x + 3, y + 16]], '#687b68');
    ellipse(c, x, y - 52, 21, 8, '#b8b495', '#51634d', 1.5);
    for (let i = -1; i <= 1; i++) round(c, x - 19 + (i + 1) * 13, y - 65, 10, 16, 1, '#a2a68b', '#52654e', 1);
    round(c, x - 3, y - 39, 7, 18, 3, '#3f5e4b');
    line(c, [[x - 14, y - 20], [x + 17, y - 24]], '#72856d'); line(c, [[x - 16, y - 4], [x + 18, y - 8]], '#72856d');
    ellipse(c, x - 11, y + 9, 10, 4, '#60794d');
  }
  line(c, [[-9, -110], [-9, -161]], '#5f5b3e', 3);
  poly(c, [[-7, -160], [30, -152], [22, -141], [-7, -146]], '#466f76', '#294e57');
  poly(c, [[6, -155], [13, -150], [6, -147], [0, -151]], '#d9bc68');
  c.restore();
}

function forestTerrain(c: Ctx, level: LevelDefinition) {
  const PATH = level.path, SLOTS = level.slots;
  const samplePath = (progress: number) => sampleLevelPath(level, progress);
  const nearestPathPoint = (point: Point) => nearestLevelPathPoint(level, point);
  const rand = seeded(821736);
  c.fillStyle = '#7d8c56'; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const light = c.createRadialGradient(535, 290, 30, 620, 310, 740); light.addColorStop(0, '#99a36b'); light.addColorStop(.56, '#83915a'); light.addColorStop(1, '#596c47'); c.fillStyle = light; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  for (let i = 0; i < 260; i++) ellipse(c, rand() * MAP_WIDTH, rand() * MAP_HEIGHT, 15 + rand() * 75, 6 + rand() * 28, i % 2 ? 'rgba(177,183,108,.055)' : 'rgba(50,80,42,.055)');
  // Soft grass tufts establish a hand-painted surface without competing with units.
  for (let i = 0; i < 1450; i++) {
    const x = rand() * MAP_WIDTH, y = rand() * MAP_HEIGHT, h = 2 + rand() * 4;
    line(c, [[x - 2, y], [x - 4, y - h], [x, y], [x + 1, y - h - 1]], i % 3 ? 'rgba(53,78,39,.17)' : 'rgba(217,214,136,.23)', 1);
  }
  pond(c);
  // Subtle beaten footpaths link every build site to the main lane.
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of SLOTS) { const p = nearestPathPoint(s); line(c, [[s.x, s.y], [p.x, p.y]], '#969260', 10); line(c, [[s.x, s.y], [p.x, p.y]], '#a39b6b', 6); }
  roadPath(c, PATH); c.strokeStyle = '#627048'; c.lineWidth = 79; c.stroke();
  roadPath(c, PATH); c.strokeStyle = '#9f9765'; c.lineWidth = 69; c.stroke();
  roadPath(c, PATH); c.strokeStyle = '#c8b37c'; c.lineWidth = 61; c.stroke();
  roadPath(c, PATH); c.strokeStyle = 'rgba(222,200,137,.52)'; c.lineWidth = 42; c.stroke();
  const pathTotal = PATH.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - PATH[i].x, p.y - PATH[i].y), 0);
  for (let i = 0; i < 580; i++) {
    const progress = rand() * pathTotal, p = samplePath(progress), p2 = samplePath(Math.min(pathTotal, progress + 2));
    const angle = Math.atan2(p2.y - p.y, p2.x - p.x), offset = (rand() - .5) * 55;
    const x = p.x - Math.sin(angle) * offset, y = p.y + Math.cos(angle) * offset;
    ellipse(c, x, y, .7 + rand() * 2.2, .4 + rand() * 1.1, i % 5 === 0 ? '#a09361' : i % 3 ? 'rgba(130,107,66,.22)' : 'rgba(236,216,155,.6)');
  }
  // Broken grass and scattered stones soften both sides of the trail.
  for (let i = 0; i < 95; i++) {
    const progress = rand() * pathTotal, p = samplePath(progress), p2 = samplePath(Math.min(pathTotal, progress + 2));
    const a = Math.atan2(p2.y - p.y, p2.x - p.x), off = (i % 2 ? 1 : -1) * (35 + rand() * 5);
    const x = p.x - Math.sin(a) * off, y = p.y + Math.cos(a) * off;
    if (i % 4 === 0) rock(c, x, y, 2 + rand() * 3);
    else line(c, [[x - 5, y], [x - 7, y - 6], [x - 1, y - 1], [x + 1, y - 8], [x + 3, y]], '#647d45', 1.6);
  }
  ruins(c, 181, 600); ruins(c, 639, 72);
  // Small environmental stories: an abandoned cart, mushrooms, a forest camp.
  c.save(); c.translate(558, 642); shadow(c, 0, 0, 30, .15);
  poly(c, [[-23, -15], [12, -23], [23, -7], [-13, 4]], '#7e7046', '#4f5636', 2);
  line(c, [[-15, -9], [14, -17]], '#b09862', 3); line(c, [[-8, -2], [19, -10]], '#b09862', 3);
  ellipse(c, -17, 2, 9, 11, '#544f33', '#373f28'); ellipse(c, -17, 2, 5, 7, '#9b8856'); line(c, [[22, -3], [39, 6]], '#796b43', 3); c.restore();
  for (const [x, y, s] of [[70, 410, 17], [714, 266, 20], [590, 366, 13], [1009, 655, 26], [485, 653, 11], [56, 330, 11], [960, 284, 19], [237, 89, 14], [933, 667, 10], [731, 622, 13]]) rock(c, x, y, s);
  const trees: { x: number; y: number; s: number; shade: number }[] = [];
  for (let i = 0; i < 98; i++) {
    let x = rand() * MAP_WIDTH, y = rand() * MAP_HEIGHT;
    if (i < 32) y = 40 + rand() * 68;
    else if (i < 57) { x = rand() < .5 ? rand() * 90 : 1080 + rand() * 120; }
    else if (i < 78) y = 645 + rand() * 86;
    const p = nearestPathPoint({ x, y });
    if (Math.hypot(x - p.x, y - p.y) < 86 || SLOTS.some(s => Math.hypot(x - s.x, y - s.y) < 72) || (x > 700 && x < 1050 && y < 255) || (x > 1080 && y > 390 && y < 640)) continue;
    trees.push({ x, y, s: 58 + rand() * 38, shade: i % 3 === 0 ? 1 : 0 });
  }
  trees.sort((a, b) => a.y - b.y).forEach(t => pine(c, t.x, t.y, t.s, t.shade));
  for (const [x, y, s] of [[80, 560, 18], [703, 329, 21], [933, 580, 17], [472, 58, 15], [222, 680, 19], [1034, 309, 20], [582, 105, 11], [674, 693, 14]]) bush(c, x, y, s);
  for (let i = 0; i < 65; i++) {
    const x = rand() * 1120 + 30, y = rand() * 670 + 25, p = nearestPathPoint({ x, y });
    if (Math.hypot(x - p.x, y - p.y) < 47 || (x > 720 && x < 1040 && y < 240)) continue;
    if (i % 5 === 0) {
      line(c, [[x, y], [x, y - 5]], '#d1c191', 2); ellipse(c, x, y - 6, 5, 3, '#ac5e43', '#6f5536', .6); ellipse(c, x - 1, y - 7, 1, .7, '#ead8a8');
    } else {
      for (let k = 0; k < 3; k++) { const fx = x + k * 5, fy = y + (k % 2) * 4; line(c, [[fx, fy], [fx - 1, fy - 5]], '#667844'); ellipse(c, fx - 1, fy - 5, 2, 1.7, i % 2 ? '#ded495' : '#bbaf78'); }
    }
  }
  // Directional sign at the invasion point.
  line(c, [[36, 188], [36, 148]], '#766441', 4);
  poly(c, [[20, 150], [70, 150], [78, 159], [68, 168], [20, 168]], '#b5a06a', '#5b6040', 1.4);
  c.fillStyle = '#494f33'; c.font = 'bold 10px "Noto Sans SC", sans-serif'; c.fillText('迷雾森林', 26, 162);
  line(c, [[44, 241], [63, 241], [59, 237], [63, 241], [59, 245]], '#9f885b', 2.4);
  gate(c);
  // A gentle vignette gives the board the edges of an illustrated map.
  const vignette = c.createRadialGradient(600, 350, 350, 600, 350, 710); vignette.addColorStop(0, 'rgba(25,40,28,0)'); vignette.addColorStop(1, 'rgba(25,40,28,.2)'); c.fillStyle = vignette; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  c.fillStyle = 'rgba(245,230,179,.58)'; c.font = '600 11px "Noto Sans SC", sans-serif'; c.textAlign = 'center'; c.fillText('王 国 哨 站', 1115, 643); c.textAlign = 'left';
}

function biomeTerrain(c: Ctx, level: LevelDefinition) {
  const frost = level.theme === 'frost', marsh = level.theme === 'marsh';
  const rand = seeded(frost ? 382107 : marsh ? 732311 : 196350);
  const colors = frost ? { center: '#cbdadd', edge: '#7d9ba7', roadEdge: '#687f88', road: '#b2aa90', roadLight: '#dad4bc', detail: '#698a99' }
    : marsh ? { center: '#7a8a63', edge: '#455f55', roadEdge: '#3e5750', road: '#9a9470', roadLight: '#c1ad7e', detail: '#4d7150' }
      : { center: '#8b806f', edge: '#4b5554', roadEdge: '#424e4b', road: '#9d917a', roadLight: '#c4ae8b', detail: '#655e50' };
  const ground = c.createRadialGradient(600, 330, 30, 600, 330, 740);
  ground.addColorStop(0, colors.center); ground.addColorStop(1, colors.edge); c.fillStyle = ground; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const clear = (p: Point, margin: number) => {
    if (marsh && isMarshHydrologyReserved(p, margin * .25)) return false;
    const q = nearestLevelPathPoint(level, p);
    return Math.hypot(p.x - q.x, p.y - q.y) > margin && !level.slots.some(s => Math.hypot(s.x - p.x, s.y - p.y) < margin);
  };
  for (let i = 0; i < 330; i++) {
    const x = rand() * MAP_WIDTH, y = rand() * MAP_HEIGHT;
    ellipse(c, x, y, 18 + rand() * 70, 6 + rand() * 22, i % 2 ? frost ? 'rgba(239,245,236,.15)' : 'rgba(222,210,161,.045)' : 'rgba(26,47,38,.06)');
  }
  // Natural landmarks occupy the spaces between this level's roads and construction pads.
  for (let i = 0; i < 19; i++) {
    const x = 60 + rand() * 1050, y = 55 + rand() * 600;
    if (!clear({ x, y }, 120)) continue;
    const w = 35 + rand() * 55, h = 13 + rand() * 26;
    if (marsh) {
      ellipse(c, x, y, w + 7, h + 6, '#5d7454', '#96a078', 2);
      const water = c.createLinearGradient(x, y - h, x, y + h); water.addColorStop(0, '#395b5b'); water.addColorStop(1, '#6b9380');
      c.beginPath(); c.ellipse(x, y, w, h, -.12, 0, TAU); c.fillStyle = water; c.fill();
      for (let k = 0; k < 4; k++) line(c, [[x - w * .6 + k * 12, y + k * 3 - 7], [x - w * .35 + k * 12, y + k * 3 - 7]], 'rgba(172,205,152,.28)', 1);
      for (let k = 0; k < 3; k++) { const px = x - w * .7 + k * w * .5; ellipse(c, px, y + 5, 6, 2.2, '#9aaf66'); poly(c, [[px, y + 5], [px + 6, y + 2], [px + 6, y + 7]], '#537c6c'); }
    } else if (frost) {
      // Blue ice and snowy rock outcrops carry the same painterly outlines as the forest.
      poly(c, [[x - w, y + 3], [x - w * .4, y - h * 3], [x, y - h * 4], [x + w * .3, y - h * 2], [x + w, y], [x, y + h]], '#88a3b0', '#607d90', 1.7);
      poly(c, [[x - w * .4, y - h * 3], [x, y - h * 4], [x + w * .3, y - h * 2], [x + w * .08, y - h * 2.3], [x - w * .08, y - h * 2], [x - w * .2, y - h * 2.6]], '#e5eeea', '#bbcfd3', 1);
      line(c, [[x, y - h * 3.8], [x - w * .17, y - h], [x, y + h * .5]], '#d1e2e2', 1.1);
    } else {
      ellipse(c, x, y, w + 4, h + 5, '#46514c', '#667264', 2);
      const lava = c.createLinearGradient(x, y - h, x, y + h); lava.addColorStop(0, '#bd704f'); lava.addColorStop(.5, '#e5a65b'); lava.addColorStop(1, '#9d6550');
      c.beginPath(); c.ellipse(x, y, w, h, -.1, 0, TAU); c.fillStyle = lava; c.fill();
      for (let k = 0; k < 4; k++) line(c, [[x - w * .7 + k * w * .35, y - 4 + k % 2 * 7], [x - w * .4 + k * w * .35, y - 4 + k % 2 * 7]], '#f8d189', 1.5);
      poly(c, [[x - 12, y + 6], [x - 6, y - 1], [x + 15, y], [x + 22, y + 7], [x + 2, y + 10]], '#5a6256', '#879070', 1);
    }
  }
  if (marsh) drawMarshWaterway(c);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of level.slots) {
    const q = nearestLevelPathPoint(level, s);
    line(c, [[s.x, s.y], [q.x, q.y]], colors.roadEdge, 11);
    line(c, [[s.x, s.y], [q.x, q.y]], colors.road, 7);
  }
  for (const [width, color] of [[79, colors.roadEdge], [69, colors.road], [60, colors.roadLight], [39, frost ? '#e0dcc8' : marsh ? '#ceb78a' : '#d0b996']] as [number, string][]) {
    roadPath(c, level.path); c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  for (let i = 0; i < 570; i++) {
    const progress = rand() * level.pathLength, p = sampleLevelPath(level, progress), next = sampleLevelPath(level, Math.min(level.pathLength, progress + 2));
    const angle = Math.atan2(next.y - p.y, next.x - p.x), off = (rand() - .5) * 54;
    ellipse(c, p.x - Math.sin(angle) * off, p.y + Math.cos(angle) * off, .8 + rand() * 2.4, .6 + rand(), i % 4 ? 'rgba(102,93,68,.16)' : 'rgba(242,231,191,.35)');
  }
  if (marsh) {
    // Small boardwalk seams hint at a raised trail over the marsh.
    for (let progress = 95; progress < level.pathLength - 75; progress += 54) {
      const p = sampleLevelPath(level, progress), next = sampleLevelPath(level, progress + 2), a = Math.atan2(next.y - p.y, next.x - p.x);
      c.save(); c.translate(p.x, p.y); c.rotate(a); line(c, [[0, -25], [0, 25]], 'rgba(107,88,55,.28)', 1.4); line(c, [[2, -25], [2, 25]], 'rgba(235,213,157,.28)', .8); c.restore();
    }
    drawMarshCrossing(c);
  }
  const decorations: { x: number; y: number; s: number; index: number }[] = [];
  for (let i = 0; i < 160; i++) {
    let x = rand() * MAP_WIDTH, y = rand() * MAP_HEIGHT;
    if (i < 35) y = 10 + rand() * 100;
    else if (i < 65) y = 660 + rand() * 65;
    if (!clear({ x, y }, 83) || x > 1080 && Math.abs(y - level.path[level.path.length - 1].y) < 125) continue;
    decorations.push({ x, y, s: 15 + rand() * 42, index: i });
  }
  decorations.sort((a, b) => a.y - b.y).forEach(({ x, y, s, index }) => {
    if (frost && index % 3 === 0) {
      pine(c, x, y, s + 35, index % 2);
      for (let k = 0; k < 3; k++) { const sy = y - (s + 35) * (.22 + k * .22), w = (s + 35) * (.37 - k * .075); poly(c, [[x, sy - (s + 35) * .5], [x - w * .8, sy - 2], [x - w * .45, sy + 1], [x, sy - 3], [x + w * .66, sy + 2], [x + w, sy - 1]], '#dce7df', '#a9c4cd', .7); }
    } else if (frost) {
      rock(c, x, y, s * .45, 1); ellipse(c, x - 2, y - s * .35, s * .37, s * .12, '#e8efdf', '#b4cace', .7);
      if (index % 4 === 0) poly(c, [[x + 10, y], [x + 12, y - 24], [x + 20, y - 9], [x + 17, y + 2]], '#a4cfda', '#e0ece4', 1);
    } else if (marsh && index % 4 === 0) {
      c.save(); c.translate(x, y); shadow(c, 0, 0, s * .45, .15);
      line(c, [[0, 0], [-3, -s * .8], [-9, -s * 1.2]], '#6f7653', 6);
      line(c, [[-3, -s * .7], [s * .4, -s], [s * .5, -s * 1.3]], '#61704d', 3.8);
      for (let k = 0; k < 3; k++) { const px = -9 + k * 11, py = -s * (1.1 + k % 2 * .3); ellipse(c, px, py, s * .33, s * .18, '#758a5a', '#3e6250', 1); line(c, [[px - 4, py + 3], [px - 5, py + 16]], '#829575', .8); }
      c.restore();
    } else if (marsh) {
      for (let k = 0; k < 5; k++) { const px = x + (k - 2) * 4; line(c, [[px, y], [px + (k % 2 ? 3 : -4), y - 13 - k % 3 * 7]], '#899866', 1.6); }
      if (index % 3 === 0) { line(c, [[x + 5, y], [x + 4, y - 15]], '#bec1a1', 2); ellipse(c, x + 4, y - 16, 7, 3.5, '#a188ac', '#685e83', .8); ellipse(c, x + 2, y - 17, 1.8, 1, '#d0c7bf'); }
    } else {
      c.save(); c.translate(x, y);
      const h = s * (index % 4 === 0 ? 1.2 : .6), w = s * .5;
      poly(c, [[-w, 1], [-w * .7, -h * .8], [0, -h], [w * .65, -h * .7], [w, 0], [0, 5]], '#666e64', '#3d514b', 1.2);
      poly(c, [[-w * .7, -h * .8], [0, -h], [0, 2], [-w, 1]], '#90917a');
      if (index % 3 === 0) { line(c, [[2, -h * .8], [-1, -h * .4], [5, -h * .25], [2, -1]], '#d29a62', 1.2); }
      c.restore();
    }
  });
  // Dedicated entrance signs and exit outposts follow the current route's end points.
  const entry = sampleLevelPath(level, 85), exitY = level.path[level.path.length - 1].y;
  c.save(); c.translate(Math.max(26, entry.x + 30), Math.max(70, entry.y - 72));
  line(c, [[0, 20], [0, -17]], '#716748', 3.5);
  poly(c, [[-12, -20], [87, -20], [94, -11], [84, -3], [-12, -3]], '#b4a47c', '#57694f', 1.3);
  c.fillStyle = '#475644'; c.font = 'bold 10px "Noto Sans SC", sans-serif'; c.fillText(level.name, -5, -8); c.restore();
  gate(c, { x: 1138, y: exitY - 2 });
  const vignette = c.createRadialGradient(600, 350, 350, 600, 350, 720);
  vignette.addColorStop(0, 'rgba(20,34,29,0)'); vignette.addColorStop(1, 'rgba(20,34,29,.22)'); c.fillStyle = vignette; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
}

function terrain(c: Ctx, level: LevelDefinition) {
  if (level.theme === 'forest') forestTerrain(c, level); else biomeTerrain(c, level);
}

function pad(c: Ctx, x: number, y: number, selected: boolean, occupied: boolean, time: number) {
  shadow(c, x, y + 2, 30, .16);
  ellipse(c, x, y + 3, 32, 17, '#807f58', '#546545', 1.5);
  ellipse(c, x, y, 30, 17, occupied ? '#a69f7a' : '#b1ac86', '#c4bd93', 1.5);
  ellipse(c, x, y, 21, 11.5, '#939671', '#767e5c', 1);
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(c, [[x + Math.cos(a) * 23, y + Math.sin(a) * 12], [x + Math.cos(a) * 30, y + Math.sin(a) * 16]], '#767c5c', 1.2); }
  if (!occupied) {
    c.save(); c.globalAlpha = selected ? 1 : .73;
    round(c, x - 2, y - 7, 4, 14, 1.5, selected ? '#fff0b7' : '#d6cc98', '#7d815d', 1);
    round(c, x - 7, y - 2, 14, 4, 1.5, selected ? '#fff0b7' : '#d6cc98');
    c.restore();
    line(c, [[x + 23, y - 6], [x + 23, y - 30]], '#6e6241', 2);
    poly(c, [[x + 24, y - 29], [x + 40, y - 24 + Math.sin(time * 3 + x) * 1.4], [x + 24, y - 17]], '#c0b372', '#706f4b', .8);
  }
  if (selected) {
    c.beginPath(); c.ellipse(x, y + 1, 36, 21, 0, 0, TAU); c.strokeStyle = '#f3df91'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.ellipse(x, y + 1, 39, 23, 0, 0, TAU); c.strokeStyle = 'rgba(243,223,145,.35)'; c.lineWidth = 2; c.stroke();
  }
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private context: Ctx;
  private terrain: HTMLCanvasElement;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dpr = 1;
  private observer: ResizeObserver;
  private level: LevelDefinition;

  constructor(canvas: HTMLCanvasElement, level: LevelDefinition = LEVELS[0]) {
    this.canvas = canvas;
    this.level = level;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('浏览器不支持 Canvas 2D'); this.context = ctx;
    this.terrain = document.createElement('canvas'); this.terrain.width = MAP_WIDTH * 2; this.terrain.height = MAP_HEIGHT * 2;
    this.setLevel(level);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }

  setLevel(level: LevelDefinition) {
    this.level = level;
    const ground = this.terrain.getContext('2d')!;
    ground.setTransform(2, 0, 0, 2, 0, 0); ground.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ground.lineCap = 'round'; ground.lineJoin = 'round'; terrain(ground, level);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.scale = Math.min(w / MAP_WIDTH, h / MAP_HEIGHT); this.offsetX = (w - MAP_WIDTH * this.scale) / 2; this.offsetY = (h - MAP_HEIGHT * this.scale) / 2;
  }

  screenToWorld(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect(); return { x: (clientX - rect.left - this.offsetX) / this.scale, y: (clientY - rect.top - this.offsetY) / this.scale };
  }

  worldToScreen(point: Point): Point {
    return { x: this.offsetX + point.x * this.scale, y: this.offsetY + point.y * this.scale };
  }

  render(state: GameState, options: RenderOptions) {
    const c = this.context; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#364839'; c.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    c.translate(this.offsetX, this.offsetY); c.scale(this.scale, this.scale); c.lineJoin = 'round'; c.lineCap = 'round';
    c.drawImage(this.terrain, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    const selectedTower = state.towers.find(t => t.slotId === options.selectedSlot);
    if (selectedTower) {
      const range = getTowerCombatStats(selectedTower).range;
      const choosingRally = selectedTower.kind === 'barracks' && options.targeting === 'rally';
      c.beginPath(); c.arc(selectedTower.x, selectedTower.y, range, 0, TAU); c.fillStyle = choosingRally ? 'rgba(164,215,129,.12)' : 'rgba(210,223,159,.065)'; c.fill(); c.strokeStyle = choosingRally ? '#caec9d' : 'rgba(235,231,159,.6)'; c.lineWidth = choosingRally ? 2.5 : 1.8; c.setLineDash([5, 6]); c.stroke(); c.setLineDash([]);
      if (selectedTower.kind === 'barracks') {
        this.rallyArea(c, selectedTower, state.time, choosingRally);
      }
    }
    for (const t of state.towers.filter(t => t.kind === 'barracks')) this.rallyFlag(c, { x: t.rallyX, y: t.rallyY }, t === selectedTower, state.time);
    for (const s of this.level.slots) pad(c, s.x, s.y, s.id === options.selectedSlot, state.towers.some(t => t.slotId === s.id), state.time);
    const hero = state.allies.find(ally => ally.type === 'hero');
    const mapEvent = this.level.id === 'marsh' && state.mapEvent?.id === MARSH_FLOODGATE.id ? state.mapEvent : undefined;
    if (mapEvent && options.mapEventHighlighted) {
      c.save(); c.beginPath(); c.arc(MARSH_FLOODGATE.areaCenter.x, MARSH_FLOODGATE.areaCenter.y, MARSH_FLOODGATE.radius, 0, TAU);
      c.setLineDash([5, 7]); c.strokeStyle = 'rgba(144,191,175,.48)'; c.lineWidth = 1.1; c.stroke(); c.restore();
    }
    if (mapEvent && mapEvent.activeRemaining > 0 && state.phase === 'battle') {
      for (const effect of state.effects) if (effect.type === 'ring' && effect.style === 'floodgate') drawFloodgateFlow(c, effect);
    }
    if (options.targeting && options.targeting !== 'rally' && SKILLS[options.targeting].range && hero && hero.hp > 0) {
      const castRange = SKILLS[options.targeting].range!;
      c.save(); c.setLineDash([6, 8]); c.lineDashOffset = -state.time * 8;
      ellipse(c, hero.x, hero.y, castRange, castRange, 'rgba(162,212,169,.025)', 'rgba(211,230,157,.54)', 1.6);
      c.restore();
    }
    if (options.pointer && options.targeting) this.target(c, options.pointer, options.targeting, state.time, selectedTower, hero);
    for (const effect of state.effects) if (effect.type === 'frost-zone' || effect.type === 'roots' || effect.type === 'oath') drawEffect(c, effect);
    // Danger circles stay on the road beneath actors, anchored to the committed hit point.
    for (const effect of state.effects) if (effect.type === 'boss-warning' && state.enemies.some(enemy => enemy.id === effect.sourceId && enemy.hp > 0 && enemy.bossCast && enemy.bossCast.remaining > 0)) drawEffect(c, effect);
    const actors: { y: number; paint: () => void }[] = [
      ...state.towers.map(t => ({ y: t.y, paint: () => drawTower(c, t, state.time) })),
      ...state.enemies.map(e => ({ y: e.y, paint: () => drawEnemy(c, e, state.time, e.id === options.selectedEnemy) })),
      ...state.allies.map(a => ({ y: a.y, paint: () => drawAlly(c, a, state.time, a.id === options.selectedAlly || options.heroSelected && a.type === 'hero') })),
      ...(mapEvent ? [{ y: MARSH_FLOODGATE.position.y, paint: () => drawFloodgate(c, MARSH_FLOODGATE, mapEvent, hero, state.time, state.phase === 'battle') }] : []),
    ]; actors.sort((a, b) => a.y - b.y).forEach(actor => actor.paint());
    for (const e of state.effects) {
      if (e.type === 'frost-zone' || e.type === 'roots' || e.type === 'oath' || e.type === 'boss-warning' || e.type === 'ring' && e.style === 'floodgate') continue;
      const source = e.type === 'arrow' || e.type === 'bolt' || e.type === 'chain' || e.type === 'shell' ? state.towers.find(t => t.id === e.sourceId) : undefined;
      const muzzle = source ? getTowerMuzzle(source) : undefined;
      drawEffect(c, muzzle ? { ...e, ...muzzle, points: e.type === 'chain' && e.points ? [muzzle, ...e.points.slice(1)] : e.points } : e);
    }
    // Each biome has quiet ambient motion that stays behind interface cues.
    c.save(); c.globalAlpha = .4;
    for (let i = 0; i < 12; i++) {
      const t = state.time * (7 + i % 3) + i * 174, x = (t * .9 + 74) % 1240 - 20, y = 25 + ((t * .4 + i * 83) % 680);
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * .013) * 1.2);
      if (this.level.theme === 'frost') { ellipse(c, 0, 0, i % 3 ? 1.4 : 2, i % 3 ? 1.4 : 2, '#f0f3e6'); }
      else if (this.level.theme === 'marsh') { c.globalAlpha *= .7 + Math.sin(state.time * 2 + i) * .3; ellipse(c, 0, 0, 1.7, 1.7, '#e5e3a4'); }
      else if (this.level.theme === 'volcano') { ellipse(c, 0, 0, 2, 1.1, i % 2 ? '#eeb672' : '#bba994'); }
      else ellipse(c, 0, 0, 3.5, 1.3, i % 2 ? '#d4bb74' : '#b7be7c'); c.restore();
    }
    if (this.level.theme === 'forest') { c.globalAlpha = .2; for (let i = 0; i < 3; i++) { const p = (state.time * .13 + i * .33) % 1; ellipse(c, 870, 159, 10 + p * 52, 3 + p * 12, 'transparent', `rgba(219,230,185,${1 - p})`, 1); } }
    c.restore();
    if (options.paused) { c.fillStyle = 'rgba(29,44,34,.24)'; c.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT); }
  }

  private rallyArea(c: Ctx, tower: Tower, time: number, choosing: boolean) {
    c.save();
    c.setLineDash([7, 7]); c.lineDashOffset = -time * 10;
    line(c, [[tower.x, tower.y], [tower.rallyX, tower.rallyY]], 'rgba(222,235,161,.7)', 1.5);
    c.setLineDash([]);
    if (choosing) {
      const range = getTowerCombatStats(tower).range;
      c.beginPath();
      let connected = false;
      for (let progress = 0; progress <= this.level.pathLength; progress += 6) {
        const p = sampleLevelPath(this.level, progress);
        const inside = p.x >= 0 && p.x <= MAP_WIDTH && p.y >= 0 && p.y <= MAP_HEIGHT && Math.hypot(p.x - tower.x, p.y - tower.y) <= range;
        if (inside) { if (connected) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); connected = true; }
        else connected = false;
      }
      c.strokeStyle = 'rgba(197,232,145,.65)'; c.lineWidth = 14; c.shadowColor = '#c3e799'; c.shadowBlur = 6; c.stroke();
    }
    c.restore();
  }

  private rallyFlag(c: Ctx, point: Point, selected: boolean, time: number, preview = false) {
    c.save(); c.translate(point.x, point.y);
    if (preview) c.globalAlpha = .8;
    ellipse(c, 0, 1, selected ? 25 : 13, selected ? 10 : 5, selected ? 'rgba(216,236,151,.15)' : 'rgba(43,71,37,.12)', selected ? '#d7e9aa' : '#a7c07e', selected ? 1.8 : .8);
    if (selected) ellipse(c, 0, 1, 29 + Math.sin(time * 3) * 2, 12, 'transparent', 'rgba(214,238,173,.4)', 1);
    line(c, [[0, 0], [0, -34]], '#eee3b3', 2.6);
    poly(c, [[1, -34], [23, -30 + Math.sin(time * 3) * 2], [18, -20], [1, -23]], '#4e8059', '#d7e8a1', 1.2);
    line(c, [[9, -30], [9, -24]], '#ead38c', 1.6);
    line(c, [[6, -27], [12, -27]], '#ead38c', 1.6);
    if (selected) {
      c.font = 'bold 11px "Noto Sans SC", sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ecf0ca'; c.strokeStyle = '#3e5736'; c.lineWidth = 3;
      c.strokeText(preview ? '在这里集结' : '集结地', 27, -24); c.fillText(preview ? '在这里集结' : '集结地', 27, -24);
    }
    c.restore();
  }

  private target(c: Ctx, p: Point, type: RenderOptions['targeting'], time: number, selectedTower?: Tower, hero?: Ally) {
    if (type === 'rally' && selectedTower?.kind === 'barracks') {
      const snapped = nearestLevelPathPoint(this.level, p);
      const valid = p.x >= 0 && p.x <= MAP_WIDTH && p.y >= 0 && p.y <= MAP_HEIGHT && Math.hypot(p.x - snapped.x, p.y - snapped.y) <= 45 && Math.hypot(snapped.x - selectedTower.x, snapped.y - selectedTower.y) <= getTowerCombatStats(selectedTower).range;
      if (valid) {
        this.rallyFlag(c, snapped, true, time, true);
        for (let i = 0; i < 3; i++) ellipse(c, snapped.x + (i - 1) * 17, snapped.y + (i === 1 ? 8 : -5), 5, 3, 'rgba(233,246,190,.7)', '#536e43', .9);
      } else {
        ellipse(c, p.x, p.y, 21, 11, 'rgba(216,101,76,.16)', '#f0a28b', 2);
        line(c, [[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]], '#f4bb9e', 2);
        line(c, [[p.x + 6, p.y - 6], [p.x - 6, p.y + 6]], '#f4bb9e', 2);
      }
      return;
    }
    if (!type || type === 'rally') return;
    const definition = SKILLS[type], r = definition.radius ?? (type === 'reinforce' ? 35 : 20);
    const valid = p.x >= 0 && p.x <= MAP_WIDTH && p.y >= 0 && p.y <= MAP_HEIGHT && (!definition.range || !!hero && hero.hp > 0 && Math.hypot(p.x - hero.x, p.y - hero.y) <= definition.range);
    const color = !valid ? '#efa68b' : type === 'meteor' ? '#f7ba78' : type === 'hero-dash' ? '#c7f0d7' : type === 'hero-roots' ? '#c9dc91' : '#e9d895';
    c.save();
    if (type === 'hero-dash' && hero) {
      const angle = Math.atan2(p.y - hero.y, p.x - hero.x), nx = Math.sin(angle) * r, ny = -Math.cos(angle) * r;
      line(c, [[hero.x, hero.y], [p.x, p.y]], valid ? 'rgba(129,206,179,.12)' : 'rgba(222,124,88,.10)', r * 2);
      c.setLineDash([6, 5]); c.lineDashOffset = -time * 18;
      line(c, [[hero.x + nx, hero.y + ny], [p.x + nx, p.y + ny]], color, 1.3);
      line(c, [[hero.x - nx, hero.y - ny], [p.x - nx, p.y - ny]], color, 1.3);
      c.setLineDash([]);
      line(c, [[hero.x, hero.y], [p.x, p.y]], color, 1.5);
      const length = Math.hypot(p.x - hero.x, p.y - hero.y);
      if (length > 32) for (let i = 1; i <= 3; i++) {
        const q = (time * .7 + i / 3) % 1, x = hero.x + (p.x - hero.x) * q, y = hero.y + (p.y - hero.y) * q;
        c.save(); c.translate(x, y); c.rotate(angle); line(c, [[-7, -4], [0, 0], [-7, 4]], color, 1.6); c.restore();
      }
    }
    c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fillStyle = !valid ? 'rgba(220,119,83,.10)' : type === 'meteor' ? 'rgba(211,102,51,.14)' : 'rgba(199,221,149,.12)'; c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.setLineDash([8, 5]); c.lineDashOffset = -time * 15; c.stroke(); c.setLineDash([]);
    ellipse(c, p.x, p.y, 7, 4, 'transparent', color, 1.5); line(c, [[p.x - 14, p.y], [p.x - 5, p.y]], color, 2); line(c, [[p.x + 5, p.y], [p.x + 14, p.y]], color, 2); line(c, [[p.x, p.y - 12], [p.x, p.y - 5]], color, 2); line(c, [[p.x, p.y + 5], [p.x, p.y + 12]], color, 2);
    if (type === 'hero-roots' && valid) for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + time * .08, x = p.x + Math.cos(a) * (r - 5), y = p.y + Math.sin(a) * (r - 5);
      poly(c, [[x - 3, y + 4], [x, y - 6], [x + 4, y + 4]], 'rgba(196,215,139,.6)');
    }
    if (!valid) {
      line(c, [[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]], '#f8c2a9', 2); line(c, [[p.x + 8, p.y - 8], [p.x - 8, p.y + 8]], '#f8c2a9', 2);
    }
    c.restore();
  }

  destroy() { this.observer.disconnect(); }
}
