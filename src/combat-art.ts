import { HERO_STATS } from './data';
import type { Ally, CombatPose, Effect, Enemy } from './types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { const q = clamp(t); return q * q * (3 - 2 * q); };
const attackDuration = { goblin: .45, wolf: .38, orc: .45, shaman: .52, golem: .64, chieftain: .62,
  bogling: .45, serpent: .38, icewolf: .38, frostguard: .45, imp: .52, juggernaut: .64 };

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string, width = 1.5) {
  c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, TAU);
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function poly(c: Ctx, points: number[][], fill: string, stroke?: string, width = 1.5) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c: Ctx, points: number[][], color: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}
function round(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, width = 1) {
  if (w <= 0 || h <= 0) return;
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function shadow(c: Ctx, x: number, y: number, radius: number, alpha = .22) {
  ellipse(c, x + 4, y + 3, radius, radius * .31, `rgba(24,34,23,${alpha})`);
}
function health(c: Ctx, x: number, y: number, ratio: number, color: string, width: number) {
  const w = clamp(ratio) * width;
  round(c, x - width / 2 - 1, y - 1, width + 2, 6, 2.3, '#334b3c', 'rgba(227,225,166,.3)', .6);
  round(c, x - width / 2, y, w, 3.5, 1.6, color);
  if (w > 2) line(c, [[x - width / 2 + 1, y + .8], [x - width / 2 + w - 1, y + .8]], 'rgba(233,237,184,.4)', .7);
}

function poison(c: Ctx, a: Ally, time: number) {
  if ((a.poisonTimer ?? 0) <= 0) return;
  c.save(); c.globalAlpha = .65;
  for (let i = 0; i < 4; i++) {
    const q = (time * .5 + i * .25) % 1, x = a.x + Math.sin(a.id + i * 2.5) * 15, y = a.y - 3 - q * 30;
    ellipse(c, x, y, 1.5 + (1 - q), 1.5 + (1 - q), '#bed28c', '#6e974f', .7);
  }
  c.restore();
}

/** One finite animation per attack: anticipate, strike, then return to the ready pose. */
function pose(entity: CombatPose, duration: number) {
  const active = (entity.attackAnimation ?? 0) > 0;
  const p = active ? clamp(1 - (entity.attackAnimation ?? 0) / duration) : 1;
  const wind = active ? ease(p / .22) * (1 - ease((p - .22) / .17)) : 0;
  const strike = active ? ease((p - .22) / .22) * (1 - ease((p - .48) / .52)) : 0;
  const recovery = active ? ease((p - .48) / .52) : 1;
  const swing = active ? ease((p - .22) / .26) : 0;
  const hit = clamp((entity.hitAnimation ?? 0) / .2);
  return { active, p, wind, strike, recovery, swing, hit, variant: (entity.attackVariant ?? 0) % 2 };
}

function weaponAngle(m: ReturnType<typeof pose>, ready: number, start: number, end: number) {
  if (!m.active) return ready;
  if (m.p < .22) return mix(ready, start, ease(m.p / .22));
  if (m.p < .48) return mix(start, end, ease((m.p - .22) / .26));
  return mix(end, ready, ease((m.p - .48) / .52));
}

function arc(c: Ctx, x: number, y: number, r: number, start: number, end: number, color: string, width: number) {
  c.beginPath(); c.arc(x, y, r, start, end, end < start); c.strokeStyle = color;
  c.lineWidth = width; c.lineCap = 'round'; c.stroke();
}

function sword(c: Ctx, hero: boolean) {
  const length = hero ? 36 : 23;
  poly(c, [[0, -2], [length - 6, -2.8], [length, 0], [length - 6, 3.2], [0, 2]], hero ? '#e3efd0' : '#c9d8c5', '#5b7668', .9);
  poly(c, [[2, -.3], [length - 6, -.8], [length - 1, 0], [length - 6, 1.1], [2, .7]], hero ? '#8ddab9' : '#eef0d1');
  line(c, [[0, -5], [0, 5]], '#dfc77e', hero ? 3.2 : 2.5);
  line(c, [[-1, 0], [-8, 0]], '#736346', 3);
  ellipse(c, -9, 0, 2.3, 2.3, '#d4b978', '#58634d', .8);
}

function shield(c: Ctx, hero: boolean, reinforcement: boolean) {
  poly(c, [[-7, -10], [4, -12], [8, -5], [4, 8], [-2, 11], [-9, 0]], hero ? '#427b64' : reinforcement ? '#8b6c54' : '#597f88', '#324f46', 1.5);
  poly(c, [[-7, -10], [-2, -11], [-2, 8], [-9, 0]], hero ? '#689c73' : '#89a395');
  line(c, [[-2, -9], [-2, 7]], hero ? '#e4cf83' : '#d1d6b0', 1.6);
  line(c, [[-7, -2], [5, -2]], hero ? '#e4cf83' : '#d1d6b0', 1.6);
  if (hero) poly(c, [[-2, -6], [1, -2], [-2, 3], [-5, -2]], '#dcc87f');
}

/** A hand-drawn, articulated hero: the cape, braid, plates and blade share the combat pose. */
function drawHero(c: Ctx, a: Ally, time: number, selected: boolean) {
  if (a.hp <= 0) {
    c.save(); c.translate(a.x, a.y); c.globalAlpha = .55;
    shadow(c, 0, 0, 23, .3); ellipse(c, 0, 0, 22, 7, '#365d51');
    poly(c, [[-18, -6], [-7, -15], [11, -8], [19, -3], [7, 1]], '#bbc8b4', '#3d5c51');
    line(c, [[-15, -9], [-2, -14], [10, -7]], '#d4ba78', 3); c.restore(); return;
  }
  const m = pose(a, .56), dx = a.targetX - a.x, dy = a.targetY - a.y;
  const fx = a.facingX ?? (dx < 0 ? -1 : 1), fy = a.facingY ?? 0, direction = fx < -.06 ? -1 : 1;
  const moving = !m.active && a.engagedWith === null && Math.hypot(dx, dy) > 4;
  const step = moving ? Math.sin(time * 10 + a.id) : 0;
  const flutter = Math.sin(time * 2.5 + a.id) * 1.4, tail = m.strike * 11 + Math.abs(step) * 4 + flutter;
  c.save(); c.translate(a.x, a.y); shadow(c, 0, 1, 25, .27);
  if (selected) {
    ellipse(c, 0, 2, 32, 11, 'rgba(154,218,195,.11)', '#eef0b3', 2);
    ellipse(c, 0, 2, 37, 13, 'transparent', 'rgba(193,231,174,.38)', 1);
    for (let i = 0; i < 4; i++) { const q = i * Math.PI / 2; poly(c, [[Math.cos(q) * 35, Math.sin(q) * 12 - 3], [Math.cos(q) * 35 + 2, Math.sin(q) * 12], [Math.cos(q) * 35, Math.sin(q) * 12 + 3], [Math.cos(q) * 35 - 2, Math.sin(q) * 12]], '#e7dfa0'); }
  }
  if ((a.buffTimer ?? 0) > 0) {
    ellipse(c, 0, 1, 32, 11, 'rgba(206,233,140,.12)', '#dbe7a6', 1.6);
    for (let i = 0; i < 3; i++) { const q = time * .8 + i * TAU / 3, x = Math.cos(q) * 31, y = Math.sin(q) * 9; poly(c, [[x, y - 7], [x + 3, y - 3], [x, y + 1], [x - 3, y - 3]], '#dceeb6'); }
  }
  c.translate(fx * m.strike * 11 - fx * m.hit * 3, fy * m.strike * 7 - Math.abs(step) * 1.3 + m.hit * 1.5);
  c.scale(direction * 1.5, 1.5);
  // Double-layer cloth. The hem follows movement, while the clasp stays on the shoulders.
  c.beginPath(); c.moveTo(-9, -33); c.quadraticCurveTo(-18 - tail * .35, -28, -19 - tail, -9);
  c.lineTo(-15 - tail * .75, -4); c.lineTo(-10 - tail * .52, -7); c.lineTo(-5 - tail * .25, -3);
  c.quadraticCurveTo(1, -18, 6, -30); c.closePath(); c.fillStyle = '#244f45'; c.fill(); c.strokeStyle = '#294d43'; c.lineWidth = 1.3; c.stroke();
  poly(c, [[-8, -31], [-12 - tail * .3, -22], [-15 - tail * .78, -8], [-10 - tail * .52, -10], [-5, -28]], '#538879');
  line(c, [[-9, -28], [-12 - tail * .3, -17], [-13 - tail * .65, -8]], '#91af83', .8);
  line(c, [[-17 - tail, -9], [-15 - tail * .75, -4], [-10 - tail * .52, -7], [-5 - tail * .25, -3]], '#bdbe82', 1.1);
  // Jointed greaves and leather boots keep a wider, stable fencing stance.
  for (const side of [-1, 1]) {
    const stride = side * step * 2.8 + (side > 0 ? m.strike * 5 : -m.strike * 2), x = side * 5;
    line(c, [[x, -17], [x + stride * .5, -9], [x + stride, -2]], '#304e48', 4.7);
    poly(c, [[x - 2.5 + stride * .5, -10], [x + 2.3 + stride * .5, -11], [x + 2.5 + stride, -3], [x - 2 + stride, -2]], side < 0 ? '#a8bfaf' : '#809e91', '#47695c', .8);
    line(c, [[x + stride * .5, -9], [x + stride, -4]], '#d8dcca', .8);
    poly(c, [[x - 2 + stride, -3], [x + 2 + stride, -3], [x + 5 + stride, 0], [x + 4 + stride, 2], [x - 3 + stride, 1]], '#43594c', '#283f36', .8);
    line(c, [[x - 1 + stride, -2], [x + 2 + stride, -1]], '#d2b678', 1);
  }
  c.save(); c.translate(m.strike * 2 - m.wind * 1.5, m.wind * 1.1); c.rotate(-m.wind * .12 + m.strike * .12 - m.hit * .07);
  // Neck, fitted breastplate, separated tassets and etched leaf veins.
  round(c, -3, -37, 6, 7, 2, '#debf97', '#5f7060', .6);
  poly(c, [[-9, -32], [-4, -34], [4, -34], [10, -30], [7, -21], [3, -16], [-5, -18], [-8, -24]], '#b2c8b5', '#3f6655', 1.2);
  poly(c, [[2, -33], [9, -30], [7, -21], [3, -16], [0, -18], [0, -29]], '#668f7b');
  poly(c, [[-7, -30], [-3, -31], [-2, -19], [-6, -21]], '#d8dfc7');
  line(c, [[-4, -28], [1, -24], [3, -19]], '#4d7c64', .9);
  for (const side of [-1, 1]) { line(c, [[side * 6, -28], [0, -24], [side * 5, -23]], '#91a77f', .8); }
  ellipse(c, 0, -29, 2.3, 3, '#69baa3', '#e2d297', .8); ellipse(c, -.6, -30, .7, 1.1, '#eef8d9');
  poly(c, [[-7, -19], [0, -17], [-1, -10], [-8, -12]], '#aec2a8', '#476653', .8);
  poly(c, [[1, -17], [7, -19], [9, -12], [2, -10]], '#80a58d', '#476653', .8);
  line(c, [[-5, -17], [-5, -12]], '#d1d5b4', .7); line(c, [[4, -17], [5, -12]], '#c1ccb0', .7);
  line(c, [[-7, -19], [7, -19]], '#684e39', 2.3);
  round(c, -1.9, -21, 4, 3.5, .8, '#ccba7e', '#5c6446', .6);
  round(c, 7.1, -20, 3.6, 6, 1, '#886c49', '#5a5940', .6);
  // A long layered braid reads as the hero's silhouette even when she faces away.
  const braidX = -7 - tail * .14;
  for (let i = 0; i < 6; i++) {
    const x = braidX - i * .75 - Math.sin(time * 2 + i * .8) * .55, y = -37 + i * 3.1;
    ellipse(c, x, y, 2.8 - i * .16, 2.7, i % 2 ? '#b89356' : '#dac383', '#786641', .5);
    line(c, [[x - 1.2, y - 1.2], [x + .9, y + 1.3]], '#edda9d', .55);
  }
  line(c, [[braidX - 4, -19], [braidX - 5.5, -15]], '#d7bf79', 2.2);
  round(c, braidX - 5.8, -19.5, 3, 2.1, .7, '#5c9482', '#d0c78d', .5);
  // Three-quarter face: pointed ear, brow, two eyes, nose, mouth and cheek light.
  ellipse(c, .7, -42, 7.1, 8.5, '#dbb892', '#566b52', .9);
  poly(c, [[-5.5, -43], [-12, -47], [-8.8, -39], [-5.5, -38]], '#cbaa81', '#6e7b56', .65);
  line(c, [[-9.5, -44.3], [-7, -40.8]], '#e7cba1', .6);
  ellipse(c, 3.8, -40, 3.2, 4.8, '#e9c8a1');
  // Richly shaded hair sweeps over the crown rather than a helmet triangle.
  c.beginPath(); c.moveTo(-7.3, -39); c.bezierCurveTo(-10, -48, -5.7, -53, 1, -53.2); c.bezierCurveTo(6.8, -53, 10.2, -49, 8.2, -40.2); c.lineTo(6.4, -42.5); c.quadraticCurveTo(7.1, -48.5, 1.6, -47.7); c.quadraticCurveTo(-.2, -42.7, -5.5, -42); c.lineTo(-5.6, -37); c.closePath(); c.fillStyle = '#c9a663'; c.fill(); c.strokeStyle = '#796b46'; c.lineWidth = .85; c.stroke();
  poly(c, [[-5.5, -48.5], [-1, -51.8], [4.5, -51], [1.2, -48], [-3.5, -44.5]], '#e7cf91');
  line(c, [[-5.4, -47.5], [-1.5, -50], [3.7, -49.8]], '#f1dc9f', .6);
  line(c, [[2, -47.8], [-.5, -44.2], [-4.5, -42.4]], '#ac864e', .7);
  poly(c, [[-6.8, -46], [-3, -48.2], [1, -48.6], [5.7, -47]], '#4b856b', '#d2c58b', .65);
  poly(c, [[-1, -49.5], [1, -46.5], [-1, -44.2], [-3, -46.7]], '#addec3', '#d8d3a1', .6);
  line(c, [[-.6, -43.5], [2.6, -43.1]], '#775d3d', .7); line(c, [[4.3, -43], [6.4, -42.6]], '#775d3d', .7);
  ellipse(c, 1.1, -42, 1.5, .75, '#f3e9c9'); ellipse(c, 5.2, -41.7, 1, .65, '#f3e9c9');
  ellipse(c, 1.5, -41.9, .65, .8, '#38715e'); ellipse(c, 5.5, -41.6, .5, .7, '#38715e');
  line(c, [[3.5, -41], [4, -38.9], [3, -38.7]], '#bd946f', .55);
  line(c, [[1.6, -36.8], [4.2, -36.7]], '#a27162', .65); ellipse(c, -.5, -38.8, 1.4, .65, 'rgba(198,120,95,.23)');
  ellipse(c, -7.8, -39.1, .8, 1.1, '#ebd297', '#6c7c50', .4);
  // Separate overlapping shoulder plates and clasp catch the light during a strike.
  for (const side of [-1, 1]) {
    const sx = side * 8;
    poly(c, [[sx - 5, -31], [sx - 2, -35], [sx + 4, -33], [sx + 6, -28], [sx + 2, -25], [sx - 4, -27]], side < 0 ? '#cbd6bf' : '#99b5a2', '#486953', .8);
    line(c, [[sx - 3, -31], [sx + 2, -32], [sx + 4, -29]], '#e4e5c5', .7);
    line(c, [[sx - 3, -27], [sx + 2, -25]], '#879a74', .7);
  }
  const shieldY = -21 - m.wind * 6 - m.strike * 2;
  line(c, [[-9, -28], [-12, shieldY]], '#b5c8ae', 4);
  c.save(); c.translate(-13 - m.wind * 2, shieldY); c.rotate(m.wind * -.16 + m.strike * .10);
  poly(c, [[-8, -10], [-1, -15], [7, -11], [8, -4], [5, 6], [-1, 13], [-7, 6], [-10, -3]], '#427765', '#cad3aa', 1.1);
  poly(c, [[-8, -10], [-1, -15], [-1, 10], [-7, 6], [-10, -3]], '#77a58a');
  line(c, [[-1, -10], [-1, 7]], '#ecddb0', 1.1);
  for (const side of [-1, 1]) { line(c, [[-1, -7], [-1 + side * 5, -3], [-1, -1], [-1 + side * 4, 2]], '#d6d6a2', .8); }
  poly(c, [[-1, -7], [2, -3], [-1, 2], [-4, -3]], '#90d1b0', '#edf0b8', .7); c.restore();
  const swordX = 14 + m.strike * 6 - m.wind * 3, swordY = -28 - m.wind * 5;
  line(c, [[10, -29], [10 + m.strike * 4, -21 - m.wind * 4], [swordX, swordY]], '#d9bd92', 4);
  poly(c, [[9, -24], [12, -24], [swordX + 1, swordY + 1], [swordX - 2, swordY - 2]], '#91b49c', '#476b57', .75);
  line(c, [[swordX - 2, swordY - 2], [swordX + 1, swordY + 1]], '#d6d7ac', 1.1);
  const bladeAngle = weaponAngle(m, -.85, m.variant ? .8 : -2.5, m.variant ? -1.85 : .5) + fy * .25;
  if (m.active && m.p > .22 && m.p < .56) { c.save(); c.globalAlpha *= .42 * (1 - ease((m.p - .45) / .11)); arc(c, swordX, swordY, 35, bladeAngle - (m.variant ? -.7 : .7), bladeAngle, '#89ddbb', 6); arc(c, swordX, swordY, 38, bladeAngle - (m.variant ? -.62 : .62), bladeAngle, '#f6e7b3', 1.3); c.restore(); }
  c.save(); c.translate(swordX, swordY); c.rotate(bladeAngle);
  // A swept crescent tip and inlaid spine distinguish Moonblade from the soldiers' swords.
  c.beginPath(); c.moveTo(1, -2); c.lineTo(22, -4); c.quadraticCurveTo(32, -6, 38, -15); c.quadraticCurveTo(38, -2, 31, 5); c.lineTo(2, 3); c.closePath(); c.fillStyle = '#dbecd0'; c.fill(); c.strokeStyle = '#5c8d78'; c.lineWidth = .9; c.stroke();
  c.beginPath(); c.moveTo(4, -.2); c.lineTo(26, -.5); c.quadraticCurveTo(33, -1, 36, -9); c.strokeStyle = '#8fdbc1'; c.lineWidth = 1.1; c.stroke();
  line(c, [[2, -2], [25, -3], [32, -7]], '#fbf6d6', .75);
  line(c, [[0, -6], [-1, 5]], '#d3bb7e', 2.6); line(c, [[-8, 0], [0, 0]], '#4c7763', 3);
  for (let i = -7; i < -1; i += 2) line(c, [[i, -1.3], [i + 1, 1.2]], '#adad77', .6);
  ellipse(c, -9, 0, 2, 2.5, '#abd9af', '#d4bf81', .7); c.restore();
  c.restore(); c.restore();
  health(c, a.x, a.y - 91, a.hp / a.maxHp, '#9bd8ac', 44);
  c.save(); c.textAlign = 'center'; c.fillStyle = '#f9eccc'; c.strokeStyle = '#36533f'; c.lineWidth = 3; c.font = 'bold 11px "Noto Sans SC", sans-serif';
  const name = HERO_STATS.name.split(' · ')[0]; c.strokeText(name, a.x, a.y - 99); c.fillText(name, a.x, a.y - 99); c.restore();
  poison(c, a, time);
}

export function drawAlly(c: Ctx, a: Ally, time: number, selected: boolean) {
  if (a.type === 'hero') { drawHero(c, a, time, selected); return; }
  const hero = false, reinforcement = a.type === 'reinforcement';
  if (a.hp <= 0) {
    if (hero) {
      c.save(); c.globalAlpha = .5; shadow(c, a.x, a.y, 19, .3);
      ellipse(c, a.x, a.y, 18, 6, '#456756');
      line(c, [[a.x - 8, a.y - 2], [a.x + 8, a.y - 7]], '#d1d8b7', 3);
      poly(c, [[a.x - 3, a.y - 4], [a.x - 10, a.y - 12], [a.x + 5, a.y - 9]], '#9aab99'); c.restore();
    }
    return;
  }
  const m = pose(a, hero ? .56 : .40);
  const dx = a.targetX - a.x, dy = a.targetY - a.y;
  const fx = a.facingX ?? (dx < 0 ? -1 : 1), fy = a.facingY ?? 0;
  const direction = fx < -.06 ? -1 : 1;
  const moving = !m.active && a.engagedWith === null && Math.hypot(dx, dy) > 4;
  const step = moving ? Math.sin(time * 11 + a.id) : 0;
  const lunge = m.strike * (hero ? 12 : 6);
  const startAngle = m.variant ? .8 : -2.5, endAngle = m.variant ? -1.85 : .5;
  const bladeAngle = weaponAngle(m, hero ? -.95 : -1.25, hero ? startAngle : -2.35, hero ? endAngle : .32) + fy * .25;
  const swordX = 13 + m.strike * (hero ? 5 : 2) - m.wind * 3, swordY = -24 - m.wind * 4;
  c.save(); c.translate(a.x, a.y);
  shadow(c, 0, 1, hero ? 23 : 14, .24);
  if (selected) {
    ellipse(c, 0, 2, hero ? 29 : 23, hero ? 10 : 8, 'rgba(140,221,188,.12)', '#d0e6ab', 2);
    ellipse(c, 0, 2, hero ? 34 : 27, hero ? 12 : 10, 'transparent', 'rgba(198,230,170,.33)', 1);
  }
  if ((a.buffTimer ?? 0) > 0) {
    const pulse = .6 + Math.sin(time * 4 + a.id) * .15;
    ellipse(c, 0, 1, hero ? 28 : 20, hero ? 10 : 7, `rgba(201,224,148,${pulse * .10})`, '#d9e4a5', 1.4);
    for (let i = 0; i < 3; i++) {
      const angle = time * .8 + i * TAU / 3, x = Math.cos(angle) * (hero ? 26 : 18), y = Math.sin(angle) * 7;
      poly(c, [[x, y - 5], [x + 3, y - 2], [x, y + 1], [x - 3, y - 2]], '#dae8ab');
    }
  }
  c.translate(fx * lunge - fx * m.hit * 3, fy * lunge * .65 + Math.abs(step) * -.75 + m.hit * 1.5);
  c.scale(direction * (hero ? 1.4 : 1), hero ? 1.4 : 1);
  // The cloak trails behind the physical lunge; only walking drives a repeating motion.
  const tail = m.strike * 10 + m.wind * 3 + Math.abs(step) * 1.6;
  poly(c, [[-8, -28], [5, -27], [7, -9], [-13 - tail, -5], [-15 - tail * .6, -14]], hero ? '#316c57' : reinforcement ? '#94624f' : '#756e50', '#304e3e', 1.3);
  poly(c, [[-8, -28], [-3, -24], [-6 - tail * .3, -9], [-13 - tail, -5]], hero ? '#68996e' : '#a39766');
  line(c, [[-11 - tail * .4, -18], [-10 - tail * .7, -9]], hero ? '#91ad75' : '#bbb282', 1);
  const stance = m.strike * 6;
  line(c, [[-4, -12], [-5 + step * 2.5 - stance * .5, -2]], '#748279', 4.5);
  line(c, [[5, -12], [5 - step * 2.5 + stance, -2]], '#536b61', 4.5);
  ellipse(c, -5 + step * 2.5 - stance * .5, -1, 4, 2.3, '#384e42');
  ellipse(c, 6 - step * 2.5 + stance, -1, 4, 2.3, '#384e42');
  c.save(); c.translate(m.strike * 2 - m.wind * 1.5, m.wind * 1.1); c.rotate(-m.wind * .12 + m.strike * .12 - m.hit * .07);
  c.globalAlpha *= 1 - m.hit * .14;
  poly(c, [[-8, -27], [7, -27], [9, -14], [-7, -12]], hero ? '#ccb878' : '#afc0b3', '#405b4d', 1.4);
  poly(c, [[1, -27], [7, -27], [9, -14], [1, -12]], hero ? '#928a59' : '#6f8b81');
  poly(c, [[-10, -28], [-4, -29], [-2, -23], [-8, -20]], hero ? '#e3cb89' : '#c4cdb4', '#55725a', .9);
  line(c, [[-6, -15], [7, -15]], '#4a624b', 2); ellipse(c, 0, -14, 2, 2, '#e7d385');
  ellipse(c, 0, -34, 7, 8, '#d1b78d', '#40594b', 1.2);
  poly(c, [[-8, -34], [-6, -43], [0, -46], [7, -41], [8, -32], [3, -29], [3, -35]], hero ? '#d5bd79' : '#b4c2b5', '#3e5b4c', 1.3);
  poly(c, [[0, -45], [7, -41], [8, -32], [3, -29], [3, -35]], hero ? '#968d5e' : '#759084');
  line(c, [[-5, -34], [2, -34]], '#2e4d42', 1.8); ellipse(c, -2, -34, .8, .8, '#f5df9b');
  if (hero) {
    poly(c, [[-2, -44], [-1 - tail * .14, -56], [6, -49], [7, -43]], '#4b825f', '#315743', 1);
    line(c, [[-1, -45], [1, -49], [3, -47]], '#e3ca83', 1.4);
  } else if (reinforcement) poly(c, [[-2, -45], [-3, -51], [5, -48], [5, -43]], '#bc785a');
  // Raising the shield reads clearly even at the small soldier scale.
  const shieldY = -18 - m.wind * 6 - m.strike * 2;
  line(c, [[-7, -25], [-11, shieldY]], '#9ebaa3', 4);
  c.save(); c.translate(-11 - m.wind * 2, shieldY); c.rotate(m.wind * -.16 + m.strike * .1); shield(c, hero, reinforcement); c.restore();
  line(c, [[7, -25], [9 + m.strike * 4, -20 - m.wind * 4], [swordX, swordY]], hero ? '#ceb374' : '#9bb29f', 4);
  if (hero && m.active && m.p > .22 && m.p < .56) {
    c.save(); c.globalAlpha *= .45 * (1 - ease((m.p - .45) / .11));
    arc(c, swordX, swordY, 33, bladeAngle - (m.variant ? -.7 : .7), bladeAngle, '#75d9b4', 6);
    arc(c, swordX, swordY, 35, bladeAngle - (m.variant ? -.62 : .62), bladeAngle, '#f0de9b', 1.4); c.restore();
  }
  c.save(); c.translate(swordX, swordY); c.rotate(bladeAngle); sword(c, hero); c.restore();
  c.restore(); c.restore();
  poison(c, a, time);
  if (a.hp < a.maxHp || hero) health(c, a.x, a.y - (hero ? 87 : reinforcement ? 58 : 54), a.hp / a.maxHp, hero ? '#8fcda0' : '#9cbc80', hero ? 42 : 27);
  if (hero) {
    c.save(); c.textAlign = 'center'; c.fillStyle = '#f4e8bc'; c.strokeStyle = '#35533e'; c.lineWidth = 3;
    c.font = 'bold 11px "Noto Sans SC", sans-serif';
    const name = HERO_STATS.name.split(' · ')[0]; c.strokeText(name, a.x, a.y - 95); c.fillText(name, a.x, a.y - 95); c.restore();
  }
}

function humanoid(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const big = e.kind === 'chieftain', orc = e.kind === 'orc', shaman = e.kind === 'shaman';
  const scale = big ? 1.65 : orc ? 1.3 : shaman ? 1.12 : 1;
  c.scale(scale, scale);
  const step = e.blockedBy === null && !m.active ? Math.sin(time * (e.kind === 'goblin' ? 12 : 8) + e.id) : 0;
  const skin = big ? '#788552' : orc ? '#718748' : shaman ? '#8c9f61' : '#8fa35c';
  line(c, [[-5, -10], [-5 + step * 3 - m.wind * 2, -1]], '#4d5735', 5);
  line(c, [[5, -10], [5 - step * 3 + m.strike * 5, -1]], '#4b5633', 5);
  ellipse(c, -6 + step * 3 - m.wind * 2, -1, 4, 2, '#464c32'); ellipse(c, 6 - step * 3 + m.strike * 5, -1, 4, 2, '#464c32');
  c.save(); c.rotate(-m.wind * .1 + m.strike * .17 - m.hit * .07);
  if (big) poly(c, [[-9, -26], [6, -24], [0, -5], [-16 - m.strike * 7, -4]], '#a76b49', '#634e33', 1.1);
  if (shaman) {
    poly(c, [[-7, -22], [7, -22], [12, -3], [-12, -3]], '#897078', '#475137', 1.4);
    poly(c, [[0, -22], [7, -22], [12, -3], [0, -5]], '#62566d'); line(c, [[-8, -7], [10, -7]], '#d3b78d', 1.5);
  } else {
    poly(c, [[-7, -23], [7, -23], [10, -10], [-9, -9]], big ? '#796a48' : orc ? '#78755b' : '#8e7960', '#414e32', 1.3);
    line(c, [[-7, -12], [7, -12]], big ? '#ccb178' : '#634f34', 2.5);
    if (orc || big) {
      poly(c, [[-10, -24], [-4, -26], [-1, -22], [-5, -16], [-12, -18]], '#a0a08d', '#4b5847', 1);
      poly(c, [[5, -25], [11, -23], [12, -17], [5, -17]], '#7d8579', '#485546', 1);
      if (big) { poly(c, [[-10, -24], [-12, -32], [-6, -27]], '#d4c69f', '#5e6c4b', .8); poly(c, [[8, -25], [12, -32], [13, -24]], '#d4c69f', '#5e6c4b', .8); }
    }
  }
  line(c, [[-7, -22], [-11 - m.wind * 3, -14 - m.wind * 4]], skin, 4);
  ellipse(c, 0, -30, 9, 9, skin, '#45552f', 1.2);
  poly(c, [[-7, -33], [-16, -37], [-11, -28], [-7, -27]], skin, '#45552f', 1);
  poly(c, [[7, -33], [15, -35], [11, -26], [7, -27]], skin, '#45552f', 1);
  ellipse(c, -4, -32, 2, 1.6, '#e8d994'); ellipse(c, 4, -32, 2, 1.6, '#e8d994');
  ellipse(c, -4, -32, .8, 1, '#393d24'); ellipse(c, 4, -32, .8, 1, '#393d24');
  line(c, [[-6, -35], [-2, -34]], '#42512e', 1.5); line(c, [[2, -34], [6, -35]], '#42512e', 1.5);
  ellipse(c, 1, -27, 5, 3, '#7b8b4d'); line(c, [[-3, -23], [4, -23]], '#475034', 1.2);
  if (orc || big) { poly(c, [[-5, -24], [-4, -19], [-1, -23]], '#ede0b0'); poly(c, [[4, -24], [3, -19], [1, -23]], '#ede0b0'); }
  if (shaman) {
    poly(c, [[-11, -34], [-3, -50], [4, -53], [10, -34]], '#856582', '#48445a', 1.4); line(c, [[-9, -35], [9, -35]], '#c0a7a0', 2);
    const armX = 13 + m.strike * 6, armY = -20 - m.wind * 7;
    line(c, [[7, -22], [armX, armY]], skin, 4);
    c.save(); c.translate(armX, armY); c.rotate(weaponAngle(m, -.08, -.55, .62) + (e.facingY ?? 0) * .3);
    line(c, [[0, 14], [2, -27]], '#957b4e', 3);
    poly(c, [[2, -32], [8, -26], [2, -17], [-4, -25]], '#bdb2d6', '#645d82', 1.1);
    ellipse(c, 2, -26, 2.7, 4, '#e8d8f7');
    if (m.active) { c.globalAlpha = .35 + m.strike * .4; ellipse(c, 2, -26, 7 + m.wind * 4, 7 + m.wind * 4, '#b894d9'); }
    c.restore();
  } else if (big || orc) {
    if (big) {
      poly(c, [[-10, -36], [-10, -44], [-5, -40], [0, -47], [5, -40], [10, -44], [10, -36]], '#cfb76c', '#6b623b', 1.4);
      ellipse(c, 0, -40, 2.2, 2.2, '#ad6546');
    }
    const armX = 12 + m.strike * 5 - m.wind * 3, armY = -22 - m.wind * 6;
    line(c, [[7, -22], [armX, armY]], skin, 4.5);
    c.save(); c.translate(armX, armY); c.rotate(weaponAngle(m, -1.15, -2.5, .7) + (e.facingY ?? 0) * .4);
    line(c, [[-8, 0], [big ? 30 : 25, 0]], '#857044', big ? 3.5 : 3);
    const reach = big ? 30 : 25;
    poly(c, [[reach - 9, -3], [reach - 5, -13], [reach + 5, -12], [reach + 8, -3], [reach + 4, 6], [reach - 6, 7]], '#a8ae98', '#4f6048', 1.2);
    line(c, [[reach + 5, -11], [reach + 7, -3], [reach + 3, 5]], '#d9d8b5', 1.8); c.restore();
  } else {
    poly(c, [[-8, -37], [0, -44], [8, -37]], '#927a50', '#495237', 1);
    const handX = 13 - m.wind * 6 + m.strike * 12, handY = -18 - m.wind * 2;
    line(c, [[7, -22], [10 + m.strike * 7, -15], [handX, handY]], skin, 4);
    c.save(); c.translate(handX, handY); c.rotate(-.32 - m.wind * .25 + (e.facingY ?? 0) * .65);
    poly(c, [[-1, -2], [13, -3], [20, 0], [13, 3], [-1, 2]], '#c8ceac', '#57684c', 1);
    line(c, [[0, -5], [0, 4]], '#9c8554', 2); line(c, [[-6, 0], [0, 0]], '#6b6140', 3); c.restore();
  }
  c.restore();
}

function wolf(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const frost = e.kind === 'icewolf', dark = frost ? '#718cad' : '#40564b', fur = frost ? '#bad2dc' : '#839081';
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 13 + e.id) * 3 : 0;
  const crouch = m.wind * 3 - m.strike * 2;
  c.translate(0, crouch);
  for (const [x, direction] of [[-9, 1], [10, -1]]) {
    line(c, [[x, -12], [x + step * direction - m.wind * 3, -2]], '#545d56', 3.5);
    line(c, [[x + 5, -12], [x + 5 - step * direction + m.strike * 4, -1]], '#748077', 3.5);
  }
  poly(c, [[-15, -13], [-25 - m.wind * 3, -25], [-18, -23], [-7, -20]], fur, dark, 1.3);
  ellipse(c, -2, -16, 19, 9, frost ? '#b5c9d5' : '#7f8d83', dark, 1.3); ellipse(c, -1, -18, 13, 4, frost ? '#e2eff0' : '#a0aaa0');
  if (frost) {
    for (let i = 0; i < 5; i++) poly(c, [[-15 + i * 6, -20], [-18 + i * 6, -30 - i % 2 * 3], [-8 + i * 6, -20]], i % 2 ? '#9dcadf' : '#d5ebeb', '#769db9', .7);
    ellipse(c, -7, -13, 10, 2, '#88afc9');
  }
  const headX = m.strike * 5;
  c.save(); c.translate(headX, -m.wind * 2);
  poly(c, [[10, -19], [12, -29], [17, -24], [21, -28], [22, -19], [31, -15], [28, -10], [15, -10]], frost ? '#c6dce4' : '#8d998c', dark, 1.3);
  poly(c, [[17, -24], [22, -19], [31, -15], [28, -10], [15, -10]], frost ? '#e8f2ef' : '#a9b1a1');
  ellipse(c, 25, -18, 2, 1.1, frost ? '#7acef6' : '#e2cf86'); ellipse(c, 30, -14, 2, 1.5, '#405248');
  c.save(); c.translate(18, -9); c.rotate(m.wind * .35 - m.strike * .08);
  poly(c, [[0, 0], [12, 0], [9, 4], [1, 4]], '#617465', '#415849', 1);
  poly(c, [[5, 0], [6, -4], [7, 0]], '#f0e6c3'); poly(c, [[9, 0], [10, -3], [11, 0]], '#f0e6c3'); c.restore();
  poly(c, [[23, -10], [24, -5], [26, -10]], '#e6e0bb'); c.restore();
}

