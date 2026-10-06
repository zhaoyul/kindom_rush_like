import type { Point } from './types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Shared visual geography only: the simulation's road, pads and slowing circle do not move. */
export const MARSH_HYDROLOGY = {
  source: { x: 725, y: 242 },
  gateMouth: { x: 674, y: 253 },
  crossing: { x: 620, y: 300 },
  outlet: { x: 495, y: 356 },
  centerline: [
    { x: 725, y: 242 }, { x: 690, y: 238 }, { x: 674, y: 253 },
    { x: 644, y: 272 }, { x: 620, y: 300 }, { x: 582, y: 338 }, { x: 495, y: 356 },
  ],
  channelWidth: 30,
  crossingFrom: 200,
  crossingTo: 392,
} as const;

/** One connected outline, including the high northern bay and lower drainage pool. */
export function traceMarshFloodway(c: Ctx): void {
  c.beginPath(); c.moveTo(688, 226);
  c.bezierCurveTo(722, 214, 774, 216, 800, 226);
  c.bezierCurveTo(823, 234, 825, 252, 806, 264);
  // The southern shore bends into a dry headland below the 760/290 build pad.
  c.bezierCurveTo(800, 266, 794, 260, 786, 251);
  c.quadraticCurveTo(772, 241, 759, 241);
  c.quadraticCurveTo(747, 241, 735, 248);
  c.quadraticCurveTo(715, 264, 695, 261);
  c.lineTo(684, 266);
  c.bezierCurveTo(670, 272, 660, 279, 649, 289);
  c.lineTo(632, 313);
  c.bezierCurveTo(615, 327, 602, 343, 591, 350);
  c.lineTo(553, 366);
  c.bezierCurveTo(552, 379, 525, 379, 497, 374);
  c.bezierCurveTo(472, 371, 453, 365, 450, 357);
  c.bezierCurveTo(448, 347, 464, 337, 481, 337);
  c.bezierCurveTo(500, 331, 525, 332, 542, 340);
  // A narrow curved north bank leaves the 550/290 tower on dry ground.
  c.lineTo(575, 330);
  c.bezierCurveTo(591, 315, 601, 299, 608, 288);
  c.lineTo(633, 260);
  c.quadraticCurveTo(649, 246, 663, 241);
  c.lineTo(681, 225); c.quadraticCurveTo(684, 224, 688, 226); c.closePath();
}

export function isMarshHydrologyReserved(point: Point, margin = 0): boolean {
  return point.x >= 438 - margin && point.x <= 831 + margin && point.y >= 207 - margin && point.y <= 389 + margin;
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, color: string) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = color; c.fill();
}
function stroke(c: Ctx, points: number[][], color: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function polygon(c: Ctx, points: number[][], fill: string, outline?: string) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill();
  if (outline) { c.strokeStyle = outline; c.lineWidth = 1.2; c.stroke(); }
}

