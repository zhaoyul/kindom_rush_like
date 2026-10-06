import type { Point, Tower, TowerAbilityKind } from './types';
import { getTowerAbilities } from './data';

type Ctx = CanvasRenderingContext2D;
type TowerPose = Tower & { attackAnimation?: number; facingX?: number; facingY?: number; attackVariant?: number };
const TAU = Math.PI * 2;
const INK = '#344936';

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
function box(c: Ctx, x: number, y: number, w: number, h: number, r: number | number[], fill: string, stroke?: string, width = 1.5) {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function ground(c: Ctx, w: number) {
  ellipse(c, 6, 8, w + 3, 12, 'rgba(27,40,27,.25)');
  ellipse(c, 0, 0, w, 11, '#8b8e71', '#52634b', 1.6);
  ellipse(c, 0, -4, w - 2, 10, '#b6b294', '#737f61', 1.2);
  line(c, [[-w + 7, 1], [-10, 7], [w - 7, 1]], '#747e62', 1.1);
}
function stone(c: Ctx, x: number, base: number, w: number, h: number, blue = false) {
  const left = x - w / 2, right = x + w / 2, top = base - h;
  poly(c, [[left, base - 3], [left + 3, top], [right - 3, top], [right, base - 3], [x, base + 5]], blue ? '#a4afb1' : '#afb099', '#536653', 1.7);
  poly(c, [[x + 2, top], [right - 3, top], [right, base - 3], [x + 2, base + 4]], blue ? '#788b96' : '#7f917c');
  for (let i = 1; i < h / 12; i++) {
    const y = base - i * 12;
    line(c, [[left + 2, y - 4], [x, y + 1], [right - 2, y - 4]], blue ? '#75878e' : '#7c8b71', 1);
    line(c, [[x - w * (i % 2 ? .24 : .08), y - 3], [x - w * (i % 2 ? .24 : .08), y - 14]], blue ? '#839197' : '#8f9a7b', 1);
    if (w > 35) line(c, [[x + w * .23, y - 2], [x + w * .23, y - 14]], blue ? '#657d85' : '#718468', 1);
  }
  ellipse(c, x, top, w / 2 - 2, Math.min(9, w / 5), blue ? '#c7cbc0' : '#c9c5a8', '#566853', 1.5);
}
function crenels(c: Ctx, x: number, y: number, w: number, blue = false, gold = false) {
  ellipse(c, x, y + 2, w / 2 + 3, 9, blue ? '#7b879d' : '#8c9980', '#4c6150', 1.5);
  ellipse(c, x, y, w / 2 + 3, 8, blue ? '#b5bdc0' : '#c2c3a3', '#526956', 1.3);
  const count = Math.max(3, Math.round(w / 13));
  for (let i = 0; i < count; i++) {
    const xx = x - w / 2 + i * w / (count - 1), yy = y + (1 - Math.abs((xx - x) / (w / 2))) * 6;
    poly(c, [[xx - 4.5, yy + 1], [xx - 4.5, yy - 10], [xx + 4.5, yy - 11], [xx + 5, yy + 1]], blue ? '#b3bbc0' : '#b9bda0', '#566950', 1.1);
    poly(c, [[xx + .5, yy - 10], [xx + 4.5, yy - 11], [xx + 5, yy + 1], [xx + .5, yy + 1]], blue ? '#818ea1' : '#879a7e');
    if (gold) line(c, [[xx - 3.5, yy - 9], [xx + 3.5, yy - 10]], '#d4bd79', 1.6);
  }
}
function slit(c: Ctx, x: number, y: number, blue = false) {
  box(c, x - 3.5, y, 7, 15, 3, blue ? '#304b5a' : '#3b5744', '#c0c1a2', 1);
  line(c, [[x, y + 3], [x, y + 11]], blue ? '#9fdcd5' : '#b3b986', 1);
}
function banner(c: Ctx, x: number, y: number, length: number, color: string, time: number, crest: 'leaf' | 'shield' | 'eagle' = 'leaf') {
  const flutter = Math.sin(time * 3.3 + x) * 1.7;
  line(c, [[x, y + length + 3], [x, y - 4]], '#685d3e', 2.3);
  poly(c, [[x + 1, y], [x + 18, y + 3 + flutter], [x + 17, y + length - 5], [x + 9, y + length + 1], [x + 1, y + length - 3]], color, '#485339', 1.2);
  line(c, [[x + 2, y + 2], [x + 16, y + 5 + flutter]], '#d6be7b', 1.1);
  if (crest === 'shield') {
    poly(c, [[x + 5, y + 10], [x + 12, y + 10], [x + 13, y + 17], [x + 9, y + 21], [x + 5, y + 17]], '#e2ce94', '#6e714a', .6);
    line(c, [[x + 9, y + 12], [x + 9, y + 18]], '#9a8050', .8);
  } else if (crest === 'eagle') eagle(c, x + 9, y + 15, 5);
  else poly(c, [[x + 8, y + 9], [x + 13, y + 12], [x + 9, y + 18], [x + 5, y + 14]], '#decc8c');
}
function eagle(c: Ctx, x: number, y: number, s: number) {
  poly(c, [[x, y - s * .65], [x + s * .25, y - s * .3], [x + s, y - s * .8], [x + s * .73, y - s * .15], [x + s * .37, y], [x + s * .65, y + s * .3], [x + s * .2, y + s * .23], [x, y + s * .65], [x - s * .2, y + s * .23], [x - s * .65, y + s * .3], [x - s * .37, y], [x - s * .73, y - s * .15], [x - s, y - s * .8], [x - s * .25, y - s * .3]], '#e2c981', '#82754a', .8);
  ellipse(c, x + s * .12, y - s * .45, s * .2, s * .19, '#f3dda1');
}
function archer(c: Ctx, x: number, y: number, t: TowerPose, elite = false) {
  c.save(); c.translate(x, y);
  const sniper = t.branch === 'arrow-sniper';
  const direction = (t.facingX ?? 1) < 0 ? -1 : 1;
  c.scale(direction, 1);
  const firing = (t.attackAnimation ?? 0) > 0;
  const p = firing ? 1 - Math.min(1, (t.attackAnimation ?? 0) / .32) : 0;
  const draw = firing ? (p < .45 ? p / .45 : Math.max(0, 1 - (p - .45) / .2)) : .18;
  c.translate(-Math.max(0, p - .42) * 2, 0);
  poly(c, [[-5, -14], [5, -14], [7, -2], [-7, -2]], elite ? '#77846a' : '#6e824e', '#40573b', 1);
  ellipse(c, 0, -18, 5.5, 6.1, '#d8b888', '#49543a', 1);
  poly(c, [[-6, -20], [0, -28], [7, -20]], elite ? '#acaf8a' : '#577848', '#3a5237', 1.1);
  if (elite) { line(c, [[-5, -20], [6, -20]], '#e5c778', 1.5); poly(c, [[0, -26], [0, -32], [7, -27], [5, -24]], '#647c4b'); }
  line(c, [[3, -18], [5, -18]], '#4a5033', 1.2);
  // The string visibly pulls to the shoulder, then snaps back after release.
  const bx = 14, by = -11;
  line(c, [[4, -13], [bx - 1, by]], '#cdb182', 2.7);
  line(c, [[-3, -13], [bx - 5 - draw * 8, by]], '#c7ad7c', 2.5);
  c.save(); c.translate(bx, by);
  const aim = Math.atan2(t.facingY ?? 0, (t.facingX ?? 1) * direction);
  c.rotate(Math.max(-.65, Math.min(.65, aim)));
  const bowHeight = sniper ? 18 : 10, bowBend = sniper ? 12 : 8;
  c.beginPath(); c.moveTo(0, -bowHeight); c.quadraticCurveTo(bowBend, 0, 0, bowHeight); c.strokeStyle = sniper ? '#f0d18e' : elite ? '#dec686' : '#d6b779'; c.lineWidth = sniper ? 2.7 : 2; c.stroke();
  line(c, [[0, -bowHeight], [-draw * (sniper ? 12 : 9), 0], [0, bowHeight]], '#e5e2b5', .8);
  if (sniper) for (const side of [-1, 1]) poly(c, [[0, side * 18], [3, side * 24], [5, side * 17]], '#e5c476', '#6d7047', .7);
  if (!firing || p < .44) { line(c, [[-draw * 9 - 3, 0], [10, 0]], '#ac9b65', 1); poly(c, [[13, 0], [8, -2], [8, 2]], '#d8e0bc'); }
  c.restore();
  // A gold-toned quiver is clearly visible behind the green cloak.
  line(c, [[-7, -3], [-11, -16]], '#8a6d43', 3); line(c, [[-11, -15], [-14, -21]], '#e4d49d', 1.2);
  c.restore();
}
function woodDeck(c: Ctx, x: number, y: number, w: number, dark = false) {
  poly(c, [[x - w / 2, y - 3], [x, y - 13], [x + w / 2, y - 3], [x + w / 2, y + 8], [x, y + 17], [x - w / 2, y + 8]], dark ? '#8e7547' : '#b6925c', '#4f5435', 1.6);
  poly(c, [[x, y - 2], [x + w / 2, y - 3], [x + w / 2, y + 8], [x, y + 17]], '#7c643b');
  line(c, [[x - w / 2 + 2, y + 6], [x, y + 14], [x + w / 2 - 2, y + 6]], '#d4b173', 1.5);
  for (let i = -1; i <= 1; i++) line(c, [[x + i * 9, y - 6], [x + i * 9 - 1, y + 10]], '#846b42', 1);
}
function greenRoof(c: Ctx, x: number, y: number, w: number, h: number, gold = false) {
  poly(c, [[x - w / 2, y], [x, y - h], [x + w / 2, y], [x, y + 9]], '#5c7844', '#304c32', 1.8);
  poly(c, [[x, y - h], [x + w / 2, y], [x, y + 9]], '#3b5e3a');
  poly(c, [[x, y - h + 3], [x - w / 2 + 5, y - 1], [x - 2, y + 4]], '#819252');
  line(c, [[x - w / 2 + 1, y], [x, y + 7], [x + w / 2 - 1, y]], gold ? '#d2b974' : '#a0aa6d', 2);
  for (let i = 1; i <= 2; i++) { const f = i / 3; line(c, [[x - w * f / 2, y - h * (1 - f)], [x, y - h * (1 - f) + 5], [x + w * f / 2, y - h * (1 - f)]], '#48683e', 1); }
}

function arrowOne(c: Ctx, t: TowerPose, _time: number) {
  ground(c, 26);
  // An open wooden watchstand: slender legs, cross-bracing and a single roof.
  poly(c, [[-18, -5], [-17, -43], [-10, -44], [-10, -2]], '#a38451', INK, 1.4);
  poly(c, [[13, -4], [12, -44], [18, -43], [20, -5]], '#735e3b', INK, 1.4);
  line(c, [[-15, -7], [16, -34]], '#bc9860', 4); line(c, [[-16, -34], [16, -7]], '#806b40', 4);
  line(c, [[-5, -5], [-5, -29]], '#6b6040', 2); for (let y = -8; y > -29; y -= 7) line(c, [[-8, y], [-1, y]], '#baa273', 1.5);
  woodDeck(c, 0, -45, 53);
  archer(c, -1, -48, t);
  line(c, [[-22, -38], [-22, -51]], '#a88a55', 3); line(c, [[23, -38], [23, -52]], '#846c43', 3);
  greenRoof(c, 0, -78, 57, 19);
  ellipse(c, 0, -100, 2.3, 2.8, '#d5bb77');
}
function arrowTwo(c: Ctx, t: TowerPose, time: number) {
  ground(c, 34);
  // A broad stone foot supports two staggered wooden platforms.
  stone(c, 0, -3, 48, 30); slit(c, -6, -27);
  poly(c, [[-21, -29], [-22, -72], [18, -76], [23, -30], [0, -23]], '#a98a54', '#4f5636', 1.7);
  poly(c, [[1, -75], [18, -76], [23, -30], [1, -24]], '#806a40');
  for (let y = -34; y > -72; y -= 8) line(c, [[-20, y], [20, y - 3]], '#75653e', 1);
  line(c, [[-17, -31], [-17, -71]], '#d0b178', 3); line(c, [[12, -33], [12, -73]], '#5e5c3c', 3);
  woodDeck(c, 0, -38, 66, true);
  line(c, [[-30, -32], [-30, -48]], '#b49764', 2.6); line(c, [[30, -32], [30, -48]], '#8d764c', 2.6);
  woodDeck(c, 0, -73, 63);
  archer(c, -4, -69, t);
  line(c, [[-27, -66], [-27, -88]], '#8b7449', 3); line(c, [[26, -66], [26, -88]], '#7a6741', 3);
  greenRoof(c, 0, -98, 73, 20, true);
  banner(c, 25, -67, 35, '#5a7647', time);
  // The second balcony has a spare arrow rack and broad support brackets.
  line(c, [[-25, -20], [-30, -39]], '#72603b', 3); line(c, [[23, -20], [29, -39]], '#72603b', 3);
  line(c, [[-12, -43], [-8, -58]], '#d5c596', 1.5); line(c, [[-6, -43], [-2, -59]], '#d5c596', 1.5);
}
function arrowThree(c: Ctx, t: TowerPose, time: number) {
  ground(c, 41);
  // An imposing stone turret with two visibly separate archer balconies.
  stone(c, 0, -4, 58, 70); slit(c, -12, -42); slit(c, 12, -47);
  poly(c, [[-12, -10], [-12, -29], [-5, -33], [1, -28], [1, -6]], '#3d5946', '#c2bc91', 1.2);
  line(c, [[-8, -26], [-8, -10]], '#9e9c6b', 1);
  stone(c, -31, -3, 17, 25); stone(c, 31, -3, 17, 25);
  woodDeck(c, -24, -66, 44); woodDeck(c, 24, -66, 44);
  const activeLeft = (t.attackVariant ?? 0) % 2 === 0;
  archer(c, -25, -68, t.branch === 'arrow-sniper' || activeLeft ? t : { ...t, attackAnimation: 0 }, true);
  if (t.branch !== 'arrow-sniper') archer(c, 23, -68, activeLeft ? { ...t, attackAnimation: 0 } : t, true);
  else {
    // The sniper keeps one deliberate longbow and a rangefinder on the second balcony.
    line(c, [[21, -66], [26, -79]], '#977f4d', 2.2); line(c, [[26, -79], [39, -85]], '#dcc58b', 4);
    ellipse(c, 39, -85, 3, 4, '#749184', '#ead79d', 1.1);
  }
  for (const x of [-43, -7, 7, 43]) line(c, [[x, -58], [x, -78]], '#a4a789', 3);
  line(c, [[-43, -57], [-24, -51], [-7, -57]], '#d4bc7a', 2); line(c, [[7, -57], [24, -51], [43, -57]], '#d4bc7a', 2);
  stone(c, 0, -74, 31, 23); crenels(c, 0, -98, 35, false, true);
  greenRoof(c, 0, -107, 45, 16, true);
  // A large gold eagle, rather than a small upgrade pip, identifies the elite turret.
  poly(c, [[-10, -78], [0, -83], [10, -78], [8, -64], [0, -58], [-8, -64]], '#476749', '#bda568', 1.6);
  eagle(c, 0, -70, 7);
  banner(c, -29, -43, 28, '#486742', time, 'eagle');
  line(c, [[0, -122], [0, -129]], '#aa9360', 1.8); ellipse(c, 0, -129, 2.1, 2.5, '#e4cb82');
}

function crystal(c: Ctx, x: number, y: number, s: number, t: TowerPose, time: number, delay = 0) {
  c.save(); c.translate(x, y);
  if (t.branch === 'mage-arcane') c.scale(1.24, 1.14);
  else if (t.branch === 'mage-frost') c.scale(.72, 1.37);
  x = 0; y = 0;
  const bob = Math.sin(time * 2.1 + t.id + delay) * 2;
  const fire = Math.max(0, Math.min(1, (t.attackAnimation ?? 0) / .32));
  const glow = c.createRadialGradient(x, y + bob, 1, x, y + bob, s * (2 + fire));
  glow.addColorStop(0, `rgba(177,246,239,${.37 + fire * .45})`); glow.addColorStop(1, 'rgba(144,203,232,0)'); c.fillStyle = glow; c.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
  poly(c, [[x, y - s + bob], [x + s * .65, y + bob], [x, y + s + bob], [x - s * .65, y + bob]], fire > .45 ? '#e2ffff' : t.branch === 'mage-arcane' ? '#c8b4ed' : '#a4dce0', '#50728e', 1.5);
  poly(c, [[x, y - s + bob], [x + s * .65, y + bob], [x, y + s + bob]], fire > .45 ? '#bde8fc' : t.branch === 'mage-frost' ? '#8ecfdb' : '#859ad8');
  poly(c, [[x, y - s + bob], [x - s * .65, y + bob], [x - s * .2, y + s * .2 + bob]], '#dbf5e8');
  line(c, [[x, y - s + 2 + bob], [x, y + s - 2 + bob]], '#daf1f7', 1.2);
  if (fire > 0) {
    c.save(); c.globalAlpha = fire; c.shadowColor = '#c0f9f3'; c.shadowBlur = 10;
    ellipse(c, x, y + bob, s * (1.6 + (1 - fire) * .7), s * .6, 'transparent', '#dcfff8', 1.6);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + time; line(c, [[x + Math.cos(a) * s, y + Math.sin(a) * s], [x + Math.cos(a) * (s + 7), y + Math.sin(a) * (s + 7)]], '#e2ffed', 1.5); }
    c.restore();
  }
  c.restore();
}
function rune(c: Ctx, x: number, y: number, variant: number, color = '#addfd5', scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (variant % 3 === 0) line(c, [[-3, -4], [2, -1], [-2, 1], [3, 4]], color, 1.3);
  else if (variant % 3 === 1) { line(c, [[0, -5], [0, 4]], color, 1.3); line(c, [[-3, -1], [0, -4], [3, -1]], color, 1.3); }
  else { line(c, [[-3, 4], [-3, -4], [3, -1], [-3, 1]], color, 1.3); }
  c.restore();
}
function mageOne(c: Ctx, t: TowerPose, time: number) {
  ground(c, 25); stone(c, 0, -5, 39, 43, true); slit(c, -2, -31, true);
  crenels(c, 0, -49, 39, true);
  for (const x of [-18, 18]) poly(c, [[x - 4, -52], [x - 3, -65], [x + 3, -65], [x + 4, -53]], '#898ba6', '#526478', 1.2);
  crystal(c, 0, -74, 17, t, time);
  line(c, [[-17, -7], [0, -1], [17, -7]], '#a7afce', 2);
}
function mageTwo(c: Ctx, t: TowerPose, time: number) {
  ground(c, 34); stone(c, 0, -4, 48, 66, true);
  // An octagonal rune tower flanked by two tall prongs and twin floating gems.
  for (const x of [-19, 19]) {
    poly(c, [[x - 4, -8], [x - 3, -63], [x + 4, -63], [x + 5, -8]], '#999cad', '#58677b', 1.2);
    line(c, [[x, -11], [x, -56]], '#bbadd9', 1.4);
  }
  slit(c, -6, -41, true); rune(c, 8, -27, 0);
  ellipse(c, 0, -55, 27, 8, '#858fa9', '#566d7a', 1.3); line(c, [[-25, -53], [0, -45], [25, -53]], '#bcc1db', 1.6);
  crenels(c, 0, -72, 49, true);
  for (const x of [-24, 24]) {
    stone(c, x, -65, 14, 28, true);
    poly(c, [[x - 8, -93], [x, -109], [x + 8, -93], [x, -87]], '#7f79ac', '#495c77', 1.4);
    poly(c, [[x - 8, -93], [x, -109], [x, -87]], '#b2aed5');
  }
  crystal(c, -12, -90, 16, t, time, .2); crystal(c, 12, -90, 16, t, time, 1.7);
  for (let i = 0; i < 4; i++) { const a = time * .7 + i * TAU / 4; rune(c, Math.cos(a) * 29, -87 + Math.sin(a) * 7, i, '#cbdedb', .67); }
}
function mageThree(c: Ctx, t: TowerPose, time: number) {
  ground(c, 43);
  // Three independent spires surround a suspended central crystal.
  stone(c, 0, -4, 52, 71, true);
  for (const x of [-30, 30]) {
    stone(c, x, -4, 22, 67, true); slit(c, x - 1, -36, true);
    crenels(c, x, -72, 23, true);
    poly(c, [[x - 13, -80], [x, -111], [x + 13, -80], [x, -73]], '#7579a4', '#445975', 1.5);
    poly(c, [[x - 13, -80], [x, -111], [x, -73]], '#a4a2c6');
    line(c, [[x - 10, -81], [x, -75], [x + 10, -81]], '#a9d1d1', 1.6);
    ellipse(c, x, -112, 2.5, 3.4, '#c3efe0');
  }
  stone(c, 0, -73, 26, 30, true); crenels(c, 0, -103, 29, true);
  poly(c, [[-8, -111], [0, -127], [8, -111], [0, -106]], '#8392bf', '#4e6482', 1.3);
  poly(c, [[-8, -111], [0, -127], [0, -106]], '#b7d4d4');
  // A large arch and facade rune make the citadel recognizable even at small size.
  c.beginPath(); c.moveTo(-12, -11); c.lineTo(-12, -43); c.quadraticCurveTo(0, -60, 12, -43); c.lineTo(12, -10); c.closePath(); c.fillStyle = '#3c5369'; c.fill(); c.strokeStyle = '#c1bcda'; c.lineWidth = 2; c.stroke();
  rune(c, 0, -34, 1, '#c7f4dd', 1.3);
  ellipse(c, 0, -76, 36, 11, 'rgba(162,213,225,.09)', '#a7cfdd', 1.6);
  crystal(c, 0, -87, 22, t, time);
  for (let i = 0; i < 6; i++) {
    const a = time * .65 + i * TAU / 6, x = Math.cos(a) * 37, y = -86 + Math.sin(a) * 11;
    c.save(); c.globalAlpha = .65 + Math.sin(a) * .2; rune(c, x, y, i, '#c5f0e0', .9); c.restore();
  }
  for (const x of [-31, 31]) rune(c, x, -58, x > 0 ? 2 : 0, '#bbd6d4', .9);
  line(c, [[-39, -7], [0, 4], [39, -7]], '#bcc1db', 2.3);
}

