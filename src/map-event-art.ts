import type { Ally, Effect, MapEventState, Point } from './types';
import type { MapEventDefinition } from './map-events';
import { MARSH_HYDROLOGY, traceMarshFloodway } from './marsh-terrain';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, width = 1) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c: Ctx, points: number[][], color: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function poly(c: Ctx, points: number[][], fill: string, stroke?: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

/** The stone piers straddle the real channel; the control deck sits on its east bank. */
export function drawFloodgate(c: Ctx, definition: Readonly<MapEventDefinition>, state: MapEventState, hero: Ally | undefined, time: number, battle: boolean) {
  const active = state.activeRemaining > 0, cooling = state.cooldownRemaining > 0 && !active;
  const nearby = !!hero && hero.hp > 0 && Math.hypot(hero.x - definition.position.x, hero.y - definition.position.y) <= definition.triggerRadius;
  const ready = battle && nearby && !active && !cooling;
  const elapsed = definition.duration - state.activeRemaining;
  const opening = active ? clamp(elapsed / .38) : 0;
  const closing = cooling ? clamp(1 - (definition.cooldown - definition.duration - state.cooldownRemaining) / .32) : 0;
  const lift = (active ? opening : closing) * 15;
  c.save(); c.translate(definition.position.x, definition.position.y); c.lineCap = 'round'; c.lineJoin = 'round';

  // A compact stone work deck joins the dry bank. There is no separate floating pedestal.
  poly(c, [[22, -8], [37, -18], [58, -4], [45, 9], [26, 4]], '#aaa582', '#526754', 1.3);
  poly(c, [[26, 4], [45, 9], [58, -4], [58, 2], [46, 15], [26, 9]], '#747d64', '#526754', .9);
  line(c, [[30, -6], [47, 4], [53, -2]], '#d0c29a', 1);
  line(c, [[38, -13], [35, -7]], '#767e60', .8);
  line(c, [[42, 0], [39, 5]], '#767e60', .8);
  // These lower blocks continue the terrain's two embankments, outside the water opening.
  poly(c, [[-1, -6], [6, -11], [15, -5], [9, 5], [0, 1]], '#8e9879', '#4a6655', 1.3);
  poly(c, [[31, 9], [38, 4], [47, 10], [43, 21], [34, 18]], '#92997b', '#4a6655', 1.3);
  poly(c, [[0, 1], [9, 5], [9, 10], [0, 6]], '#657e67');
  poly(c, [[34, 18], [43, 21], [43, 26], [34, 23]], '#627b65');
  line(c, [[0, -5], [8, 0]], '#b5b998', 1.2); line(c, [[34, 11], [42, 16]], '#b5b998', 1.2);

  // Water is visibly under the lifted gate, never spread across the surrounding grass.
  poly(c, [[11, 0], [30, 11], [23, 22], [3, 12]], active ? '#66a2a0' : '#4c7973', '#4b6a61', .7);
  if (active) {
    c.save(); c.globalAlpha *= opening * clamp(state.activeRemaining / .25);
    for (let i = 0; i < 4; i++) {
      const q = (elapsed * 2.5 + i / 4) % 1;
      const x = 20 - q * 18, y = 9 + q * 18;
      line(c, [[x - 5, y - 3], [x, y], [x + 5, y + 2]], 'rgba(217,235,211,.75)', 1.3);
      if (i % 2 === 0) ellipse(c, x - 3, y + 4, 2.1, .9, 'rgba(228,237,209,.67)');
    }
    c.restore();
  } else {
    line(c, [[9, 9], [22, 16]], '#749c8c', 1);
  }

  // Short timber guides and a diagonal crossbeam face the southwest outlet.
  for (const [x, y] of [[4, 0], [37, 18]]) {
    poly(c, [[x - 3, y + 1], [x - 3, y - 33], [x + 3, y - 35], [x + 4, y - 1]], '#817456', '#405e4f', 1.2);
    poly(c, [[x + 1, y - 34], [x + 3, y - 35], [x + 4, y - 1], [x + 1, y]], '#62694b');
    line(c, [[x - 3, y - 5], [x + 3, y - 7]], '#b0a272', 1.4);
    line(c, [[x - 3, y - 25], [x + 3, y - 27]], '#b0a272', 1.4);
    ellipse(c, x - 1, y - 6, .85, .85, '#414f42');
  }
  // The same timber panel rises as a single object between the guides.
  poly(c, [[9, -2 - lift], [9, -26 - lift], [31, -14 - lift], [31, 10 - lift]], '#88744c', '#415b49', 1.2);
  for (let i = 0; i < 4; i++) {
    const y = -5 - i * 6 - lift;
    line(c, [[11, y], [29, y + 11]], '#b39a68', 1.2);
  }
  line(c, [[12, -22 - lift], [28, 6 - lift]], '#5e6648', 2);
  line(c, [[12, -4 - lift], [28, 4 - lift]], '#56654a', 1.3);
  poly(c, [[0, -33], [5, -38], [43, -17], [39, -12]], '#ad9b6b', '#405c4b', 1.3);
  line(c, [[5, -35], [38, -17]], '#d3bf87', 1.1);

  // The screw and small handwheel belong to the dry control deck on the right bank.
  line(c, [[24, -25 - lift], [34, -29]], '#b9b489', 1.6);
  line(c, [[36, -7], [36, -27]], '#68725a', 3);
  line(c, [[37, -7], [37, -27]], '#bab48b', .9);
  c.save(); c.translate(37, -27); c.rotate((active ? opening : closing) * Math.PI * 1.7);
  ellipse(c, 0, 0, 6.8, 6.3, '#586e5a', active ? '#ccdab5' : ready ? '#e4dba0' : '#b6ac7d', 1.8);
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + .35;
    line(c, [[Math.cos(a) * 1.8, Math.sin(a) * 1.8], [Math.cos(a) * 5.3, Math.sin(a) * 4.8]], '#c9bd87', 1.1);
  }
  ellipse(c, 0, 0, 1.9, 1.7, ready ? '#f0dfa5' : '#c9b979', '#465e4b', .6);
  c.restore();
  if (ready) {
    // A warm glint on the wheel and deck is enough to invite interaction.
    c.globalAlpha *= .6 + Math.sin(time * 3.2) * .16;
    line(c, [[33, -32], [36, -34], [39, -33]], '#f1e1a7', 1.2);
    line(c, [[44, 7], [53, 0]], '#e1d597', 1.4);
  }
  if (cooling) {
    c.fillStyle = '#4d614b'; c.fillRect(47, -17, 12, 2);
    c.fillStyle = '#c8b57b'; c.fillRect(47, -17, 12 * clamp(1 - state.cooldownRemaining / definition.cooldown), 1.5);
  }
  c.restore();
}