function golem(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 5 + e.id) * 2 : 0;
  poly(c, [[-12, -19], [-15 + step, -4], [-4 + step, -2], [-3, -19]], '#7c8072', '#455447', 1.7);
  poly(c, [[5, -19], [4 - step + m.strike * 2, -3], [16 - step + m.strike * 2, -3], [14, -20]], '#717c6e', '#455447', 1.7);
  c.save(); c.rotate(m.strike * .12 - m.wind * .1);
  poly(c, [[-15, -35], [-7, -42], [10, -40], [18, -29], [12, -13], [-12, -12]], '#92998a', '#425546', 1.8);
  poly(c, [[-15, -35], [-7, -42], [0, -37], [-1, -17], [-12, -12]], '#afb09a');
  const raise = m.wind * 31, slam = m.strike * 10;
  for (const side of [-1, 1]) {
    const shoulderX = side * 16, fistX = side * (24 - m.wind * 6) + slam * .6;
    const fistY = -13 - raise + m.strike * 8;
    line(c, [[shoulderX, -33], [side * 24, -26 - raise * .65], [fistX, fistY]], side < 0 ? '#929b87' : '#788574', 12);
    poly(c, [[fistX - 8, fistY - 8], [fistX + 6, fistY - 10], [fistX + 9, fistY + 3], [fistX - 4, fistY + 7], [fistX - 10, fistY]], '#919c85', '#405742', 1.7);
    line(c, [[fistX - 6, fistY - 5], [fistX + 3, fistY - 6]], '#bec0a4', 1.4);
  }
  poly(c, [[-11, -43], [-9, -57], [4, -62], [14, -53], [12, -39], [-1, -36]], '#9ca28e', '#445745', 1.7);
  poly(c, [[-9, -57], [4, -62], [6, -48], [-6, -46]], '#c0c1a5');
  line(c, [[-3, -50], [1, -50]], '#cbe9c3', 2.2); line(c, [[7, -50], [11, -51]], '#cbe9c3', 2.2);
  line(c, [[4, -38], [1, -29], [7, -22], [2, -15]], '#4f6b55', 2);
  if (m.active) line(c, [[4, -38], [1, -29], [7, -22], [2, -15]], `rgba(200,225,164,${m.wind * .8 + .1})`, 1.1);
  ellipse(c, -10, -35, 7, 3, '#607e4c'); ellipse(c, 8, -55, 5, 2, '#6f8954'); c.restore();
}