function redRoof(c: Ctx, x: number, y: number, w: number, h: number, fortified = false) {
  poly(c, [[x - w / 2, y], [x - 7, y - h], [x + w / 2, y], [x + 5, y + 10]], fortified ? '#97564a' : '#b77153', '#684d38', 1.8);
  poly(c, [[x - 7, y - h], [x + w / 2, y], [x + 5, y + 10]], '#874a39');
  poly(c, [[x - 7, y - h], [x - w / 2 + 5, y - 1], [x + 1, y + 4]], '#ce9063');
  for (let i = 1; i < 4; i++) { const f = i / 4; line(c, [[x - w / 2 * f - 7 * (1 - f), y - h * (1 - f)], [x + w / 2 * f - 7 * (1 - f), y - h * (1 - f) + f * 7]], '#96583d', 1); }
  line(c, [[x - w / 2 + 1, y], [x + 5, y + 8], [x + w / 2 - 1, y]], '#dfb579', 2);
}
function door(c: Ctx, x: number, y: number, w: number, h: number, gate = false) {
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h + w / 2); c.quadraticCurveTo(x, y - h - w / 2, x + w / 2, y - h + w / 2); c.lineTo(x + w / 2, y); c.closePath(); c.fillStyle = '#3c5041'; c.fill(); c.strokeStyle = '#c1b690'; c.lineWidth = 1.8; c.stroke();
  if (gate) { for (let i = -1; i <= 1; i++) line(c, [[x + i * w / 4, y - 1], [x + i * w / 4, y - h + 4]], '#aaa480', 1.5); line(c, [[x - w / 2 + 2, y - h / 2], [x + w / 2 - 2, y - h / 2]], '#c2b68c', 1.4); }
  else { line(c, [[x, y - 1], [x, y - h + 4]], '#a99d65', 1); ellipse(c, x + 3, y - h * .3, 1.2, 1.2, '#d5be77'); }
}
function shield(c: Ctx, x: number, y: number, s: number, elite = false) {
  poly(c, [[x - s, y - s], [x + s, y - s], [x + s, y + s * .25], [x, y + s], [x - s, y + s * .25]], elite ? '#516c65' : '#587b81', '#d2bd7e', 1.3);
  line(c, [[x, y - s * .7], [x, y + s * .6]], '#e3d29a', 1.5); line(c, [[x - s * .7, y - s * .15], [x + s * .7, y - s * .15]], '#e3d29a', 1.5);
}
function spear(c: Ctx, x: number, y: number, h: number, tilt = 0) {
  line(c, [[x, y], [x + tilt, y - h]], '#82704a', 2);
  poly(c, [[x + tilt - 3, y - h + 3], [x + tilt, y - h - 7], [x + tilt + 3, y - h + 3]], '#c5cfb4', '#69806a', .8);
}
function barracksOne(c: Ctx, _t: TowerPose, time: number) {
  ground(c, 31);
  // A modest timber cottage, open doorway, one shield and chimney smoke.
  poly(c, [[-26, -7], [-26, -43], [4, -50], [26, -39], [26, -7], [3, 3]], '#cfbf96', '#645d41', 1.6);
  poly(c, [[3, -49], [26, -39], [26, -7], [3, 3]], '#a79872');
  for (const x of [-25, 3, 24]) line(c, [[x, -39], [x, -5]], '#7b6744', 3);
  line(c, [[-24, -34], [2, -10]], '#958051', 2.5); line(c, [[-24, -10], [2, -39]], '#958051', 2.5);
  door(c, -8, 0, 13, 24); shield(c, 16, -22, 5);
  redRoof(c, 0, -46, 66, 26);
  poly(c, [[16, -58], [15, -79], [23, -80], [25, -54]], '#a6a791', '#65684d', 1.2); ellipse(c, 19, -79, 4, 2, '#4b5c44');
  for (let i = 0; i < 3; i++) { const p = ((time * .18 + i * .31) % 1); ellipse(c, 19 + Math.sin(p * 7) * 4, -85 - p * 19, 3 + p * 5, 2 + p * 3, `rgba(221,217,188,${(1 - p) * .18})`); }
  spear(c, -29, -5, 36, -5); banner(c, -13, -90, 17, '#b7654b', time, 'shield');
}
function barracksTwo(c: Ctx, _t: TowerPose, time: number) {
  ground(c, 40);
  // A broad stone guardhouse with a projecting courtyard and iron gate.
  poly(c, [[-31, -17], [-31, -61], [3, -71], [33, -58], [33, -17], [3, -7]], '#bbb89a', '#586950', 1.7);
  poly(c, [[3, -71], [33, -58], [33, -17], [3, -7]], '#819580');
  for (let y = -24; y > -61; y -= 12) { line(c, [[-29, y], [2, y + 6], [31, y - 3]], '#819473', 1); line(c, [[-15, y], [-15, y - 11]], '#909d7c', 1); }
  slit(c, -18, -52); slit(c, 17, -53);
  redRoof(c, 0, -64, 78, 25, true);
  // The roof has a distinct dormer with a large shield emblem.
  poly(c, [[-13, -58], [-13, -77], [-3, -87], [10, -77], [10, -58]], '#bbc0a1', '#596950', 1.3);
  redRoof(c, -2, -78, 29, 12, true); shield(c, -2, -65, 7, true);
  poly(c, [[-37, -4], [-37, -22], [-22, -24], [-17, -20], [17, -19], [23, -25], [38, -22], [38, -3], [0, 10]], '#a8b18e', '#536b4f', 1.6);
  poly(c, [[0, -19], [38, -22], [38, -3], [0, 10]], '#809577');
  door(c, 0, 8, 21, 27, true);
  for (const x of [-32, -23, 23, 32]) box(c, x - 3, -30, 7, 12, 1, '#c0c29d', '#657958', 1);
  spear(c, -34, -4, 38, -4); spear(c, 32, -5, 41, 3);
  banner(c, 16, -110, 35, '#aa5c48', time, 'shield');
  shield(c, -24, -15, 5); shield(c, 26, -14, 5);
}
function barracksThree(c: Ctx, _t: TowerPose, time: number) {
  ground(c, 46);
  // A true garrison: twin fortified towers, battlements and a deep gatehouse.
  poly(c, [[-33, -5], [-32, -69], [30, -69], [35, -5], [0, 10]], '#adb89a', '#50694e', 1.7);
  poly(c, [[1, -69], [30, -69], [35, -5], [1, 10]], '#7c9279');
  for (let y = -8; y > -65; y -= 12) { line(c, [[-31, y], [0, y + 6], [32, y - 1]], '#829773', 1); line(c, [[-17, y], [-17, y - 11]], '#8e9e7a', 1); }
  for (const x of [-30, 30]) {
    stone(c, x, -2, 26, 84); slit(c, x, -41); slit(c, x, -65);
    crenels(c, x, -87, 28, false, true);
    redRoof(c, x, -98, 34, 17, true);
  }
  // Battlement walkway spans both towers instead of another cottage roof.
  poly(c, [[-27, -77], [26, -77], [26, -65], [0, -58], [-27, -65]], '#c0c7a8', '#556e52', 1.5);
  for (let i = -2; i <= 2; i++) box(c, i * 10 - 3.5, -86, 7, 13, 1, '#c8c9a8', '#607a56', 1);
  line(c, [[-24, -65], [0, -60], [24, -65]], '#d4bc7a', 2);
  poly(c, [[-16, -4], [-16, -37], [0, -52], [17, -36], [18, 3], [0, 10]], '#c1c3a1', '#5d7556', 1.5);
  door(c, 0, 8, 23, 43, true); shield(c, 0, -47, 8, true);
  line(c, [[-14, -2], [-14, -28]], '#ded0a0', 1.5); line(c, [[15, 4], [15, -26]], '#a5b589', 1.5);
  // An armored sentry and paired halberds beside the gate.
  for (const x of [-23, 23]) { spear(c, x, 5, 39, x < 0 ? -4 : 4); shield(c, x, -16, 6, true); poly(c, [[x - 4, -25], [x - 3, -33], [x, -36], [x + 4, -32], [x + 4, -25]], '#b8c4ad', '#506e57', 1); line(c, [[x - 2, -28], [x + 2, -28]], '#3d5d4b', 1.3); }
  banner(c, 5, -130, 42, '#a35446', time, 'shield');
  banner(c, -39, -71, 29, '#a35446', time, 'shield');
  // The larger standard carries a gold crown above its shield.
  poly(c, [[10, -123], [10, -127], [13, -125], [15, -129], [17, -125], [20, -127], [20, -123]], '#e1c889');
}