function sampleCurrent(points: readonly Point[], fraction: number, offset = 0): Point {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = clamp(fraction) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const start = points[i], end = points[i + 1], length = lengths[i];
      const q = length > 0 ? clamp(distance / length) : 0;
      return { x: start.x + (end.x - start.x) * q - (end.y - start.y) / length * offset,
        y: start.y + (end.y - start.y) * q + (end.x - start.x) / length * offset };
    }
    distance -= lengths[i];
  }
  return { ...points[points.length - 1] };
}

/** Moving silt and foam follow the static river; no persistent circle suggests a water surface. */
export function drawFloodgateFlow(c: Ctx, effect: Effect) {
  if (effect.life <= 0 || effect.maxLife <= 0) return;
  const elapsed = effect.maxLife - effect.life;
  const opening = clamp(elapsed / .35), fade = clamp(effect.life / .4);
  const current = MARSH_HYDROLOGY.centerline.slice(2);
  c.save(); c.globalAlpha *= opening * fade; c.lineCap = 'round'; c.lineJoin = 'round';
  traceMarshFloodway(c); c.clip();

  // A narrow, moving wash stays inside the carved channel and the low ford.
  line(c, current.map(point => [point.x, point.y]), 'rgba(104,164,160,.33)', MARSH_HYDROLOGY.channelWidth * .86);
  line(c, current.map(point => [point.x, point.y]), 'rgba(168,184,132,.12)', MARSH_HYDROLOGY.channelWidth * .57);
  for (let i = 0; i < 17; i++) {
    const progress = (elapsed * (.42 + i % 3 * .025) + i / 17) % 1;
    const offset = Math.sin(i * 2.4) * (i % 3 ? 9 : 4);
    const trail: number[][] = [];
    for (let k = 0; k < 5; k++) {
      const q = progress - .055 + k * .055 / 4;
      const point = sampleCurrent(current, q, offset + Math.sin(q * 24 + i) * 1.3);
      trail.push([point.x, point.y]);
    }
    const alpha = .24 + Math.sin(progress * Math.PI) * .23;
    line(c, trail, i % 4 === 0 ? `rgba(192,205,169,${alpha})` : `rgba(220,235,212,${alpha})`, i % 3 === 0 ? 1.8 : 1.2);
    if (i % 3 === 0) {
      const point = sampleCurrent(current, progress, offset);
      ellipse(c, point.x - 1, point.y + 1, 2.3, 1.1, `rgba(229,236,209,${alpha})`);
    }
  }

  // Water spreads around the submerged stepping timbers at the ford, then rejoins the outlet.
  const crossing = MARSH_HYDROLOGY.crossing;
  for (let i = 0; i < 5; i++) {
    const q = (elapsed * 1.5 + i / 5) % 1;
    const x = crossing.x + 16 - q * 33, y = crossing.y - 15 + q * 30;
    line(c, [[x - 5, y - 3], [x - 1, y - 1], [x + 4, y - 2]], `rgba(226,234,207,${.44 * Math.sin(q * Math.PI)})`, 1.2);
  }
  // A softer fan of muddy ripples dissipates into the connected drainage pool.
  const outlet = MARSH_HYDROLOGY.outlet;
  for (let i = 0; i < 3; i++) {
    const q = (elapsed * .65 + i / 3) % 1;
    c.beginPath(); c.ellipse(outlet.x - q * 13, outlet.y + q * 3, 7 + q * 20, 2 + q * 5, -.12, -.2, Math.PI * .9);
    c.strokeStyle = `rgba(185,210,180,${(1 - q) * .33})`; c.lineWidth = 1.2; c.stroke();
  }
  c.restore();
}