function bogling(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 9 + e.id) * 2 : 0;
  line(c, [[-5, -12], [-8 + step, -2]], '#455e40', 4); line(c, [[4, -11], [5 - step + m.strike * 4, -1]], '#485b39', 4);
  c.save(); c.rotate(m.strike * .2 - m.wind * .14);
  ellipse(c, 0, -19, 11, 13, '#75885a', '#38593e', 1.2);
  poly(c, [[-10, -24], [-2, -15], [-8, -8], [-14, -15]], '#6a7050');
  ellipse(c, 0, -31, 10, 8, '#90a568', '#3d5b38', 1.2);
  poly(c, [[-10, -35], [-15, -30], [-9, -27]], '#82965c', '#3f5a35', .9);
  poly(c, [[7, -34], [14, -32], [9, -27]], '#82965c', '#3f5a35', .9);
  for (const x of [-4, 4]) { ellipse(c, x, -32, 2.3, 1.5, '#ecdf9d'); ellipse(c, x + .6, -31.8, .8, 1, '#42513b'); }
  line(c, [[-3, -27], [3, -27]], '#526441', 1.1);
  // Mushroom hood, moss shoulders and a heavy wet club.
  c.beginPath(); c.moveTo(-13, -36); c.quadraticCurveTo(-6, -51, 6, -44); c.quadraticCurveTo(14, -42, 14, -36); c.quadraticCurveTo(1, -32, -13, -36); c.fillStyle = '#95734b'; c.fill(); c.strokeStyle = '#586045'; c.lineWidth = 1; c.stroke();
  for (const [x, y] of [[-4, -40], [5, -39], [1, -44]]) ellipse(c, x, y, 2.2, 1.1, '#bda26d');
  for (let i = 0; i < 4; i++) poly(c, [[-11 + i * 4, -21], [-12 + i * 4, -29], [-6 + i * 4, -24]], '#8a9b4d', '#4a6740', .6);
  line(c, [[8, -23], [13 + m.strike * 5, -18 - m.wind * 6]], '#83945c', 4);
  c.save(); c.translate(13 + m.strike * 5, -18 - m.wind * 6); c.rotate(weaponAngle(m, -1, -2.6, .7));
  line(c, [[-6, 0], [22, 0]], '#766647', 4); poly(c, [[10, -5], [21, -7], [28, -2], [28, 5], [15, 7]], '#7f7050', '#485740', 1.1);
  line(c, [[15, -5], [15, 5]], '#aaa177', 1); ellipse(c, 22, -5, 4, 2, '#61764a'); c.restore();
  c.restore();
}