function cannonAim(t: TowerPose) {
  const direction = (t.facingX ?? 1) < 0 ? -1 : 1;
  const angle = Math.max(-.7, Math.min(.45, Math.atan2(t.facingY ?? -.25, Math.abs(t.facingX ?? 1)) - .16));
  return { direction, angle };
}

function gunBarrel(c: Ctx, t: TowerPose, x: number, y: number, length: number, size: number) {
  const { direction, angle } = cannonAim(t), active = (t.attackAnimation ?? 0) > 0;
  const p = active ? 1 - Math.min(1, (t.attackAnimation ?? 0) / .45) : 1;
  const recoil = active ? Math.sin(Math.min(1, p / .7) * Math.PI) * 7 : 0;
  c.save(); c.translate(x, y); c.scale(direction, 1); c.rotate(angle);
  c.translate(-recoil, 0);
  poly(c, [[-9, -size], [length - 5, -size * .8], [length + 2, -size], [length + 3, size], [length - 5, size * .8], [-9, size], [-14, 3], [-14, -3]], '#536775', '#2e4045', 1.5);
  poly(c, [[-9, -size], [length - 4, -size * .8], [length - 4, -size * .2], [-10, -size * .3]], '#87999d');
  line(c, [[-6, -size + 1.5], [length - 7, -size * .8 + 1]], '#b8c0ac', 1.1);
  for (const xx of [1, length * .57, length - 6]) { c.save(); c.translate(xx, 0); ellipse(c, 0, 0, 2, size * 1.03, 'transparent', '#b8a672', 2); c.restore(); }
  ellipse(c, length + 2, 0, 3, size, '#718481', '#c3b079', 1.5);
  ellipse(c, length + 3, 0, 1.7, size * .63, '#263c40', '#45605f', .6);
  ellipse(c, -14, 0, 3, 4, '#c0aa73', '#394f45', .9);
  if (active && p < .29) {
    c.save(); c.globalAlpha = 1 - p / .29;
    poly(c, [[length + 5, 0], [length + 21, -9], [length + 17, -2], [length + 34, 0], [length + 18, 3], [length + 22, 9]], '#ffdb91');
    poly(c, [[length + 4, 0], [length + 19, -3], [length + 25, 0], [length + 18, 4]], '#fff0bd');
    c.restore();
  }
  if (active) { c.save(); c.globalAlpha = Math.sin(p * Math.PI) * .23; ellipse(c, length + 9 + p * 10, -p * 13, 5 + p * 9, 3 + p * 6, '#d5d0b8'); c.restore(); }
  c.restore();
}

