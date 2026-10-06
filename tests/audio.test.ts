import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusicScore, EffectSoundTracker, effectCues, MUSIC_BARS } from '../src/audio-score';
import type { Effect } from '../src/types';

function effect(type: Effect['type'], maxLife: number, style?: string, id = 1): Effect {
  return { id, type, maxLife, life: maxLife, x: 200, y: 200, toX: 300, toY: 240, style };
}
function progress(e: Effect, value: number): Effect { return { ...e, life: e.maxLife * (1 - value) }; }

test('original loop has a melody and six distinct, bounded instrument parts', () => {
  const notes = createMusicScore();
  assert.deepEqual(new Set(notes.map(n => n.instrument)), new Set(['flute', 'harp', 'strings', 'bass', 'drum', 'shaker']));
  assert.ok(notes.length > 300);
  assert.ok(notes.every((note, i) => Number.isFinite(note.midi) && note.duration > 0 && note.velocity > 0 && note.velocity <= 1
    && note.beat >= 0 && note.beat < MUSIC_BARS * 4 && (!i || note.beat >= notes[i - 1].beat)));
  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const barNotes = notes.filter(n => Math.floor(n.beat / 4) === bar);
    assert.ok(barNotes.some(n => n.instrument === 'flute'));
    assert.ok(barNotes.some(n => n.instrument === 'strings'));
    assert.ok(barNotes.some(n => n.instrument === 'bass'));
  }
  assert.ok(new Set(notes.filter(n => n.instrument === 'flute').map(n => n.midi)).size >= 10);
});

test('arrows sound on launch and visual arrival exactly once, without duplicate instant impacts', () => {
  const tracker = new EffectSoundTracker(), arrow = effect('arrow', .2, 'arrow');
  const impact = effect('impact', .24, 'arrow', 2);
  assert.deepEqual(tracker.collect([arrow, impact], 0).map(e => e.kind), ['bow']);
  assert.deepEqual(tracker.collect([arrow, impact], 0), []);
  assert.deepEqual(tracker.collect([progress(arrow, .79), progress(impact, .65)], .158), []);
  const arrival = tracker.collect([progress(arrow, .80), progress(impact, .67)], .16);
  assert.deepEqual(arrival.map(e => e.kind), ['arrow-hit']);
  assert.equal(arrival[0].x, 300);
  assert.deepEqual(tracker.collect([progress(arrow, .95)], .19), []);
});

test('magic arrives at .77 and hero contact follows windup and sweep', () => {
  const tracker = new EffectSoundTracker(), bolt = effect('bolt', .32, 'mage'), slash = effect('slash', .56, 'hero', 2);
  assert.deepEqual(tracker.collect([bolt, slash], 0).map(e => e.kind), ['magic-cast']);
  assert.deepEqual(tracker.collect([progress(bolt, .76), progress(slash, .22)], .1232).map(e => e.kind), ['hero-swing']);
  assert.deepEqual(tracker.collect([progress(bolt, .77), progress(slash, .439)], .245).map(e => e.kind), ['magic-hit']);
  assert.deepEqual(tracker.collect([progress(slash, .44)], .2464).map(e => e.kind), ['metal']);
  assert.deepEqual(tracker.collect([progress(slash, .55)], .3), []);
});

test('enemy attacks use distinct voices and skill contact follows its visible arrival', () => {
  const voices = ['wolf', 'golem', 'shaman', 'orc', 'goblin', 'soldier'].map(style => effectCues(effect('slash', .5, style)).map(c => c.kind));
  assert.deepEqual(voices, [['wolf', 'bite'], ['stone'], ['staff', 'magic-hit'], ['axe', 'metal'], ['dagger', 'hit'], ['sword', 'metal']]);
  assert.deepEqual(effectCues(effect('hero-burst', .9)).map(c => c.kind), ['hero-power']);
  const meteor = effect('meteor', .95, 'meteor');
  assert.equal(effectCues(meteor)[1].at, .95 * .42);
  for (const style of ['hero', 'soldier', 'arrow', 'mage', 'meteor', 'wolf', 'golem']) {
    assert.deepEqual(effectCues(effect('impact', .24, style)), []);
  }
});

