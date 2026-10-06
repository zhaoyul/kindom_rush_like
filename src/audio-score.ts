import type { Effect } from './types';

export const MUSIC_TEMPO = 86;
export const MUSIC_BARS = 16;
export const MUSIC_BEAT = 60 / MUSIC_TEMPO;
export const MUSIC_LENGTH = MUSIC_BARS * 4 * MUSIC_BEAT;
export type Instrument = 'flute' | 'harp' | 'strings' | 'bass' | 'drum' | 'shaker';
export interface MusicNote { beat: number; duration: number; midi: number; velocity: number; instrument: Instrument; pan: number }

/** Original 16-bar woodland theme: flute melody, harp ostinato and warm string chords. */
export function createMusicScore(): MusicNote[] {
  const notes: MusicNote[] = [];
  const chords = [
    [50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [48, 55, 60, 64],
    [50, 57, 62, 65], [43, 50, 55, 58], [45, 52, 57, 61], [50, 57, 62, 65],
    [46, 53, 58, 62], [48, 55, 60, 64], [50, 57, 62, 65], [43, 50, 55, 58],
    [46, 53, 58, 62], [45, 52, 57, 61], [50, 57, 62, 65], [50, 57, 62, 65],
  ];
  const melody = [
    [[0, 74, 1.4], [1.5, 77, .4], [2, 76, .8], [3, 72, .8]],
    [[0, 72, .9], [1, 74, .9], [2, 76, 1.5]],
    [[0, 77, 1.4], [1.5, 79, .4], [2, 77, .8], [3, 74, .8]],
    [[0, 76, 1.4], [1.5, 74, .4], [2, 72, 1.4]],
    [[0, 74, .8], [1, 77, .8], [2, 81, 1.4]],
    [[0, 79, 1.4], [1.5, 77, .4], [2, 74, .8], [3, 70, .8]],
    [[0, 73, .8], [1, 76, .8], [2, 81, .8], [3, 79, .8]],
    [[0, 77, .8], [1, 76, .8], [2, 74, 1.6]],
    [[0, 77, .9], [1, 79, .9], [2, 82, 1.4]],
    [[0, 81, 1.4], [1.5, 79, .4], [2, 76, 1.4]],
    [[0, 77, .8], [1, 81, .8], [2, 86, .8], [3, 84, .8]],
    [[0, 82, 1.4], [1.5, 81, .4], [2, 79, 1.4]],
    [[0, 77, .8], [1, 74, .8], [2, 70, .8], [3, 74, .8]],
    [[0, 76, 1.3], [1.5, 73, .4], [2, 69, 1.5]],
    [[0, 74, .8], [1, 77, .8], [2, 76, .8], [3, 72, .8]],
    [[0, 74, 2.7]],
  ];
  const add = (instrument: Instrument, beat: number, duration: number, midi: number, velocity: number, pan = 0) => notes.push({ instrument, beat, duration, midi, velocity, pan });
  chords.forEach((chord, bar) => {
    const start = bar * 4;
    chord.slice(1).forEach((midi, i) => add('strings', start, 3.85, midi, .30, (i - 1) * .34));
    add('bass', start, 1.65, chord[0] - 12, .70);
    add('bass', start + 2, 1.65, chord[0] - 5, .51);
    for (let i = 0; i < 8; i++) add('harp', start + i * .5, .63, chord[1 + [0, 1, 2, 1, 0, 2, 1, 2][i]] + (i % 4 === 3 ? 12 : 0), i % 2 ? .38 : .48, i % 2 ? .28 : -.28);
    melody[bar].forEach(([beat, midi, duration]) => add('flute', start + beat, duration, midi, .72 + (bar >= 8 ? .08 : 0), -.12));
    add('drum', start, .30, 45, .37); add('drum', start + 2, .27, 47, .27);
    for (let i = 0; i < 8; i++) add('shaker', start + i * .5, .09, 0, i % 2 ? .22 : .13, .45);
  });
  return notes.sort((a, b) => a.beat - b.beat);
}

export type SoundKind = 'click' | 'build' | 'wave' | 'meteor' | 'win' | 'hit' | 'error'
  | 'bow' | 'arrow-hit' | 'magic-cast' | 'magic-hit' | 'hero-swing' | 'sword' | 'metal'
  | 'dagger' | 'wolf' | 'bite' | 'axe' | 'stone' | 'staff' | 'hero-power' | 'heal' | 'meteor-fall'
  | 'volley-bow' | 'volley-hit' | 'deadeye-draw' | 'deadeye-hit' | 'vines'
  | 'arc-chain' | 'arc-hit' | 'overload-cast' | 'overload-hit' | 'frost'
  | 'cleave' | 'forest-heal' | 'fortify' | 'moon-dash' | 'moon-hit' | 'roots-rise' | 'oak-oath'
  | 'cannon-fire' | 'cannon-blast' | 'pierce-fire' | 'pierce-blast' | 'cluster-blast' | 'quake'
  | 'mud-hit' | 'venom-bite' | 'frost-bite' | 'fire-spark' | 'floodgate-open' | 'floodgate-flow';
export interface EffectCue { kind: SoundKind; at: number; priority: number }
export interface SoundEvent extends EffectCue { effectId: number; x: number }

/** Cue times follow combat-art.ts's windup/sweep and projectile arrival, not instantaneous damage. */
export function effectCues(effect: Effect): EffectCue[] {
  const cue = (kind: SoundKind, progress = 0, priority = 1): EffectCue => ({ kind, at: effect.maxLife * progress, priority });
  if (effect.type === 'ring' && effect.style === 'floodgate') return [cue('floodgate-open', 0, 3), { kind: 'floodgate-flow', at: .16, priority: 3 }];
  // The warning only owns its opening cue. A hit is voiced by the actual resolution
  // effect, so dodging/interrupting can never leave a delayed slam sound behind.
  if (effect.type === 'boss-warning') return [cue('wave', 0, 4)];
  if (effect.type === 'ring' && effect.style === 'boss-slam') return [cue('quake', 0, 4)];
  if (effect.type === 'ring' && effect.style === 'boss-interrupted') return [cue('magic-hit', 0, 4)];
  if (effect.type === 'shell') return [cue(effect.style === 'cannon-pierce' ? 'pierce-fire' : 'cannon-fire', 0, 3)];
  if (effect.type === 'explosion') {
    if (effect.style === 'imp') return [cue('fire-spark', 0, 2)];
    // The matching .45-second shell lands at 84% of its trajectory.
    return [{ kind: effect.style === 'cannon-cluster' ? 'cluster-blast' : effect.style === 'cannon-pierce' ? 'pierce-blast' : 'cannon-blast', at: .45 * .84, priority: 3 }];
  }
  if (effect.type === 'ring' && effect.style === 'cannon-quake') return [cue('quake', .12, 3)];
  if (effect.type === 'arrow') {
    // The volley circle owns the salvo: sounding every arrow would duplicate the same shot.
    if (effect.style === 'arrow-volley') return [];
    if (effect.style === 'arrow-deadeye') return [cue('deadeye-draw', 0, 3), cue('deadeye-hit', .80, 3)];
    if (effect.style === 'arrow-snare') return [cue('bow'), cue('vines', .80, 2)];
  }
  if (effect.type === 'bolt' && effect.style === 'mage-overload') return [cue('overload-cast', 0, 3), cue('overload-hit', .77, 3)];
  if (effect.type === 'chain') {
    const hits = Math.max(1, (effect.points?.length ?? 2) - 1);
    return [cue('arc-chain', .05, 2), ...Array.from({ length: hits }, (_, i) => cue('arc-hit', Math.min(.85, .16 + i * .10), 2))];
  }
  if (effect.type === 'frost-zone') return [cue('frost', .04, 2)];
  if (effect.type === 'hero-dash') return [cue('moon-dash', .08, 4), cue('moon-hit', .55, 4)];
  if (effect.type === 'roots') return [cue('roots-rise', .04, 4)];
  if (effect.type === 'oath') return [cue('oak-oath', .05, 4)];
  if (effect.type === 'ring' && effect.style === 'arrow-volley') return [cue('volley-bow', 0, 2), { kind: 'volley-hit', at: .24, priority: 2 }];
  if (effect.type === 'ring' && effect.style === 'barracks-cleave') return [cue('cleave', .14, 2), cue('metal', .32, 2)];
  if (effect.type === 'ring' && effect.style === 'barracks-fortify') return [cue('fortify', 0, 2)];
  // Mend creates a circle plus individual ally pulses. Only the tower circle owns its cue.
  if (effect.type === 'ring' && effect.style === 'barracks-mend') return [cue('forest-heal', 0, 2)];
  if (effect.type === 'heal' && effect.style === 'barracks-mend') return [];
  if (effect.type === 'arrow') return [cue('bow'), cue('arrow-hit', .80)];
  if (effect.type === 'bolt') return [cue('magic-cast'), cue('magic-hit', .77)];
  if (effect.type === 'meteor') return [cue('meteor-fall', 0, 4), cue('meteor', .42, 4)];
  if (effect.type === 'hero-burst') return [cue('hero-power', 0, 4)];
  if (effect.type === 'heal') return [cue('heal', 0, 2)];
  if (effect.type === 'slash') {
    switch (effect.style) {
      case 'hero': return [cue('hero-swing', .22, 3), cue('metal', .44, 3)];
      case 'wolf': return [cue('wolf', .20), cue('bite', .42)];
      case 'golem': return [cue('stone', .42, 2)];
      case 'shaman': return [cue('staff', .24), cue('magic-hit', .43)];
      case 'orc': case 'chieftain': return [cue('axe', .22, 2), cue('metal', .44, 2)];
      case 'goblin': return [cue('dagger', .23), cue('hit', .43)];
      case 'bogling': return [cue('mud-hit', .43)];
      case 'serpent': return [cue('venom-bite', .42)];
      case 'icewolf': return [cue('wolf', .20), cue('frost-bite', .42)];
      case 'frostguard': return [cue('axe', .22, 2), cue('metal', .44, 2)];
      case 'imp': return [cue('fire-spark', .28), cue('magic-hit', .43)];
      case 'juggernaut': return [cue('stone', .40, 3)];
      default: return [cue('sword', .22), cue('metal', .44)];
    }
  }
  // Paired impact effects are created at damage time, before visual contact. Their parent
  // projectile/slash/skill owns the sound so contact is never duplicated or played early.
  if (effect.type === 'impact' && !effect.style) return [cue('hit', .28)];
  return [];
}

export class EffectSoundTracker {
  private fired = new Map<number, Set<number>>();
  private lastTime = -Infinity;
  reset() { this.fired.clear(); this.lastTime = -Infinity; }
  collect(effects: readonly Effect[], gameTime: number, paused = false): SoundEvent[] {
    if (gameTime < this.lastTime) this.reset();
    this.lastTime = gameTime;
    const present = new Set(effects.map(e => e.id));
    for (const id of this.fired.keys()) if (!present.has(id)) this.fired.delete(id);
    if (paused) return [];
    const events: SoundEvent[] = [];
    for (const effect of effects) {
      if (!Number.isFinite(effect.life) || effect.maxLife <= 0 || effect.life <= 0) continue;
      const elapsed = Math.max(0, effect.maxLife - effect.life);
      const known = this.fired.has(effect.id);
      const fired = this.fired.get(effect.id) ?? new Set<number>();
      this.fired.set(effect.id, fired);
      effectCues(effect).forEach((cue, index) => {
        if (fired.has(index) || elapsed + 1e-6 < cue.at) return;
        fired.add(index);
        // Discard stale cues if an existing battle becomes audible or the tab resumes.
        if (!known && elapsed - cue.at > .085) return;
        events.push({ ...cue, effectId: effect.id, x: effect.toX ?? effect.x });
      });
    }
    return events.sort((a, b) => b.priority - a.priority);
  }
}