function gun(c: Ctx, t: TowerPose, x: number, y: number, length: number, size: number) {
  if (t.branch === 'cannon-cluster') {
    for (const shift of [-8, 8, 0]) gunBarrel(c, t, x - (shift ? 3 : 0), y + shift, length - 5, size * .58);
  } else gunBarrel(c, t, x, y, length + (t.branch === 'cannon-siege' ? 17 : 0), size * (t.branch === 'cannon-siege' ? 1.16 : 1));
}

function wheel(c: Ctx, x: number, y: number, radius: number, iron = false) {
  ellipse(c, x, y, radius, radius * .88, iron ? '#596e73' : '#756047', '#354d43', 1.7);
  ellipse(c, x, y, radius * .78, radius * .69, iron ? '#83918b' : '#b3905e', '#beb08a', 1.1);
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(c, [[x, y], [x + Math.cos(a) * radius * .76, y + Math.sin(a) * radius * .65]], iron ? '#475e5d' : '#68593c', 1.8); }
  ellipse(c, x, y, radius * .23, radius * .2, '#ccb984', '#4a604f', .9);
}

function cannonOne(c: Ctx, t: TowerPose, time: number) {
  ground(c, 31); woodDeck(c, 0, -11, 55, true);
  for (const x of [-19, 16]) { poly(c, [[x - 4, -4], [x - 3, -26], [x + 4, -29], [x + 5, -3]], '#a88758', '#536047', 1.2); }
  line(c, [[-20, -20], [19, -22]], '#d0ad75', 4);
  ellipse(c, -4, -27, 12, 7, '#8c7760', '#455e49', 1.3);
  gun(c, t, -5, -35, 32, 7); wheel(c, -15, -16, 10); wheel(c, 16, -14, 10);
  // A powder keg, loaded cannonballs and an engineer's pennant.
  poly(c, [[-29, -4], [-29, -17], [-18, -20], [-16, -7], [-22, -2]], '#a5895c', '#566447', 1);
  line(c, [[-29, -13], [-18, -15]], '#596952', 2); line(c, [[-28, -7], [-17, -9]], '#596952', 2);
  for (const [x, y] of [[22, -4], [29, -5], [25, -11]]) ellipse(c, x, y, 4, 4, '#465a5c', '#96a38b', .8);
  banner(c, -22, -59, 18, '#bf8551', time, 'shield');
}