function serpent(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const moving = e.blockedBy === null && !m.active, sway = moving ? Math.sin(time * 8 + e.id) : m.wind * -1;
  // Overlapping tapering coils avoid a flat line silhouette at the map scale.
  for (let i = 9; i >= 0; i--) {
    const x = 12 - i * 4.6, y = -8 + Math.sin(i * .8 + sway) * (4 - i * .2), r = Math.max(1.5, 6.8 - i * .5);
    ellipse(c, x, y, r, r * .7, i % 2 ? '#668b5b' : '#86a665', '#37583d', .7);
    line(c, [[x - 1.5, y - r * .6], [x + 1.5, y - r * .6]], '#c6bf78', 1);
  }
  c.save(); c.translate(m.strike * 5, -m.wind * 4);
  poly(c, [[8, -11], [8, -23], [14, -29], [24, -24], [29, -17], [27, -9], [18, -8]], '#8ba665', '#3f6744', 1.3);
  poly(c, [[16, -28], [24, -24], [29, -17], [23, -13], [16, -15]], '#c6c484');
  ellipse(c, 22, -21, 2.2, 1.6, '#ecd08a'); line(c, [[22, -22], [22, -20]], '#425140', 1);
  c.save(); c.translate(20, -10); c.rotate(m.wind * .2 + m.strike * .3);
  poly(c, [[-7, -1], [7, -1], [5, 3], [-5, 3]], '#4c7454', '#365740', .8);
  for (const x of [-3, 4]) poly(c, [[x, -2], [x + 1.6, 4], [x + 3, -2]], '#f3e4b9');
  if (m.active) { line(c, [[6, 0], [17, 1], [21, -1]], '#b26353', 1); line(c, [[17, 1], [21, 4]], '#b26353', .8); }
  c.restore(); c.restore();
}

function frostGuard(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 7 + e.id) * 2 : 0;
  c.scale(1.2, 1.2);
  for (const side of [-1, 1]) {
    const x = side * 6, stride = side * step + (side > 0 ? m.strike * 4 : -m.wind);
    line(c, [[x, -15], [x + stride, -2]], '#5b7180', 5);
    poly(c, [[x - 3, -12], [x + 3, -12], [x + stride + 3, -3], [x + stride - 3, -2]], '#b6c8cf', '#5a7687', .8);
    ellipse(c, x + stride, -1, 5, 2.2, '#536c77');
  }
  c.save(); c.rotate(m.strike * .11 - m.wind * .08);
  poly(c, [[-11, -33], [8, -31], [6, -8], [-15 - m.strike * 5, -8]], '#416d8b', '#34576c', 1);
  poly(c, [[-8, -32], [8, -32], [11, -18], [-9, -15]], '#b6c8ce', '#526f80', 1.3);
  poly(c, [[1, -31], [8, -32], [11, -18], [1, -16]], '#7392a3');
  line(c, [[-7, -20], [9, -20]], '#728daa', 2); poly(c, [[-4, -29], [1, -32], [6, -27], [1, -21]], '#89becd', '#d7e9e7', .9);
  for (const x of [-9, 9]) { poly(c, [[x - 5, -32], [x - 2, -38], [x + 5, -35], [x + 6, -29], [x + 1, -26]], '#cfdbd6', '#5a7b88', 1); poly(c, [[x - 1, -35], [x + 1, -42], [x + 4, -33]], '#a9d1e2', '#7298b1', .6); }
  ellipse(c, 0, -40, 8, 9, '#7b8fa5', '#4a687b', 1.1);
  poly(c, [[-9, -41], [-7, -50], [0, -55], [8, -49], [10, -40], [6, -32], [-6, -32]], '#bcced4', '#506f83', 1.2);
  poly(c, [[1, -53], [8, -49], [10, -40], [6, -32], [1, -32]], '#7d9cb0');
  line(c, [[-5, -41], [6, -41]], '#304c66', 2.3); line(c, [[-4, -41], [0, -41]], '#b9eef5', .9); line(c, [[3, -41], [6, -41]], '#b9eef5', .9);
  poly(c, [[-4, -52], [0, -65], [4, -53], [1, -47]], '#a7dce8', '#6d91ae', .8);
  line(c, [[-8, -30], [-13, -21 - m.wind * 5]], '#94b0b9', 4);
  poly(c, [[-20, -29 - m.wind * 5], [-9, -31 - m.wind * 5], [-6, -18 - m.wind * 5], [-14, -7 - m.wind * 5], [-22, -19 - m.wind * 5]], '#7199ae', '#d7e3cd', 1.3);
  line(c, [[-15, -27 - m.wind * 5], [-14, -12 - m.wind * 5]], '#d0ecef', 1.5);
  const hx = 14 + m.strike * 5, hy = -26 - m.wind * 6;
  line(c, [[8, -30], [hx, hy]], '#91aeb7', 4);
  c.save(); c.translate(hx, hy); c.rotate(weaponAngle(m, -1.05, -2.4, .6));
  line(c, [[-7, 0], [31, 0]], '#69818f', 3);
  poly(c, [[19, -3], [20, -13], [32, -16], [37, -9], [36, 7], [24, 11], [19, 3]], '#b1d0d8', '#587e95', 1.1);
  line(c, [[32, -14], [35, -8], [34, 6]], '#e7f7ee', 1.2); c.restore(); c.restore();
}

function imp(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 12 + e.id) * 2 : 0;
  const flap = Math.sin(time * 7 + e.id) * 2;
  for (const side of [-1, 1]) {
    poly(c, [[side * 6, -27], [side * 21, -35 - flap], [side * 19, -24], [side * 13, -25], [side * 15, -15], [side * 7, -19]], '#9e514c', '#613d39', 1);
    line(c, [[side * 8, -25], [side * 18, -30 - flap]], '#ce8966', .8);
    line(c, [[side * 4, -10], [side * 6 + side * step, -2]], '#a95c44', 3.5);
  }
  c.beginPath(); c.moveTo(-5, -10); c.bezierCurveTo(-22, 1, -27, -10, -21, -15); c.strokeStyle = '#af6748'; c.lineWidth = 2.5; c.stroke(); poly(c, [[-24, -16], [-16, -19], [-20, -11]], '#ce8654');
  c.save(); c.rotate(m.strike * .14 - m.wind * .11);
  ellipse(c, 0, -20, 8, 11, '#c88357', '#633f36', 1.2); poly(c, [[-5, -11], [6, -11], [8, -5], [-7, -5]], '#665448', '#453e32', .8);
  ellipse(c, 0, -33, 9, 9, '#bd7551', '#663f35', 1.1);
  poly(c, [[-7, -37], [-10, -48], [-3, -40]], '#cbb68c', '#72563e', .8);
  poly(c, [[6, -38], [11, -47], [9, -34]], '#cbb68c', '#72563e', .8);
  for (const x of [-3.5, 4]) { ellipse(c, x, -34, 2.3, 1.3, '#f7d377'); ellipse(c, x + .5, -34, .6, .9, '#75482e'); }
  line(c, [[-5, -29], [5, -28]], '#643f34', 1.3); for (const x of [-3, 2]) poly(c, [[x, -29], [x + 1, -26], [x + 2, -29]], '#efe0ae');
  const hx = 13 + m.strike * 4, hy = -23 - m.wind * 6;
  line(c, [[7, -24], [hx, hy]], '#c67e54', 3.5);
  const flicker = 1 + Math.sin(time * 15 + e.id) * .12;
  c.save(); c.shadowColor = '#f8b262'; c.shadowBlur = 8;
  poly(c, [[hx - 5, hy], [hx - 6, hy - 8], [hx - 2, hy - 4], [hx + 2, hy - 17 * flicker], [hx + 4, hy - 9], [hx + 8, hy - 3], [hx + 4, hy + 2]], '#edaa5f');
  poly(c, [[hx - 2, hy], [hx + 1, hy - 9], [hx + 4, hy]], '#ffe9a3'); c.restore(); c.restore();
}