test('pause freezes contact cues; a faster frame crossing arrival still emits one sound', () => {
  const tracker = new EffectSoundTracker(), arrow = effect('arrow', .2, 'arrow');
  tracker.collect([arrow], 0);
  assert.deepEqual(tracker.collect([progress(arrow, .5)], .1, true), []);
  assert.deepEqual(tracker.collect([progress(arrow, .5)], .1), []);
  assert.deepEqual(tracker.collect([progress(arrow, .96)], .192).map(e => e.kind), ['arrow-hit']);
  assert.deepEqual(tracker.collect([progress(arrow, .98)], .196), []);
});

test('restart clears old IDs and late first observations do not replay stale launch cues', () => {
  const tracker = new EffectSoundTracker(), arrow = effect('arrow', .2, 'arrow');
  tracker.collect([arrow], 15);
  tracker.collect([progress(arrow, .9)], 15.18);
  assert.deepEqual(tracker.collect([arrow], 0).map(e => e.kind), ['bow']);
  tracker.reset();
  assert.deepEqual(tracker.collect([progress(arrow, .6)], 2), []);
  assert.deepEqual(tracker.collect([progress(arrow, .85)], 2.05).map(e => e.kind), ['arrow-hit']);
});

test('a volley sounds once for the whole salvo; critical shots keep their own arrival voices', () => {
  const tracker = new EffectSoundTracker(), salvo = effect('ring', .6, 'arrow-volley');
  const arrows = Array.from({ length: 4 }, (_, i) => effect('arrow', .3, 'arrow-volley', i + 2));
  const impacts = Array.from({ length: 4 }, (_, i) => effect('impact', .24, 'arrow-volley', i + 6));
  assert.deepEqual(tracker.collect([salvo, ...arrows, ...impacts], 0).map(e => e.kind), ['volley-bow']);
  assert.deepEqual(tracker.collect([progress(salvo, .23 / .6), ...arrows.map(e => progress(e, .23 / .3))], .23), []);
  assert.deepEqual(tracker.collect([progress(salvo, .24 / .6), ...arrows.map(e => progress(e, .8))], .24).map(e => e.kind), ['volley-hit']);
  assert.deepEqual(tracker.collect([progress(salvo, .9)], .54), []);
  assert.deepEqual(effectCues(effect('arrow', .2, 'arrow-deadeye')).map(e => e.kind), ['deadeye-draw', 'deadeye-hit']);
  assert.deepEqual(effectCues(effect('bolt', .32, 'mage-overload')).map(e => e.kind), ['overload-cast', 'overload-hit']);
  for (const style of ['arrow-deadeye', 'mage-overload', 'mage-chain', 'hero-dash', 'hero-roots', 'hero-oath']) {
    assert.deepEqual(effectCues(effect('impact', .24, style)), []);
  }
});

test('chain lightning follows ordered targets and does not replay contacts after crossing a frame', () => {
  const tracker = new EffectSoundTracker(), chain = effect('chain', .8, 'mage-chain');
  chain.points = [{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 130, y: 35 }, { x: 160, y: 50 }];
  assert.deepEqual(tracker.collect([chain], 0), []);
  assert.deepEqual(tracker.collect([progress(chain, .05)], .04).map(e => e.kind), ['arc-chain']);
  assert.deepEqual(tracker.collect([progress(chain, .16)], .128).map(e => e.kind), ['arc-hit']);
  assert.deepEqual(tracker.collect([progress(chain, .40)], .32).map(e => e.kind), ['arc-hit', 'arc-hit']);
  assert.deepEqual(tracker.collect([progress(chain, .8)], .64), []);
});