function cannonTwo(c: Ctx, t: TowerPose, time: number) {
  ground(c, 40); stone(c, 0, -4, 56, 35);
  poly(c, [[-33, -24], [-32, -49], [27, -53], [34, -27], [0, -17]], '#8d9d89', '#4d6552', 1.5);
  poly(c, [[0, -51], [27, -53], [34, -27], [0, -17]], '#667f73');
  for (const x of [-24, 23]) line(c, [[x, -29], [x, -49]], '#ceba87', 3);
  ellipse(c, 0, -53, 26, 9, '#b2b798', '#4c6557', 1.4);
  gun(c, t, -5, -62, 41, 9); wheel(c, -17, -49, 12, true); wheel(c, 19, -47, 12, true);
  slit(c, -12, -26); slit(c, 11, -26);
  line(c, [[-27, -12], [0, -5], [27, -12]], '#d3bc81', 1.7);
  for (const x of [-31, 28]) { poly(c, [[x - 5, -4], [x - 4, -25], [x + 4, -26], [x + 6, -4]], '#9b9f7f', '#4d6651', 1.1); }
  for (const [x, y] of [[-29, -5], [-24, -7], [-27, -12]]) ellipse(c, x, y, 4, 4, '#41575c', '#a0ad98', .8);
  banner(c, -31, -84, 25, '#b67c45', time, 'shield');
  poly(c, [[-6, -25], [5, -25], [7, -19], [0, -15], [-7, -19]], '#d5b874', '#6d754d', 1);
}