function juggernaut(c: Ctx, e: Enemy, time: number, m: ReturnType<typeof pose>) {
  c.scale(1.45, 1.45);
  const step = e.blockedBy === null && !m.active ? Math.sin(time * 4 + e.id) * 1.3 : 0;
  for (const side of [-1, 1]) {
    const x = side * 8 + side * step; poly(c, [[side * 7 - 5, -19], [side * 7 + 6, -19], [x + 6, -3], [x - 5, -2]], '#61676c', '#3c454a', 1.3);
    line(c, [[x - 3, -11], [x + 4, -12]], '#bb7954', 1.5); ellipse(c, x, -1, 8, 3, '#414e51');
  }
  c.save(); c.rotate(m.strike * .13 - m.wind * .08);
  poly(c, [[-18, -40], [13, -40], [19, -23], [13, -12], [-13, -11], [-21, -24]], '#7a7970', '#3a4d4a', 1.6);
  poly(c, [[1, -40], [13, -40], [19, -23], [13, -12], [1, -12]], '#4d5b5b');
  poly(c, [[-7, -37], [4, -37], [7, -23], [-2, -15], [-10, -25]], '#955d49', '#c6a16d', 1.1);
  line(c, [[-5, -34], [2, -29], [-3, -26], [2, -20]], '#ec9c5e', 2);
  for (const side of [-1, 1]) {
    const x = side * 17;
    poly(c, [[x - 9, -40], [x - 4, -48], [x + 7, -45], [x + 11, -33], [x + 4, -27], [x - 9, -31]], '#8b8780', '#3f5150', 1.5);
    for (let i = 0; i < 2; i++) poly(c, [[x - 4 + i * 7, -43], [x - 5 + i * 7, -54 - i * 2], [x + i * 7, -44]], '#d0b98b', '#756c51', .8);
    line(c, [[x - 6, -39], [x + 7, -37]], '#c1a77c', 1);
  }
  poly(c, [[-10, -43], [-11, -56], [0, -63], [11, -55], [13, -44], [5, -37], [-7, -38]], '#7c807c', '#394e4d', 1.5);
  poly(c, [[2, -60], [11, -55], [13, -44], [5, -37], [2, -40]], '#4f6061');
  poly(c, [[-8, -52], [-16, -58], [-17, -70], [-12, -62], [-6, -60]], '#d1b28a', '#685d47', 1);
  poly(c, [[8, -54], [18, -60], [20, -69], [22, -55], [11, -46]], '#ba9a70', '#685d47', 1);
  line(c, [[-7, -48], [-1, -47]], '#f1b36d', 2.3); line(c, [[4, -47], [9, -49]], '#f1b36d', 2.3);
  line(c, [[0, -44], [0, -39]], '#bb946b', 1); line(c, [[-4, -39], [5, -39]], '#384e4b', 2);
  line(c, [[-18, -35], [-22 - m.wind * 5, -18 - m.wind * 9]], '#73807a', 9);
  poly(c, [[-29 - m.wind * 5, -25 - m.wind * 9], [-17 - m.wind * 5, -25 - m.wind * 9], [-15 - m.wind * 5, -14 - m.wind * 9], [-25 - m.wind * 5, -12 - m.wind * 9]], '#929483', '#4a6158', 1.2);
  const hx = 21 + m.strike * 4, hy = -32 - m.wind * 10;
  line(c, [[17, -36], [hx, hy]], '#73837b', 8);
  c.save(); c.translate(hx, hy); c.rotate(weaponAngle(m, -.95, -2.2, .85));
  line(c, [[-6, 0], [38, 0]], '#8f7760', 5);
  poly(c, [[23, -12], [44, -14], [49, -7], [49, 8], [43, 13], [24, 11]], '#7c827b', '#374e4d', 1.4);
  poly(c, [[24, -12], [44, -14], [44, -6], [24, -4]], '#a5aa91');
  line(c, [[27, -3], [35, 1], [33, 7], [41, 8]], '#e9a362', 2); c.restore(); c.restore();
}

export function drawEnemy(c: Ctx, e: Enemy, time: number, selected: boolean) {
  if (e.hp <= 0) return;
  const basicPose = pose(e, attackDuration[e.kind]), cast = e.bossCast;
  const charge = cast ? clamp(1 - cast.remaining / cast.duration) : 0;
  const recovery = clamp((e.bossRecover ?? 0) / .8);
  const m = cast ? { ...basicPose, active: true, p: .10 + charge * .12, wind: ease(.35 + charge * .65), strike: 0, recovery: 0 }
    : recovery > 0 ? { ...basicPose, active: true, p: .62 + (1 - recovery) * .38, wind: 0, strike: recovery * .5, recovery: 1 - recovery }
    : basicPose;
  const larger = e.kind === 'golem' || e.kind === 'chieftain' || e.kind === 'juggernaut';
  const fx = e.facingX ?? 1, fy = e.facingY ?? 0;
  const direction = fx < -.06 ? -1 : 1;
  const walking = !m.active && e.blockedBy === null && !(e.rootTimer && e.rootTimer > 0);
  const heavy = e.kind === 'golem' || e.kind === 'juggernaut', canine = e.kind === 'wolf' || e.kind === 'icewolf';
  const bob = walking ? Math.sin(time * (heavy ? 5 : 9) + e.id) * (heavy ? .6 : 1) : 0;
  const lunge = m.strike * (canine || e.kind === 'serpent' ? 19 : heavy ? 6 : larger ? 10 : 7);
  c.save(); c.translate(e.x, e.y);
  shadow(c, 0, 0, larger || canine || e.kind === 'serpent' ? 25 : 15, .2);
  if (selected) ellipse(c, 0, 2, larger ? 29 : 21, larger ? 10 : 7, 'rgba(227,161,90,.08)', '#edbe83', 1.8);
  c.translate(fx * lunge - fx * m.hit * 3, fy * lunge * .6 + bob + m.hit * 1.2);
  c.scale(direction, 1); c.globalAlpha *= 1 - m.hit * .16;
  if (canine) wolf(c, e, time, m);
  else if (e.kind === 'golem') golem(c, e, time, m);
  else if (e.kind === 'bogling') bogling(c, e, time, m);
  else if (e.kind === 'serpent') serpent(c, e, time, m);
  else if (e.kind === 'frostguard') frostGuard(c, e, time, m);
  else if (e.kind === 'imp') imp(c, e, time, m);
  else if (e.kind === 'juggernaut') juggernaut(c, e, time, m);
  else humanoid(c, e, time, m);
  c.restore();
  if (cast) {
    const y = e.y - (e.kind === 'juggernaut' ? 126 : 103), width = 54;
    c.save();
    const flicker = .55 + Math.sin(time * (5 + charge * 8)) * .14;
    c.globalAlpha = flicker;
    ellipse(c, e.x, e.y - (e.kind === 'juggernaut' ? 66 : 45), larger ? 31 : 23, 37, 'rgba(250,133,61,.07)', '#efbd7c', 1.3);
    c.globalAlpha = 1;
    round(c, e.x - width / 2 - 1, y - 1, width + 2, 8, 3, '#482f29', '#e4b077', .9);
    round(c, e.x - width / 2, y, Math.max(.01, width * charge), 5, 2, charge > .8 ? '#ffe3a5' : '#e99761');
    c.textAlign = 'center'; c.font = 'bold 10px "Noto Sans SC", sans-serif'; c.lineWidth = 3; c.strokeStyle = '#44352a'; c.fillStyle = '#ffe5ba';
    c.strokeText('蓄力重击', e.x, y - 6); c.fillText('蓄力重击', e.x, y - 6);
    c.restore();
  }
  if ((e.armorBreakTimer ?? 0) > 0) {
    c.save(); c.translate(e.x + (larger ? 24 : 17), e.y - 22);
    poly(c, [[-5, -7], [5, -7], [5, 0], [0, 5], [-5, 0]], 'rgba(186,141,83,.65)', '#f2d69b', 1);
    line(c, [[-3, -5], [1, -2], [-2, 0], [2, 3]], '#533f31', 1.4); c.restore();
  }
  if ((e.rootTimer ?? 0) > 0) {
    c.save(); c.translate(e.x, e.y);
    ellipse(c, 0, 2, larger ? 26 : 18, larger ? 9 : 6, 'rgba(103,150,64,.20)', '#b5d485', 1.5);
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * 15, 3); c.bezierCurveTo(side * 31, -12, side * 7, -9, side * 13, -28);
      c.strokeStyle = '#536e3d'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#b6cf7a'; c.lineWidth = 1.5; c.stroke();
      poly(c, [[side * 13, -12], [side * 22, -18], [side * 15, -22]], '#c5da88', '#647742', .6);
    }
    c.restore();
  } else if (e.slowTimer > 0) {
    ellipse(c, e.x, e.y + 2, larger ? 24 : 17, larger ? 8 : 5, 'rgba(143,206,223,.14)', 'rgba(196,241,245,.85)', 1.3);
    for (let i = 0; i < 3; i++) {
      const a = time * .7 + i * TAU / 3, x = e.x + Math.cos(a) * 18, y = e.y - 14 + Math.sin(a) * 6;
      line(c, [[x - 2, y - 3], [x + 2, y + 3]], '#bde5e5', 1); line(c, [[x + 2, y - 3], [x - 2, y + 3]], '#bde5e5', 1);
    }
  }
  if (e.hp < e.maxHp || selected) {
    const height = e.kind === 'juggernaut' ? 110 : e.kind === 'frostguard' ? 86 : e.kind === 'serpent' ? 39 : e.kind === 'imp' ? 60 : e.kind === 'golem' ? 74 : e.kind === 'chieftain' ? 88 : canine ? 43 : e.kind === 'shaman' ? 66 : e.kind === 'orc' ? 61 : 51;
    health(c, e.x, e.y - height, e.hp / e.maxHp, '#c3835b', larger ? 39 : 27);
  }
}

function sparks(c: Ctx, x: number, y: number, p: number, color: string, count = 7, size = 1) {
  const fade = 1 - clamp(p);
  c.save(); c.globalAlpha *= fade;
  for (let i = 0; i < count; i++) {
    const angle = i * TAU / count + .34, radius = (5 + p * (14 + i % 3 * 6)) * size;
    const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius - p * 8;
    line(c, [[px - Math.cos(angle) * (3 - p * 2) * size, py - Math.sin(angle) * (3 - p * 2) * size], [px, py]], i % 2 ? '#fff0b5' : color, 1.8 * size);
  }
  c.restore();
}