test('persistent fields have one opening cue and attached healing pulses do not duplicate the circle', () => {
  const tracker = new EffectSoundTracker();
  const fields = [effect('frost-zone', 4.5, 'mage-frost'), effect('roots', 6.5, 'hero-roots', 2), effect('oath', 8, 'hero-oath', 3)];
  assert.deepEqual(tracker.collect(fields, 0), []);
  assert.deepEqual(tracker.collect(fields.map(e => ({ ...e, life: e.maxLife - .5 })), .5).map(e => e.kind), ['roots-rise', 'oak-oath', 'frost']);
  assert.deepEqual(tracker.collect(fields.map(e => progress(e, .3)), .6), []);
  assert.deepEqual(tracker.collect(fields.map(e => progress(e, .8)), 3.6), []);
  const mend = effect('ring', .8, 'barracks-mend', 4), heals = [effect('heal', .7, 'barracks-mend', 5), effect('heal', .7, 'barracks-mend', 6)];
  assert.deepEqual(tracker.collect([mend, ...heals], 4).map(e => e.kind), ['forest-heal']);
  assert.deepEqual(tracker.collect([mend, ...heals], 4), []);
  const dash = effect('hero-dash', .65, 'hero-dash', 7);
  tracker.collect([dash], 4.1);
  assert.deepEqual(tracker.collect([progress(dash, .55)], 4.4575, true), []);
  assert.deepEqual(tracker.collect([progress(dash, .55)], 4.4575).map(e => e.kind), ['moon-dash', 'moon-hit']);
  assert.deepEqual(tracker.collect([progress(dash, .7)], 4.6), []);
});

test('cannon reports follow visible impact and specialized blasts are distinct and emitted once', () => {
  const tracker = new EffectSoundTracker(), shell = effect('shell', .45, 'cannon');
  const blast = effect('explosion', 1.03, 'cannon', 2);
  assert.deepEqual(tracker.collect([shell, blast], 0).map(e => e.kind), ['cannon-fire']);
  assert.deepEqual(tracker.collect([progress(shell, .83), { ...blast, life: 1.03 - .3735 }], .3735), []);
  assert.deepEqual(tracker.collect([progress(shell, .84), { ...blast, life: 1.03 - .378 }], .378).map(e => e.kind), ['cannon-blast']);
  assert.deepEqual(tracker.collect([progress(shell, .98), progress(blast, .8)], .52), []);
  assert.deepEqual(effectCues(effect('shell', .45, 'cannon-pierce')).map(e => e.kind), ['pierce-fire']);
  assert.deepEqual(effectCues(effect('explosion', 1.03, 'cannon-pierce')).map(e => e.kind), ['pierce-blast']);
  assert.deepEqual(effectCues(effect('explosion', 1.18, 'cannon-cluster')).map(e => e.kind), ['cluster-blast']);
  assert.deepEqual(effectCues(effect('ring', .85, 'cannon-quake')).map(e => e.kind), ['quake']);
  const cluster = effect('explosion', 1.18, 'cannon-cluster', 3);
  tracker.collect([cluster], 1);
  assert.deepEqual(tracker.collect([{ ...cluster, life: 1.18 - .377 }], 1.377), []);
  assert.deepEqual(tracker.collect([{ ...cluster, life: 1.18 - .378 }], 1.378).map(e => e.kind), ['cluster-blast']);
  assert.deepEqual(tracker.collect([progress(cluster, .8)], 1.64), []);
});

test('new campaign enemies retain distinct synchronized attack cues', () => {
  const styles = ['bogling', 'serpent', 'icewolf', 'frostguard', 'imp', 'juggernaut'];
  assert.deepEqual(styles.map(style => effectCues(effect('slash', .5, style)).map(c => c.kind)), [
    ['mud-hit'], ['venom-bite'], ['wolf', 'frost-bite'], ['axe', 'metal'], ['fire-spark', 'magic-hit'], ['stone'],
  ]);
});