function cannonThree(c: Ctx, t: TowerPose, time: number) {
  ground(c, 48); stone(c, 0, -5, 69, 64);
  for (const x of [-33, 33]) { stone(c, x, -3, 23, 51); crenels(c, x, -55, 25, false, true); slit(c, x, -34); }
  poly(c, [[-35, -60], [-32, -82], [29, -85], [36, -61], [1, -49]], '#98a997', '#476754', 1.6);
  poly(c, [[1, -83], [29, -85], [36, -61], [1, -49]], '#587d72');
  ellipse(c, 0, -81, 34, 11, '#bdc5ad', '#4d6d5a', 1.6);
  for (const x of [-24, 25]) { poly(c, [[x - 6, -65], [x - 5, -88], [x + 4, -88], [x + 6, -62]], '#b5bca2', '#506f5a', 1); line(c, [[x - 3, -70], [x - 3, -84]], '#e1cea0', 1.1); }
  gun(c, t, -5, -87, 50, 11);
  wheel(c, -17, -72, 14, true); wheel(c, 20, -69, 14, true);
  door(c, 0, 5, 20, 36, true);
  // Exposed brass gearing and paired steel bomb insignia identify the siege fortress.
  for (const side of [-1, 1]) {
    const x = side * 23; ellipse(c, x, -22, 7, 7, '#bbab70', '#5b7158', 1);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(c, [[x + Math.cos(a) * 4, -22 + Math.sin(a) * 4], [x + Math.cos(a) * 7, -22 + Math.sin(a) * 7]], '#4f6750', 1.4); }
    ellipse(c, x, -22, 2, 2, '#667e67');
  }
  banner(c, -38, -117, 34, '#b97942', time, 'shield');
  poly(c, [[-10, -49], [0, -55], [10, -49], [9, -39], [0, -33], [-9, -39]], '#425e57', '#dbbe82', 1.1);
  ellipse(c, 0, -44, 4.6, 4.6, '#e2c88b'); line(c, [[1, -48], [5, -53]], '#ebdca7', 1.5);
  line(c, [[-43, -4], [0, 8], [43, -4]], '#d2bc7e', 2);
}