function projectile(c: Ctx, e: Effect, p: number, magic: boolean) {
  const sniper = e.style === 'arrow-deadeye', snare = e.style === 'arrow-snare', overload = e.style === 'mage-overload';
  const tint = overload ? '#dc9ff8' : snare ? '#b6e38f' : sniper ? '#ffe7a1' : '#93e8dd';
  const tx = e.toX ?? e.x, ty = (e.toY ?? e.y) - 18;
  const build = magic ? .16 : 0, arrive = magic ? .77 : .80;
  const q = clamp((p - build) / (arrive - build));
  const bend = magic ? Math.sin(q * Math.PI) * 12 : Math.sin(q * Math.PI) * 24;
  const x = mix(e.x, tx, q), y = mix(e.y, ty, q) - bend;
  const angle = Math.atan2(ty - e.y - Math.cos(q * Math.PI) * (magic ? 12 : 24), tx - e.x);
  if (p < arrive) {
    if (magic) {
      c.save(); c.globalCompositeOperation = 'screen';
      const radius = (p < build ? mix(2, 6, p / build) : 5) * (overload ? 1.7 : 1);
      c.shadowColor = tint; c.shadowBlur = overload ? 18 : 9;
      if (q > 0) {
        line(c, [[x - Math.cos(angle) * 30, y - Math.sin(angle) * 30], [x, y]], 'rgba(117,190,220,.35)', 7);
        line(c, [[x - Math.cos(angle) * 24, y - Math.sin(angle) * 24], [x, y]], overload ? '#c099f6' : '#85d7e3', overload ? 5 : 3);
      }
      ellipse(c, x, y, radius + 3, radius + 3, 'rgba(132,179,238,.3)');
      ellipse(c, x, y, radius, radius, overload ? '#d6b9fa' : '#b4e7e1'); ellipse(c, x - 1, y - 1, radius * .45, radius * .45, '#edffe8');
      if (overload) {
        arc(c, x, y, radius + 5, p * 16, p * 16 + 4.5, '#f4d5ff', 1.3);
        arc(c, x, y, radius + 8, -p * 12, -p * 12 + 3.5, '#f9e9ff', 1);
      }
      c.restore();
    } else {
      c.save(); c.translate(x, y); c.rotate(angle);
      if (sniper || snare) { c.shadowColor = tint; c.shadowBlur = sniper ? 11 : 6; }
      line(c, [[sniper ? -51 : -27, 0], [-10, 0]], snare ? '#a0d975' : sniper ? '#f5d891' : 'rgba(236,212,150,.4)', sniper ? 3.5 : 2.2);
      line(c, [[-15, 0], [4, 0]], '#846744', 1.8);
      poly(c, [[sniper ? 9 : 6, 0], [0, -3], [0, 3]], snare ? '#cdeba2' : '#ece8c4', '#63715a', .7);
      line(c, [[-11, 0], [-17, -3], [-14, 0], [-17, 3]], '#e0cd97', 1.3); c.restore();
    }
  } else {
    const impact = clamp((p - arrive) / (1 - arrive));
    c.globalAlpha *= 1 - impact;
    if (magic) {
      const blast = overload ? 1.8 : 1;
      ellipse(c, tx, ty, (8 + impact * 18) * blast, (8 + impact * 18) * blast, overload ? 'rgba(170,112,233,.18)' : 'rgba(122,210,218,.13)', overload ? '#dab8f8' : '#b0eee4', 2.6 * (1 - impact) + .8);
      ellipse(c, tx, ty, (4 + impact * 8) * blast, (4 + impact * 8) * blast, '#e5ffe7');
    } else if (sniper) {
      const r = 12 + impact * 27;
      ellipse(c, tx, ty, r, r, 'transparent', '#ffe4a0', 1.6);
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4; line(c, [[tx + Math.cos(a) * 8, ty + Math.sin(a) * 8], [tx + Math.cos(a) * r, ty + Math.sin(a) * r]], '#fff3c6', 2.5);
      }
    } else if (snare) {
      for (let i = 0; i < 3; i++) arc(c, tx, ty + 11, 8 + i * 6 + impact * 8, i * 1.8 + impact, i * 1.8 + impact + 3.4, '#b4d78b', 2);
    }
    sparks(c, tx, ty, impact, magic || sniper || snare ? tint : '#e8c38b', overload ? 12 : magic ? 8 : 5, overload ? 1.7 : magic ? 1.1 : .8);
  }
}

function slash(c: Ctx, e: Effect, p: number) {
  const hero = e.style === 'hero', wolf = e.style === 'wolf' || e.style === 'icewolf', shaman = e.style === 'shaman' || e.style === 'imp', golem = e.style === 'golem' || e.style === 'juggernaut';
  // Animation timing matches the body pose. The slash survives its target being removed.
  if (p < .22 || p > .78) return;
  const strike = clamp((p - .22) / .26), fade = 1 - ease((p - .48) / .30);
  const tx = e.toX ?? e.x + 25, ty = e.toY ?? e.y;
  const angle = Math.atan2(ty - e.y, tx - e.x), centerY = e.y - (hero ? 30 : 22);
  const radius = hero ? 52 : e.style === 'chieftain' || e.style === 'juggernaut' ? 43 : e.style === 'orc' || e.style === 'frostguard' ? 33 : 25;
  c.globalAlpha *= fade * (hero ? .88 : .72);
  if (golem) {
    ellipse(c, tx, ty, 10 + strike * 30, (10 + strike * 30) * .45, 'rgba(211,205,160,.1)', '#c6be8c', 3 * (1 - strike) + 1);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5, x = tx + Math.cos(a) * (10 + strike * 19), y = ty + Math.sin(a) * (5 + strike * 10) - Math.sin(strike * Math.PI) * 8;
      poly(c, [[x - 3, y], [x, y - 5], [x + 4, y - 2], [x + 1, y + 3]], '#aaa98b', '#60715a', .6);
    }
  } else if (shaman) {
    const fromX = e.x + Math.cos(angle) * 17, fromY = centerY - 14;
    const color = e.style === 'imp' ? '#f1b779' : '#c0a0df';
    line(c, [[fromX, fromY], [mix(fromX, tx, .5) + 3, mix(fromY, ty - 18, .5) - 6], [tx, ty - 18]], color, 4 * (1 - strike) + 1.3);
    ellipse(c, tx, ty - 18, 6 + strike * 10, 6 + strike * 10, 'rgba(196,168,230,.08)', color, 1.5);
  } else if (wolf || e.style === 'goblin' || e.style === 'serpent') {
    const length = 14 + strike * 14;
    line(c, [[tx - Math.cos(angle) * length, ty - 18 - Math.sin(angle) * length], [tx + Math.cos(angle) * 6, ty - 18 + Math.sin(angle) * 6]], wolf ? '#f0dda8' : '#dedcb6', wolf ? 3 : 2.5);
    if (wolf) for (let i = -1; i <= 1; i++) line(c, [[tx - 9, ty - 21 + i * 4], [tx + 7, ty - 15 + i * 4]], '#ead6a4', 1.2);
  } else {
    const start = angle - 1.65, end = start + .7 + ease(strike) * 2.7;
    if (hero) {
      const alternate = (e.attackVariant ?? 0) % 2 === 1;
      const tilt = Math.sin(angle) * .25;
      const bladeStart = (alternate ? .8 : -2.5) + tilt;
      const bladeEnd = mix(bladeStart, (alternate ? -1.85 : .5) + tilt, ease(strike));
      const trim = alternate ? -.08 : .08;
      c.save(); c.translate(e.x + Math.cos(angle) * 8, centerY); c.scale(Math.cos(angle) < 0 ? -1 : 1, 1);
      arc(c, 0, 0, radius, bladeStart, bladeEnd, 'rgba(83,175,145,.25)', 15);
      arc(c, 0, 0, radius, bladeStart, bladeEnd, '#8ddab7', 6.2);
      arc(c, 0, 0, radius + 4, bladeStart + trim, bladeEnd, '#f0d895', 2);
      arc(c, 0, 0, radius - 2, bladeStart + trim * 1.5, bladeEnd, '#edffde', 1.2); c.restore();
    } else {
      arc(c, e.x, centerY, radius, start, end, e.color ?? '#e8cc98', 4.5);
      arc(c, e.x, centerY, radius - 2, start + .13, end, '#f6e6b5', 1.1);
    }
  }
}

function heroBurst(c: Ctx, e: Effect, p: number) {
  const expansion = ease(p / .48), fade = 1 - ease((p - .48) / .52), r = mix(19, 115, expansion);
  c.globalAlpha *= fade;
  const glow = c.createRadialGradient(e.x, e.y - 9, 4, e.x, e.y - 9, r);
  glow.addColorStop(0, 'rgba(236,230,164,.19)'); glow.addColorStop(.55, 'rgba(86,168,131,.15)'); glow.addColorStop(1, 'rgba(99,180,135,0)');
  ellipse(c, e.x, e.y - 9, r, r, glow);
  ellipse(c, e.x, e.y, r, r * .72, 'transparent', '#acd9a1', 3 * (1 - p) + .8);
  ellipse(c, e.x, e.y, Math.max(3, r - 8), Math.max(3, (r - 8) * .72), 'transparent', 'rgba(226,218,153,.68)', 1.2);
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16 + p * .25, x = e.x + Math.cos(a) * (r - 4), y = e.y + Math.sin(a) * (r - 4) * .72;
    c.save(); c.translate(x, y); c.rotate(a);
    line(c, [[-3, -3], [2, 0], [-3, 3]], '#e5dea3', 1.4); line(c, [[-1, -4], [-1, 4]], '#dcdfa7', .8); c.restore();
  }
  for (let i = 0; i < 3; i++) {
    const q = clamp((p - .10 - i * .09) / .48);
    if (q <= 0 || q >= 1) continue;
    c.save(); c.globalAlpha *= Math.sin(q * Math.PI) * .9;
    const radius = 39 + i * 24, angle = -.6 + i * 1.8 + q * 2.4;
    arc(c, e.x, e.y - 24, radius, angle - 1.6, angle + .5, '#6fcda8', 8 - q * 4);
    arc(c, e.x, e.y - 24, radius + 3, angle - 1.45, angle + .5, '#f4dfa3', 2.2);
    arc(c, e.x, e.y - 24, radius - 2, angle - 1.2, angle + .5, '#eaffd5', 1); c.restore();
  }
  for (let i = 0; i < 10; i++) {
    const angle = i * TAU / 10 + .45, distance = 15 + expansion * (55 + i % 3 * 16);
    const x = e.x + Math.cos(angle) * distance, y = e.y + Math.sin(angle) * distance * .72 - p * 13;
    c.save(); c.translate(x, y); c.rotate(angle + p * 1.2); c.globalAlpha *= .85;
    c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(0, -5, 6, 0); c.quadraticCurveTo(0, 4, -5, 0);
    c.fillStyle = i % 2 ? '#c7d99a' : '#7fb98c'; c.fill(); line(c, [[-3, 0], [4, 0]], '#e4e7ab', .7); c.restore();
  }
  sparks(c, e.x, e.y - 26, p, '#c9ecb1', 8, 1.7);
}

function chainLightning(c: Ctx, e: Effect, p: number) {
  const points = e.points ?? [{ x: e.x, y: e.y }, { x: e.toX ?? e.x, y: e.toY ?? e.y }];
  const fade = 1 - ease((p - .65) / .35);
  c.globalAlpha *= fade; c.shadowColor = '#a8dbff'; c.shadowBlur = 10;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i], start = .05 + (i - 1) * .1;
    const amount = ease((p - start) / .12);
    if (amount <= 0) continue;
    const y0 = from.y - (i === 1 ? 0 : 18), y1 = to.y - 18;
    const dx = to.x - from.x, dy = y1 - y0, length = Math.max(1, Math.hypot(dx, dy));
    const segments: number[][] = [[from.x, y0]];
    for (let j = 1; j <= 7; j++) {
      const q = j / 7 * amount, jitter = j === 7 ? 0 : Math.sin(e.id * 2.7 + j * 5.3 + Math.floor(p * 13)) * 7;
      segments.push([mix(from.x, to.x, q) - dy / length * jitter, mix(y0, y1, q) + dx / length * jitter]);
    }
    line(c, segments, 'rgba(120,173,242,.45)', 9 - i * .6);
    line(c, segments, '#afd8f8', 3.8 - i * .35); line(c, segments, '#f1fdff', 1.25);
    if (amount > .8) {
      ellipse(c, to.x, y1, 9 + Math.sin(p * 18) * 2, 9 + Math.sin(p * 18) * 2, 'rgba(174,209,255,.16)', '#d4e8ff', 1.4);
      sparks(c, to.x, y1, clamp((p - start - .1) / .7), '#afceff', 5, .8);
    }
  }
}

function moonDash(c: Ctx, e: Effect, p: number) {
  const tx = e.toX ?? e.x, ty = e.toY ?? e.y;
  const dx = tx - e.x, dy = ty - e.y, direction = dx < 0 ? -1 : 1;
  const advance = ease((p - .08) / .47), fade = 1 - ease((p - .64) / .36);
  const x = mix(e.x, tx, advance), y = mix(e.y, ty, advance);
  c.globalAlpha *= fade;
  c.save(); c.globalCompositeOperation = 'screen'; c.shadowColor = '#b5edd7'; c.shadowBlur = 12;
  line(c, [[e.x, e.y - 29], [x, y - 29]], 'rgba(120,207,177,.14)', (e.radius ?? 48) * .9);
  for (let i = 0; i < 3; i++) {
    const shift = (i - 1) * 12;
    line(c, [[e.x, e.y - 30 + shift], [x, y - 30 + shift]], i === 1 ? '#d5f8d6' : 'rgba(122,215,190,.65)', i === 1 ? 2.4 : 1.2);
  }
  c.restore();
  for (let i = 1; i <= 4; i++) {
    const q = Math.max(0, advance - i * .13);
    if (q <= 0) continue;
    c.save(); c.globalAlpha *= .32 * (1 - i / 5); c.translate(mix(e.x, tx, q), mix(e.y, ty, q)); c.scale(direction * 1.4, 1.4);
    poly(c, [[-7, -29], [7, -26], [7, -8], [-24, -8], [-29, -20]], '#9cdac5');
    poly(c, [[-7, -29], [6, -28], [8, -12], [-6, -12]], '#d5eabc'); ellipse(c, 0, -35, 7, 9, '#c1e8c9');
    line(c, [[-2, -10], [5, -2]], '#bfedd2', 4); line(c, [[7, -23], [28, -33]], '#f3edb4', 3);
    poly(c, [[9, -25], [28, -38], [38, -39], [31, -33]], '#eaffd7'); c.restore();
  }
  if (p > .1) {
    const blade = Math.atan2(dy, dx), sweep = ease((p - .1) / .5);
    arc(c, x, y - 26, 51, blade - 1.7, blade - 1.7 + sweep * 3.5, 'rgba(97,205,170,.26)', 16);
    arc(c, x, y - 26, 53, blade - 1.7, blade - 1.7 + sweep * 3.5, '#b3eed0', 6);
    arc(c, x, y - 26, 57, blade - 1.6, blade - 1.6 + sweep * 3.4, '#f4e5af', 1.7);
  }
  if (p > .54) sparks(c, tx, ty - 26, clamp((p - .54) / .46), '#bde8c1', 10, 1.6);
}