/** Cached below the road; only the active flood is drawn above the low crossing. */
export function drawMarshWaterway(c: Ctx): void {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  traceMarshFloodway(c); c.strokeStyle = '#4d6555'; c.lineWidth = 15; c.stroke();
  c.strokeStyle = '#919d73'; c.lineWidth = 7; c.stroke();
  const water = c.createLinearGradient(776, 222, 474, 373);
  water.addColorStop(0, '#3b696b'); water.addColorStop(.38, '#537e76'); water.addColorStop(.7, '#5b8e82'); water.addColorStop(1, '#4c756b');
  c.fillStyle = water; c.fill();
  c.save(); traceMarshFloodway(c); c.clip();
  ellipse(c, 741, 236, 70, 11, 'rgba(152,192,167,.12)');
  ellipse(c, 497, 353, 45, 9, 'rgba(163,194,150,.12)');
  for (let i = 0; i < 91; i++) {
    const x = 445 + ((i * 71 + 37) % 367), y = 222 + ((i * 43 + 17) % 153);
    stroke(c, [[x, y], [x + 7 + i % 4 * 5, y]], i % 3 ? 'rgba(183,214,187,.2)' : 'rgba(32,67,63,.18)', 1.1);
  }
  for (const [x, y] of [[710, 245], [802, 242], [790, 258], [472, 353], [503, 363], [525, 347]]) {
    ellipse(c, x, y, 6.5, 2.3, '#99ad72');
    polygon(c, [[x, y], [x + 7, y - 2.3], [x + 7, y + 2]], '#4f7d70');
  }
  c.restore();
  // Low reeds and bank stones frame the water without hiding the controls or construction pads.
  for (const [x, y] of [[705, 219], [812, 260], [701, 267], [454, 367], [527, 380], [580, 355]]) {
    for (let i = 0; i < 3; i++) stroke(c, [[x + i * 4, y], [x + i * 5 - 3, y - 8 - i * 3]], '#83905a', 1.4);
  }
  for (const [x, y] of [[809, 270], [698, 219], [452, 349], [549, 365]]) {
    ellipse(c, x + 2, y + 2, 9, 3, 'rgba(32,56,45,.15)');
    polygon(c, [[x - 7, y], [x - 5, y - 5], [x + 4, y - 7], [x + 9, y - 2], [x + 3, y + 2]], '#939a7f', '#566c58');
    stroke(c, [[x - 5, y - 4], [x + 3, y - 5]], '#bdba96', 1);
  }
  c.restore();
}

/** A shallow, continuous causeway, with timber approaches and wet stepping stones at the channel. */
export function drawMarshCrossing(c: Ctx): void {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  polygon(c, [[591, 202], [649, 202], [649, 391], [591, 391]], '#5f6c58', '#536654');
  polygon(c, [[595, 200], [646, 200], [646, 389], [595, 389]], '#aeab82', '#8c9672');
  for (let y = 203; y < 389; y += 13) {
    if (y >= 267 && y <= 326) continue;
    polygon(c, [[596, y], [645, y], [645, y + 10], [596, y + 10]], y % 2 ? '#b5a47a' : '#ac9e77', '#7e8262');
    stroke(c, [[601, y + 3], [624, y + 3], [636, y + 5]], 'rgba(233,213,160,.55)', .9);
    ellipse(c, 600, y + 7, 1.1, 1.1, '#6c775a'); ellipse(c, 641, y + 4, 1.1, 1.1, '#6c775a');
  }
  polygon(c, [[595, 268], [646, 268], [646, 328], [595, 328]], '#8b9d86');
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const x = 597 + col * 16, y = 270 + row * 14;
    polygon(c, [[x, y + 1], [x + 13, y], [x + 14, y + 10], [x + 1, y + 12]], (row + col) % 2 ? '#b5b698' : '#a8ad8e', '#687b69');
    stroke(c, [[x + 3, y + 3], [x + 10, y + 3]], '#d0c8a6', .8);
  }
  // Worn wet seams show that high water can pass over this low deck.
  stroke(c, [[595, 291], [612, 294], [629, 290], [646, 293]], 'rgba(63,117,106,.42)', 2);
  stroke(c, [[595, 313], [611, 309], [630, 311], [646, 308]], 'rgba(68,123,109,.36)', 1.7);
  // The western build pad reaches the crossing over a small bank-side timber spur.
  polygon(c, [[574, 283], [597, 283], [597, 297], [574, 297]], '#8d9571', '#5d725c');
  for (let x = 576; x < 597; x += 6) {
    polygon(c, [[x, 284], [x + 4, 284], [x + 4, 296], [x, 296]], '#b6a67d', '#757e5e');
    stroke(c, [[x + 2, 287], [x + 2, 293]], '#d4bf92', .8);
  }
  for (const [x, y] of [[592, 218], [649, 218], [592, 249], [649, 249], [592, 348], [649, 348], [592, 379], [649, 379]]) {
    polygon(c, [[x - 2, y + 1], [x - 2, y - 9], [x + 3, y - 10], [x + 3, y]], '#747b5e', '#4e6453');
    stroke(c, [[x, y - 8], [x + 2, y - 8]], '#c1b68d', 1.2);
  }
  c.restore();
}