function abilityCrest(c: Ctx, kind: TowerAbilityKind, rank: number, x: number, time: number) {
  const palette: Record<TowerAbilityKind, string> = {
    'arrow-volley': '#e4c27e', 'arrow-deadeye': '#f0dc9a', 'arrow-snare': '#a4cb79',
    'mage-chain': '#b3d1f4', 'mage-overload': '#c6a0e0', 'mage-frost': '#afe1e5',
    'barracks-cleave': '#e8ddac', 'barracks-fortify': '#afc6c8', 'barracks-mend': '#c1dca0',
    'cannon-cluster': '#f3c779', 'cannon-pierce': '#cbd5d2', 'cannon-quake': '#e4a879',
  };
  const y = -10, color = palette[kind];
  if (!rank) return;
  c.save();
  poly(c, [[x, y - 9], [x + 7, y - 5], [x + 7, y + 3], [x, y + 7], [x - 7, y + 3], [x - 7, y - 5]], '#405440', rank > 1 ? '#f1df99' : '#b7ab75', rank > 1 ? 1.8 : 1);
  ellipse(c, x, y - 1, 5.4, 5.4, color);
  if (kind === 'arrow-deadeye') {
    ellipse(c, x, y - 1, 2.4, 2.4, 'transparent', '#6a6447', 1);
    line(c, [[x - 4, y - 1], [x + 4, y - 1]], '#6a6447', .8); line(c, [[x, y - 5], [x, y + 3]], '#6a6447', .8);
  } else if (kind === 'arrow-snare' || kind === 'barracks-mend') {
    line(c, [[x, y + 3], [x, y - 4]], '#577449', 1);
    if (kind === 'barracks-mend') line(c, [[x - 3, y - 1], [x + 3, y - 1]], '#577449', 1.5);
    else { poly(c, [[x, y - 1], [x + 4, y - 4], [x + 3, y]], '#56764b'); poly(c, [[x, y + 1], [x - 4, y - 2], [x - 2, y + 2]], '#56764b'); }
  } else if (kind === 'mage-chain') line(c, [[x + 2, y - 5], [x - 2, y - 1], [x + 2, y], [x - 2, y + 4]], '#566c93', 1.3);
  else if (kind === 'mage-frost' || kind === 'mage-overload') {
    const count = kind === 'mage-frost' ? 6 : 4;
    for (let i = 0; i < count; i++) { const a = i * TAU / count; line(c, [[x, y - 1], [x + Math.cos(a) * 4, y - 1 + Math.sin(a) * 4]], '#58647e', .9); }
    if (kind === 'mage-overload') ellipse(c, x, y - 1, 1.4, 1.4, '#f4e9ff');
  } else if (kind === 'barracks-fortify') {
    poly(c, [[x - 3, y - 4], [x + 3, y - 4], [x + 3, y], [x, y + 3], [x - 3, y]], '#607c80');
    line(c, [[x, y - 3], [x, y + 1]], '#e5e4be', .9);
  } else if (kind === 'barracks-cleave') {
    line(c, [[x - 3, y - 4], [x + 3, y + 2]], '#746b50', 1.5); line(c, [[x + 3, y - 4], [x - 3, y + 2]], '#746b50', 1.5);
  } else if (kind === 'cannon-cluster') {
    for (const [dx, dy] of [[-2.5, 1], [2.5, 1], [0, -3]]) ellipse(c, x + dx, y + dy, 1.9, 1.9, '#736147');
  } else if (kind === 'cannon-pierce') {
    line(c, [[x - 3, y + 3], [x + 3, y - 4]], '#5a6d69', 1.7); poly(c, [[x + 3, y - 5], [x - 1, y - 3], [x + 3, y]], '#5a6d69');
  } else if (kind === 'cannon-quake') {
    line(c, [[x - 1, y - 5], [x + 2, y - 1], [x - 2, y], [x + 1, y + 4]], '#86674c', 1.3);
    line(c, [[x - 4, y + 2], [x - 2, y + 3]], '#86674c', .8); line(c, [[x + 3, y + 2], [x + 4, y + 3]], '#86674c', .8);
  } else for (let i = -1; i <= 1; i++) {
    line(c, [[x + i * 3, y + 2], [x + i * 3, y - 4]], '#7c704f', 1);
    poly(c, [[x + i * 3, y - 5], [x + i * 3 - 1.5, y - 2], [x + i * 3 + 1.5, y - 2]], '#7c704f');
  }
  if (rank > 1) {
    const glint = .25 + Math.max(0, Math.sin(time * 2 + x)) * .35;
    c.globalAlpha = glint; line(c, [[x - 3, y - 9], [x + 3, y - 9]], '#fff1bb', 1.3);
  }
  c.restore();
}