/** Sustained areas grow quickly, then breathe quietly so combat remains readable. */
function skillDomain(c: Ctx, e: Effect, p: number) {
  const elapsed = e.maxLife - e.life, open = ease(elapsed / .35), fade = ease(e.life / .65);
  const frost = e.type === 'frost-zone', oath = e.type === 'oath';
  const radius = (e.radius ?? (oath ? 165 : frost ? 85 : 105)) * (.88 + open * .12);
  const color = frost ? '#c5eff3' : oath ? '#e0df9d' : '#bbd68a';
  const pulse = .78 + Math.sin(elapsed * 3) * .12;
  c.globalAlpha *= open * fade;
  ellipse(c, e.x, e.y, radius, radius, frost ? 'rgba(150,217,231,.11)' : oath ? 'rgba(218,228,136,.075)' : 'rgba(112,155,76,.09)', color, .9);
  ellipse(c, e.x, e.y, radius - 8, (radius - 8) * .78, 'transparent', frost ? 'rgba(173,225,239,.4)' : 'rgba(194,218,144,.36)', 1.3);
  if (frost) {
    for (let i = 0; i < 10; i++) {
      const angle = i * TAU / 10 + .22, r = radius * (.35 + i % 3 * .25);
      const x = e.x + Math.cos(angle) * r, y = e.y + Math.sin(angle) * r * .82, height = (8 + i % 3 * 7) * open;
      poly(c, [[x - 5, y], [x - 1, y - height], [x + 6, y - height * .3], [x + 5, y + 3]], '#91c3d1', '#d6f2ef', .9);
      poly(c, [[x - 1, y - height], [x + 2, y - 1], [x + 6, y - height * .3]], '#d2ebef');
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3 + elapsed * .2, r = 15 + i * 9;
      const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r - (elapsed * 11 + i * 13) % 35;
      line(c, [[x - 3, y], [x + 3, y]], '#e2f9f7', 1); line(c, [[x, y - 3], [x, y + 3]], '#e2f9f7', 1);
    }
  } else if (oath) {
    c.save(); c.globalAlpha *= pulse;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + elapsed * .05, x = e.x + Math.cos(a) * (radius - 12), y = e.y + Math.sin(a) * (radius - 12);
      line(c, [[x - 3, y - 4], [x, y - 8], [x + 3, y - 4]], '#e0dfa3', 1.4);
      line(c, [[x, y - 8], [x, y + 3]], '#d4e7ac', 1.2);
    }
    c.restore();
    // The ancient tree is a translucent crest behind the hero, with roots joining its rune circle.
    c.save(); c.globalAlpha *= .23 * pulse;
    line(c, [[e.x - 30, e.y + 8], [e.x - 8, e.y - 15], [e.x, e.y - 82], [e.x + 6, e.y - 18], [e.x + 31, e.y + 8]], '#e2e3ac', 5);
    for (const side of [-1, 1]) {
      line(c, [[e.x, e.y - 38], [e.x + side * 31, e.y - 60], [e.x + side * 48, e.y - 67]], '#d7e9b7', 4);
      line(c, [[e.x, e.y - 65], [e.x + side * 22, e.y - 87], [e.x + side * 30, e.y - 104]], '#d7e9b7', 3);
      for (let i = 0; i < 3; i++) ellipse(c, e.x + side * (15 + i * 16), e.y - 89 + i * 12, 20, 10, '#b9d9a0');
    }
    c.restore();
  } else {
    for (let i = 0; i < 8; i++) {
      const angle = i * TAU / 8 + .13, x = e.x + Math.cos(angle) * radius * .82, y = e.y + Math.sin(angle) * radius * .82;
      c.save(); c.translate(x, y); c.rotate(angle + Math.PI / 2);
      const rise = 13 * open + Math.sin(elapsed * 2 + i) * 1.5;
      c.beginPath(); c.moveTo(-11, 5); c.bezierCurveTo(-6, -rise, 4, 3, 12, -rise * .6);
      c.strokeStyle = '#536d3c'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#b8d18a'; c.lineWidth = 1.4; c.stroke();
      poly(c, [[-4, -rise * .5], [-10, -rise - 4], [0, -rise * .5 - 2]], '#aec979');
      poly(c, [[7, -rise * .3], [13, -rise - 1], [10, -rise * .2]], '#d3df9b'); c.restore();
    }
  }
}

function advancedRing(c: Ctx, e: Effect, p: number) {
  const radius = e.radius ?? (e.style === 'arrow-volley' ? 70 : e.style === 'barracks-mend' ? 95 : 48);
  c.globalAlpha *= Math.sin(Math.min(1, p / .12) * Math.PI / 2) * (1 - ease((p - .58) / .42));
  if (e.style === 'barracks-cleave') {
    for (let i = 0; i < 3; i++) {
      const angle = i * TAU / 3 + p * TAU * 1.6;
      arc(c, e.x, e.y - 18, radius * (.68 + p * .32), angle, angle + 1.4, 'rgba(235,221,160,.2)', 12);
      arc(c, e.x, e.y - 18, radius * (.68 + p * .32) + 2, angle, angle + 1.4, '#eae6ba', 3.5);
      arc(c, e.x, e.y - 18, radius * (.68 + p * .32) + 5, angle + .18, angle + 1.4, '#fcf5d4', 1);
    }
  } else if (e.style === 'arrow-volley') {
    ellipse(c, e.x, e.y, radius * (.7 + p * .3), radius * (.7 + p * .3), 'rgba(210,220,137,.04)', '#e7d494', 1.2);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, x = e.x + Math.cos(a) * radius * .55, y = e.y + Math.sin(a) * radius * .55;
      sparks(c, x, y - 17, p, '#f1dda6', 3, .8);
    }
  } else if (e.style === 'barracks-fortify') {
    ellipse(c, e.x, e.y, radius * (.65 + p * .35), radius * (.65 + p * .35) * .65, 'rgba(171,208,188,.05)', '#d6e5c4', 2);
    for (let i = 0; i < 5; i++) {
      const angle = i * TAU / 5 + .4, x = e.x + Math.cos(angle) * radius * .72, y = e.y + Math.sin(angle) * radius * .5 - p * 20;
      poly(c, [[x - 7, y - 9], [x + 7, y - 9], [x + 7, y + 1], [x, y + 8], [x - 7, y + 1]], '#6f9a8a', '#e9dfae', 1.4);
      line(c, [[x, y - 6], [x, y + 3]], '#f1e5bb', 1.2); line(c, [[x - 4, y - 1], [x + 4, y - 1]], '#f1e5bb', 1.2);
    }
  } else {
    ellipse(c, e.x, e.y, radius * (.85 + p * .15), radius * (.85 + p * .15), 'rgba(149,198,107,.05)', '#bbd58f', 1.3);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.2, x = e.x + Math.cos(a) * radius * .65, y = e.y + Math.sin(a) * radius * .65 - p * 26;
      line(c, [[x - 3, y], [x + 3, y]], '#e3eab6', 1.8); line(c, [[x, y - 3], [x, y + 3]], '#e3eab6', 1.8);
    }
  }
}

function cannonShell(c: Ctx, e: Effect, p: number) {
  if (p >= .84) return;
  const q = p / .84, tx = e.toX ?? e.x, ty = e.toY ?? e.y, dx = tx - e.x, dy = ty - e.y;
  const height = Math.min(98, 34 + Math.hypot(dx, dy) * .16), bend = Math.sin(q * Math.PI) * height;
  const x = mix(e.x, tx, q), y = mix(e.y, ty, q) - bend;
  const cluster = e.style === 'cannon-cluster', pierce = e.style === 'cannon-pierce';
  const angle = Math.atan2(dy - Math.cos(q * Math.PI) * Math.PI * height, dx);
  ellipse(c, mix(e.x, tx, q), mix(e.y + 28, ty, q), 6 + Math.sin(q * Math.PI) * 4, 2, 'rgba(47,45,31,.18)');
  for (let i = 4; i >= 1; i--) {
    const r = Math.max(0, q - i * .045), px = mix(e.x, tx, r), py = mix(e.y, ty, r) - Math.sin(r * Math.PI) * height;
    ellipse(c, px, py, 2.6 + i * .8, 2 + i * .7, `rgba(230,214,173,${.23 - i * .035})`);
  }
  c.save(); c.translate(x, y); c.rotate(angle);
  if (pierce) {
    poly(c, [[-8, -4], [1, -5], [9, 0], [1, 5], [-8, 4]], '#a4bec6', '#475e67', 1.1);
    line(c, [[-4, -3], [1, -3], [6, 0]], '#e4e9d4', .9); line(c, [[-20, 0], [-8, 0]], '#f3d89c', 2);
  } else {
    ellipse(c, 0, 0, cluster ? 7 : 5.5, cluster ? 7 : 5.5, cluster ? '#7c6754' : '#4b636b', '#c8c799', 1.1);
    ellipse(c, -1.5, -2, 2, 1.4, '#a6b9b1');
    if (cluster) { line(c, [[-4, -4], [4, 4]], '#caaa78', 1); line(c, [[-4, 4], [4, -4]], '#caaa78', 1); }
  }
  line(c, [[-6, 1], [-11, 4]], '#dac58f', 1.2); ellipse(c, -12, 4, 1.4, 1.4, '#ffcd79'); c.restore();
}

function cannonExplosion(c: Ctx, e: Effect, p: number) {
  const elapsed = p * e.maxLife, delay = e.style === 'imp' ? 0 : .378;
  if (elapsed < delay) return;
  const q = clamp((elapsed - delay) / Math.max(.1, e.maxLife - delay));
  const cluster = e.style === 'cannon-cluster', pierce = e.style === 'cannon-pierce';
  const radius = e.radius ?? 58, fade = 1 - ease((q - .35) / .65), expand = ease(q / .4);
  c.globalAlpha *= fade;
  ellipse(c, e.x, e.y, radius * (.25 + expand * .75), radius * (.16 + expand * .5), 'rgba(218,125,65,.07)', pierce ? '#d9ded0' : '#f4ce8d', 3.8 * (1 - q) + .6);
  for (let i = 0; i < 7; i++) {
    const angle = i * TAU / 7 + e.id, r = 8 + expand * radius * .33;
    const x = e.x + Math.cos(angle) * r, y = e.y + Math.sin(angle) * r * .55 - q * 28;
    const size = (10 + i % 3 * 5) * (1 + expand * .35);
    ellipse(c, x, y, size, size * .82, q < .33 ? i % 2 ? '#efb56e' : '#f4cd85' : `rgba(${pierce ? '130,147,151' : '112,116,104'},.24)`);
    if (q < .35) ellipse(c, x, y + 2, size * .5, size * .48, '#fff0b4');
  }
  if (q < .3) {
    c.save(); c.globalAlpha *= 1 - q / .3;
    const glow = c.createRadialGradient(e.x, e.y - 8, 0, e.x, e.y - 8, radius);
    glow.addColorStop(0, 'rgba(255,238,174,.65)'); glow.addColorStop(.45, 'rgba(235,175,96,.23)'); glow.addColorStop(1, 'rgba(222,130,70,0)');
    c.fillStyle = glow; c.fillRect(e.x - radius, e.y - radius - 8, radius * 2, radius * 2); c.restore();
  }
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 + .3, distance = (8 + q * radius) * (i % 3 ? .75 : 1);
    const x = e.x + Math.cos(a) * distance, y = e.y + Math.sin(a) * distance * .6 - Math.sin(q * Math.PI) * (15 + i % 3 * 8);
    poly(c, [[x - 2, y], [x, y - 4], [x + 3, y - 1], [x + 2, y + 2]], i % 2 ? '#b09367' : '#5d7067', '#3f554a', .5);
  }
  if (cluster) for (let i = 0; i < 5; i++) {
    const start = .18 + i * .045, sub = clamp((q - start) / .55);
    if (q < start) continue;
    const a = i * TAU / 5 + .25, x = e.x + Math.cos(a) * radius * .72, y = e.y + Math.sin(a) * radius * .47;
    c.save(); c.globalAlpha *= 1 - sub;
    ellipse(c, x, y, 8 + sub * 13, 7 + sub * 10, sub < .35 ? '#f3bf7c' : 'rgba(125,133,114,.17)', '#f4d494', 1.3);
    sparks(c, x, y - 3, sub, '#edc384', 5, .8); c.restore();
  }
  sparks(c, e.x, e.y - 7, q, '#f8d69a', cluster ? 16 : 11, radius / 53);
}