test('boss telegraphs voice the opening once and do not sound damage before actual resolution', () => {
  for (const [style, duration] of [['chieftain-slam', 1.8], ['juggernaut-slam', 2.1]] as const) {
    const tracker = new EffectSoundTracker(), warning = effect('boss-warning', duration, style);
    assert.deepEqual(tracker.collect([warning], 0).map(event => event.kind), ['wave']);
    assert.deepEqual(tracker.collect([warning], 0), []);
    assert.deepEqual(tracker.collect([progress(warning, .55)], duration * .55), []);
    assert.deepEqual(tracker.collect([progress(warning, .999)], duration * .999), []);
    const slam = effect('ring', .7, 'boss-slam', 2);
    assert.deepEqual(tracker.collect([slam], duration).map(event => event.kind), ['quake']);
    assert.deepEqual(tracker.collect([progress(slam, .2)], duration + .14), []);
    assert.deepEqual(tracker.collect([progress(slam, .8)], duration + .56), []);
  }
});

test('interrupted boss telegraphs never leave a delayed slam sound, including paused frames', () => {
  const tracker = new EffectSoundTracker(), warning = effect('boss-warning', 1.8, 'chieftain-slam');
  assert.deepEqual(tracker.collect([warning], 0, true), []);
  assert.deepEqual(tracker.collect([warning], 0).map(event => event.kind), ['wave']);
  assert.deepEqual(tracker.collect([progress(warning, .4)], .72), []);
  const interrupted = effect('ring', .65, 'boss-interrupted', 2);
  assert.deepEqual(tracker.collect([interrupted], .72).map(event => event.kind), ['magic-hit']);
  assert.deepEqual(tracker.collect([progress(interrupted, .5)], 1.045), []);
  assert.deepEqual(tracker.collect([], 1.8), []);
  assert.deepEqual(effectCues(effect('impact', .24, 'boss-slam')), []);
  assert.deepEqual(effectCues(effect('impact', .24, 'boss-interrupted')), []);
});

test('floodgate activation has one mechanical opening and one short water rush', () => {
  const tracker = new EffectSoundTracker(), flood = effect('ring', 6, 'floodgate');
  assert.deepEqual(tracker.collect([flood], 0).map(event => event.kind), ['floodgate-open']);
  assert.deepEqual(tracker.collect([flood], 0), []);
  assert.deepEqual(tracker.collect([{ ...flood, life: 6 - .159 }], .159), []);
  assert.deepEqual(tracker.collect([{ ...flood, life: 6 - .16 }], .16).map(event => event.kind), ['floodgate-flow']);
  for (const elapsed of [.5, 1, 3, 5.99]) assert.deepEqual(tracker.collect([{ ...flood, life: 6 - elapsed }], elapsed), []);
  assert.deepEqual(tracker.collect([], 6), []);
  const nextFlood = effect('ring', 6, 'floodgate', 2);
  assert.deepEqual(tracker.collect([nextFlood], 35).map(event => event.kind), ['floodgate-open']);
});

test('floodgate water pauses at its threshold and late restores do not replay old activation noise', () => {
  const tracker = new EffectSoundTracker(), flood = effect('ring', 6, 'floodgate');
  tracker.collect([flood], 0);
  assert.deepEqual(tracker.collect([{ ...flood, life: 6 - .16 }], .16, true), []);
  assert.deepEqual(tracker.collect([{ ...flood, life: 6 - .16 }], .16).map(event => event.kind), ['floodgate-flow']);
  assert.deepEqual(tracker.collect([{ ...flood, life: 5.7 }], .3), []);
  tracker.reset();
  assert.deepEqual(tracker.collect([{ ...flood, life: 3 }], 50), []);
  assert.deepEqual(tracker.collect([{ ...flood, life: 2.8 }], 50.2), []);
});