function branchInsignia(c: Ctx, t: TowerPose, time: number) {
  if (!t.branch) return;
  const frost = t.branch === 'mage-frost', arcane = t.branch === 'mage-arcane';
  const color = t.branch === 'arrow-ranger' ? '#5e9657' : t.branch === 'arrow-sniper' ? '#786247'
    : arcane ? '#8263a3' : frost ? '#5795b0' : t.branch === 'cannon-cluster' ? '#b38646'
    : t.branch === 'cannon-siege' ? '#655d5a' : t.branch === 'barracks-warden' ? '#3f7c6c' : '#a34642';
  const x = t.kind === 'cannon' ? -48 : t.kind === 'mage' ? 38 : 35;
  const y = t.kind === 'barracks' ? -118 : t.kind === 'cannon' ? -109 : -99;
  const sway = Math.sin(time * 3.2 + t.id) * 1.4;
  line(c, [[x, y + 48], [x, y - 3]], '#d4bf88', 2);
  poly(c, [[x, y], [x + 22, y + 3 + sway], [x + 22, y + 26], [x + 11, y + 34], [x, y + 28]], color, '#e0c893', 1.2);
  c.save(); c.translate(x + 11, y + 15);
  if (t.branch === 'arrow-sniper') {
    ellipse(c, 0, 0, 5, 5, 'transparent', '#f1dda9', 1.2); line(c, [[-8, 0], [8, 0]], '#f1dda9', 1); line(c, [[0, -8], [0, 8]], '#f1dda9', 1);
  } else if (t.branch === 'arrow-ranger') {
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 3, -8); c.quadraticCurveTo(side * 11, 0, side * 3, 8); c.strokeStyle = '#f1dda9'; c.lineWidth = 1.4; c.stroke(); line(c, [[side * 3, -8], [side * 3, 8]], '#f1dda9', .8); }
  } else if (arcane || frost) {
    poly(c, [[0, -10], [5, 0], [0, 9], [-5, 0]], frost ? '#c9eff0' : '#e1c5f2');
    if (frost) for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(c, [[0, 0], [Math.cos(a) * 8, Math.sin(a) * 8]], '#d4f2ec', .8); }
  } else if (t.branch === 'barracks-warden') shield(c, 0, 0, 7, true);
  else if (t.branch === 'barracks-blade') {
    poly(c, [[-2, 5], [-2, -5], [0, -10], [2, -5], [2, 5]], '#f1e6bd'); line(c, [[-5, 3], [5, 3]], '#e9d093', 1.8); line(c, [[0, 4], [0, 9]], '#e9d093', 2);
  } else if (t.branch === 'cannon-cluster') {
    for (const [xx, yy] of [[-4, -3], [4, -3], [0, 4]]) ellipse(c, xx, yy, 3, 3, '#efe2b4', '#735c38', .8);
  } else {
    line(c, [[-6, 5], [6, -5]], '#ece4cc', 4); ellipse(c, 7, -6, 3, 3, '#343e3d', '#ede1b6', 1.3);
  }
  c.restore();
  if (frost) for (const side of [-1, 1]) {
    poly(c, [[side * 19 - 5, -48], [side * 19, -76], [side * 19 + 5, -47]], '#8cbaca', '#d1eced', 1);
    line(c, [[side * 19, -72], [side * 19, -50]], '#e3f4ed', .8);
  }
  if (t.branch === 'barracks-warden') {
    shield(c, 0, -44, 13, true); line(c, [[-11, -41], [11, -41]], '#f0e3b4', 2.5);
  } else if (t.branch === 'barracks-blade') {
    for (const side of [-1, 1]) {
      c.save(); c.translate(0, -44); c.rotate(side * .65);
      poly(c, [[-2, 8], [-2, -8], [0, -15], [2, -8], [2, 8]], '#f0e9c4', '#6a6653', .8);
      line(c, [[-5, 7], [5, 7]], '#d0aa72', 2); line(c, [[0, 8], [0, 14]], '#6f4e3c', 2); c.restore();
    }
  }
}

/** Distinct architecture at each upgrade tier; world anchor stays on the build pad. */
export function drawTower(c: CanvasRenderingContext2D, tower: Tower, time: number): void {
  const t = tower as TowerPose, level = Math.max(1, Math.min(3, Math.floor(t.level)));
  c.save(); c.translate(t.x, t.y); c.lineJoin = 'round'; c.lineCap = 'round';
  // The northern build site has less headroom, so its silhouette remains fully visible.
  c.scale(1, towerVerticalScale(t));
  if (t.kind === 'arrow') [arrowOne, arrowTwo, arrowThree][level - 1](c, t, time);
  else if (t.kind === 'mage') [mageOne, mageTwo, mageThree][level - 1](c, t, time);
  else if (t.kind === 'cannon') [cannonOne, cannonTwo, cannonThree][level - 1](c, t, time);
  else [barracksOne, barracksTwo, barracksThree][level - 1](c, t, time);
  branchInsignia(c, t, time);
  if (level === 3) getTowerAbilities(t.kind).forEach((ability, i) => abilityCrest(c, ability.id, t.abilities?.[ability.id] ?? 0, (i - 1) * 17, time));
  // Tier pips supplement the architectural changes for an unambiguous level reading.
  for (let i = 0; i < level; i++) ellipse(c, (i - (level - 1) / 2) * 8, 15, 2.8, 2, '#efd48b', '#686947', .8);
  c.restore();
}

function towerVerticalScale(t: Tower): number {
  const top = t.level >= 3 ? 134 : t.level >= 2 ? 121 : 105;
  return t.y < top + 8 ? Math.max(.57, (t.y - 8) / top) : 1;
}

/** Pure world-space firing origin, shared by projectile rendering without DOM access. */
export function getTowerMuzzle(tower: Tower): Point {
  const t = tower as TowerPose, level = Math.max(1, Math.min(3, Math.floor(t.level)));
  let x = 0, y = -30;
  if (t.kind === 'arrow') {
    const facing = (t.facingX ?? 1) < 0 ? -1 : 1;
    const archerX = level === 1 ? -1 : level === 2 ? -4 : t.branch === 'arrow-sniper' || (t.attackVariant ?? 0) % 2 === 0 ? -25 : 23;
    x = archerX + facing * 14;
    y = level === 1 ? -59 : level === 2 ? -80 : -79;
  } else if (t.kind === 'mage') {
    x = level === 2 ? (t.attackVariant ?? 0) % 2 === 0 ? -12 : 12 : 0;
    y = level === 1 ? -74 : level === 2 ? -90 : -87;
  } else if (t.kind === 'cannon') {
    const { direction, angle } = cannonAim(t), length = (level === 1 ? 32 : level === 2 ? 41 : 50) + (t.branch === 'cannon-cluster' ? -5 : t.branch === 'cannon-siege' ? 17 : 0);
    const baseY = level === 1 ? -35 : level === 2 ? -62 : -87;
    x = -5 + direction * Math.cos(angle) * (length + 3);
    y = baseY + Math.sin(angle) * (length + 3);
  }
  return { x: t.x + x, y: t.y + y * towerVerticalScale(t) };
}