function quake(c: Ctx, e: Effect, p: number) {
  const radius = e.radius ?? 100, advance = ease((p - .12) / .65);
  if (p < .12) return;
  c.globalAlpha *= 1 - ease((p - .6) / .4);
  for (let i = 0; i < 3; i++) { const r = radius * clamp(advance - i * .18); if (r > 1) ellipse(c, e.x, e.y, r, r * .66, 'transparent', i % 2 ? '#d8c296' : '#e5ac76', 2.3 - i * .4); }
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + e.id * .3, r = radius * .65 * advance;
    const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r * .65;
    line(c, [[e.x + Math.cos(a) * 13, e.y + Math.sin(a) * 8], [x - Math.sin(a) * 6, y + Math.cos(a) * 4], [x, y]], '#6e7757', 1.4);
    poly(c, [[x - 4, y], [x - 1, y - 7 * Math.sin(p * Math.PI)], [x + 5, y - 2], [x + 4, y + 3]], '#b3a57e', '#5d7155', .8);
  }
}

function bossWarning(c: Ctx, e: Effect, p: number) {
  const radius = e.radius ?? 82, elapsed = e.maxLife - e.life;
  const pulse = .7 + Math.sin(elapsed * (7 + p * 6)) * .14;
  c.save();
  ellipse(c, e.x, e.y, radius, radius, `rgba(196,79,51,${.05 + p * .05})`);
  c.beginPath(); c.moveTo(e.x, e.y); c.arc(e.x, e.y, radius - 5, -Math.PI / 2, -Math.PI / 2 + p * TAU); c.closePath();
  c.fillStyle = 'rgba(227,116,63,.09)'; c.fill();
  c.setLineDash([8, 6]); c.lineDashOffset = -elapsed * 15;
  ellipse(c, e.x, e.y, radius, radius, 'transparent', `rgba(255,182,117,${pulse})`, 2.6);
  c.setLineDash([]);
  arc(c, e.x, e.y, radius - 4, -Math.PI / 2, -Math.PI / 2 + p * TAU, p > .8 ? '#ffdb93' : '#eea86b', 3.6);
  ellipse(c, e.x, e.y, 9, 9, 'rgba(183,66,40,.14)', '#f1bd85', 1.4);
  line(c, [[e.x - 5, e.y - 5], [e.x + 5, e.y + 5]], '#f6c28c', 1.8);
  line(c, [[e.x + 5, e.y - 5], [e.x - 5, e.y + 5]], '#f6c28c', 1.8);
  for (let i = 0; i < 4; i++) {
    const angle = i * TAU / 4;
    c.save(); c.translate(e.x + Math.cos(angle) * (radius + 8), e.y + Math.sin(angle) * (radius + 8)); c.rotate(angle);
    line(c, [[-3, -4], [2, 0], [-3, 4]], '#f4c898', 1.5); c.restore();
  }
  const textX = clamp(e.x, 113, 1087), textY = clamp(e.y + radius + 22, 22, 706);
  round(c, textX - 104, textY - 13, 208, 20, 7, 'rgba(61,42,30,.84)', '#be8354', .8);
  c.textAlign = 'center'; c.font = 'bold 11px "Noto Sans SC", sans-serif'; c.fillStyle = '#f5d4a3';
  c.fillText('闪避 · 月刃突袭 / 荆棘打断', textX, textY);
  c.restore();
}

function bossResolution(c: Ctx, e: Effect, p: number) {
  const interrupted = e.style === 'boss-interrupted', radius = e.radius ?? 82;
  c.globalAlpha *= 1 - ease((p - .42) / .58);
  if (interrupted) {
    const r = 18 + p * 36;
    for (let i = 0; i < 5; i++) {
      const angle = i * TAU / 5 + p * .25;
      arc(c, e.x, e.y - 22, r, angle, angle + .55, '#cfefde', 2.4);
      const x = e.x + Math.cos(angle) * (r + 7), y = e.y - 22 + Math.sin(angle) * (r + 7);
      poly(c, [[x - 3, y - 3], [x + 4, y - 1], [x + 1, y + 5]], '#e7e7b8', '#9bccac', .6);
    }
    line(c, [[e.x - 11, e.y - 32], [e.x - 3, e.y - 25]], '#f1dfa4', 2.2);
    line(c, [[e.x + 3, e.y - 19], [e.x + 11, e.y - 12]], '#f1dfa4', 2.2);
    line(c, [[e.x + 11, e.y - 32], [e.x - 11, e.y - 12]], '#e3f3cc', 2.2);
  } else {
    const grow = ease(p / .4), r = 10 + radius * grow;
    ellipse(c, e.x, e.y, r, r, 'rgba(208,149,91,.07)', '#f1c287', 5 * (1 - p) + .9);
    ellipse(c, e.x, e.y, r * .76, r * .76, 'transparent', '#cfaa7c', 1.5);
    for (let i = 0; i < 9; i++) {
      const angle = i * TAU / 9 + .21, distance = (radius * .2 + radius * .8 * grow);
      const x = e.x + Math.cos(angle) * distance, y = e.y + Math.sin(angle) * distance - Math.sin(p * Math.PI) * 15;
      poly(c, [[x - 5, y], [x - 2, y - 7], [x + 6, y - 3], [x + 4, y + 4]], i % 2 ? '#9e937d' : '#c4ae83', '#615f4d', .8);
      line(c, [[e.x + Math.cos(angle) * 17, e.y + Math.sin(angle) * 17], [e.x + Math.cos(angle + .05) * radius * .5, e.y + Math.sin(angle + .05) * radius * .5], [e.x + Math.cos(angle) * radius * .72, e.y + Math.sin(angle) * radius * .72]], 'rgba(98,78,49,.65)', 1.4);
    }
    sparks(c, e.x, e.y, p, '#e7be83', 12, 1.5);
  }
}

export function drawEffect(c: Ctx, e: Effect) {
  if (e.life <= 0 || e.maxLife <= 0) return;
  const remain = clamp(e.life / e.maxLife), p = 1 - remain;
  c.save();
  if (e.type === 'arrow' || e.type === 'bolt') projectile(c, e, p, e.type === 'bolt');
  else if (e.type === 'shell') cannonShell(c, e, p);
  else if (e.type === 'explosion') cannonExplosion(c, e, p);
  else if (e.type === 'ring' && e.style === 'cannon-quake') quake(c, e, p);
  else if (e.type === 'boss-warning') bossWarning(c, e, p);
  else if (e.type === 'ring' && (e.style === 'boss-slam' || e.style === 'boss-interrupted')) bossResolution(c, e, p);
  else if (e.type === 'slash') slash(c, e, p);
  else if (e.type === 'hero-burst') heroBurst(c, e, p);
  else if (e.type === 'chain') chainLightning(c, e, p);
  else if (e.type === 'hero-dash') moonDash(c, e, p);
  else if (e.type === 'frost-zone' || e.type === 'roots' || e.type === 'oath') skillDomain(c, e, p);
  else if (e.type === 'ring' && (e.style === 'arrow-volley' || e.style === 'barracks-cleave' || e.style === 'barracks-mend' || e.style === 'barracks-fortify')) advancedRing(c, e, p);
  else if (e.type === 'impact') {
    // Projectiles and the meteor draw contact on visual arrival, without an early duplicate.
    if (!['arrow', 'mage', 'meteor', 'arrow-volley', 'arrow-deadeye', 'arrow-snare', 'mage-overload', 'mage-chain'].includes(e.style ?? '')) {
      const q = clamp((p - .28) / .72);
      if (p > .28) {
        c.globalAlpha *= 1 - q;
        const color = e.color ?? '#f3d699';
        sparks(c, e.x, e.y - 20, q, color, e.style === 'hero' ? 8 : 6, e.style === 'hero' ? 1.25 : 1);
        if (q < .36) {
          const length = mix(9, 3, q / .36);
          line(c, [[e.x - length, e.y - 20], [e.x + length, e.y - 20]], '#ffedba', 2);
          line(c, [[e.x, e.y - 20 - length], [e.x, e.y - 20 + length]], color, 1.8);
        }
      }
    }
  } else if (e.type === 'meteor') {
    if (p < .42) {
      const q = p / .42, x = e.x - (1 - q) * 125, y = e.y - (1 - q) * 260;
      c.shadowColor = '#ffa348'; c.shadowBlur = 18;
      poly(c, [[x + 8, y - 8], [x - 70, y - 143], [x - 30, y - 49], [x - 13, y + 4]], 'rgba(246,145,66,.6)');
      poly(c, [[x + 6, y - 6], [x - 40, y - 91], [x - 3, y + 10]], '#ffd37c');
      ellipse(c, x, y, 11, 14, '#7a5840', '#ffc971', 3); ellipse(c, x - 2, y - 4, 6, 5, '#c88043');
    } else {
      const q = (p - .42) / .58; c.globalAlpha *= 1 - q;
      const glow = c.createRadialGradient(e.x, e.y, 2, e.x, e.y, 96);
      glow.addColorStop(0, 'rgba(255,214,132,.65)'); glow.addColorStop(.4, 'rgba(232,138,68,.44)'); glow.addColorStop(1, 'rgba(201,101,44,0)');
      c.fillStyle = glow; c.fillRect(e.x - 100, e.y - 100, 200, 200);
      ellipse(c, e.x, e.y, 27 + q * 85, (27 + q * 85) * .7, 'transparent', '#f8c57a', 5 * (1 - q) + 1);
      sparks(c, e.x, e.y, q, '#f7c174', 12, 2);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + .3, r = 13 + q * (50 + i % 3 * 17), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r - Math.sin(q * Math.PI) * 18;
        poly(c, [[x - 4, y], [x - 2, y - 5], [x + 3, y - 3], [x + 4, y + 2]], i % 2 ? '#d4ab75' : '#8a6546', '#6c6144', .5);
      }
    }
  } else if (e.type === 'ring' || e.type === 'heal') {
    c.globalAlpha *= remain;
    const radius = e.type === 'heal' ? 20 + p * 30 : 18 + p * 42;
    ellipse(c, e.x, e.y, radius, radius * .65, 'transparent', e.color ?? '#b5e4bc', e.type === 'heal' ? 2 : 3);
    if (e.type === 'heal') for (let i = 0; i < 4; i++) {
      const x = e.x + Math.cos(i * 1.7) * 17, y = e.y - p * 35 + Math.sin(i * 2) * 12;
      line(c, [[x - 3, y], [x + 3, y]], '#d0edb2', 2); line(c, [[x, y - 3], [x, y + 3]], '#d0edb2', 2);
    }
  } else if (e.type === 'text') {
    c.globalAlpha *= Math.min(1, remain * 2); c.textAlign = 'center';
    const reward = e.text?.startsWith('+'), label = (e.text?.length ?? 0) > 4;
    c.font = `bold ${label ? 12 : reward ? 13 : 12}px "Noto Sans SC", sans-serif`;
    c.strokeStyle = 'rgba(42,55,35,.85)'; c.lineWidth = 3;
    c.strokeText(e.text ?? '', e.x, e.y - p * 25); c.fillStyle = e.color ?? '#ebda98'; c.fillText(e.text ?? '', e.x, e.y - p * 25);
  }
  c.restore();
}
