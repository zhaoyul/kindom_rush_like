import type { Effect, Phase } from './types';
import { createMusicScore, EffectSoundTracker, MUSIC_BEAT, MUSIC_LENGTH, type MusicNote, type SoundKind } from './audio-score';
import { UNIT_VOICES, type UnitVoiceLine, type VoiceId } from './voices';

type Source = OscillatorNode | AudioBufferSourceNode;
interface Voice { source: Source; gain: GainNode; nodes: AudioNode[]; music: boolean }
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** The real-time game and downloadable preview use this same original synthesizer. */
class ForestSynth {
  readonly music: GainNode;
  readonly effects: GainNode;
  readonly voices = new Set<Voice>();
  private noiseBuffer: AudioBuffer;
  private musicInput: GainNode;

  constructor(readonly context: BaseAudioContext) {
    this.music = context.createGain(); this.music.gain.value = .70;
    this.effects = context.createGain(); this.effects.gain.value = .82;
    const master = context.createGain(); master.gain.value = .82;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 3;
    compressor.attack.value = .004; compressor.release.value = .16;
    this.musicInput = context.createGain();
    this.musicInput.connect(this.music).connect(master); this.effects.connect(master); master.connect(compressor).connect(context.destination);
    // Two quiet filtered echoes give the flute and strings woodland ambience.
    const ambience = context.createGain(); ambience.gain.value = .19; this.musicInput.connect(ambience);
    for (const [seconds, pan] of [[.19, -.5], [.31, .5]]) {
      const delay = context.createDelay(.5), filter = context.createBiquadFilter();
      const feedback = context.createGain(), stereo = context.createStereoPanner();
      delay.delayTime.value = seconds; filter.type = 'lowpass'; filter.frequency.value = 2600;
      feedback.gain.value = .20; stereo.pan.value = pan;
      ambience.connect(delay); delay.connect(filter); filter.connect(feedback).connect(delay);
      filter.connect(stereo).connect(this.music);
    }
    this.noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    let seed = 29451;
    for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] = seed / 4294967296 * 2 - 1; }
  }

  private envelope(gain: GainNode, when: number, duration: number, peak: number, attack = .004, release = .02) {
    gain.gain.setValueAtTime(.00001, when);
    gain.gain.linearRampToValueAtTime(Math.max(.00002, peak), when + Math.min(attack, duration * .35));
    gain.gain.setValueAtTime(Math.max(.00002, peak), when + Math.max(attack, duration - release));
    gain.gain.exponentialRampToValueAtTime(.00001, when + duration);
  }

  private register(source: Source, gain: GainNode, nodes: AudioNode[], when: number, duration: number, music: boolean) {
    const voice: Voice = { source, gain, nodes, music }; this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); for (const node of nodes) node.disconnect(); };
    source.start(when); source.stop(when + duration + .008);
  }

  tone(when: number, hz: number, duration: number, peak: number, type: OscillatorType = 'sine', music = false,
    endHz = hz, pan = 0, attack = .004, release = duration * .85, cutoff = 6000, detune = 0) {
    const ctx = this.context, source = ctx.createOscillator(), gain = ctx.createGain();
    const filter = ctx.createBiquadFilter(), stereo = ctx.createStereoPanner();
    source.type = type; source.detune.value = detune; source.frequency.setValueAtTime(hz, when);
    if (endHz !== hz) source.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), when + duration * .82);
    filter.type = 'lowpass'; filter.frequency.value = cutoff; stereo.pan.value = pan;
    this.envelope(gain, when, duration, peak, attack, release);
    source.connect(filter).connect(gain).connect(stereo).connect(music ? this.musicInput : this.effects);
    this.register(source, gain, [source, filter, gain, stereo], when, duration, music);
  }

  noise(when: number, duration: number, peak: number, cutoff: number, music = false, pan = 0,
    type: BiquadFilterType = 'bandpass', endCutoff = cutoff) {
    const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain();
    const filter = ctx.createBiquadFilter(), stereo = ctx.createStereoPanner();
    source.buffer = this.noiseBuffer; filter.type = type; filter.Q.value = .6;
    filter.frequency.setValueAtTime(cutoff, when);
    if (endCutoff !== cutoff) filter.frequency.exponentialRampToValueAtTime(endCutoff, when + duration);
    stereo.pan.value = pan; this.envelope(gain, when, duration, peak, .003, duration * .86);
    source.connect(filter).connect(gain).connect(stereo).connect(music ? this.musicInput : this.effects);
    this.register(source, gain, [source, filter, gain, stereo], when, duration, music);
  }

  note(note: MusicNote, when: number, intensity = 1) {
    const hz = frequency(note.midi), duration = note.duration * MUSIC_BEAT, v = note.velocity * intensity;
    switch (note.instrument) {
      case 'flute':
        this.tone(when, hz, duration + .13, .038 * v, 'sine', true, hz, note.pan, .055, .18);
        this.tone(when, hz * 2, duration + .1, .0045 * v, 'sine', true, hz * 2, note.pan, .06, .15);
        this.noise(when, duration, .0024 * v, hz * 2.3, true, note.pan); break;
      case 'harp':
        this.tone(when, hz, duration + .20, .035 * v, 'triangle', true, hz, note.pan, .004, duration + .16, 2700);
        this.tone(when, hz * 2, duration * .6, .006 * v, 'sine', true, hz * 2, note.pan); break;
      case 'strings':
        this.tone(when, hz, duration + .45, .011 * v, 'triangle', true, hz, note.pan, .28, .55, 1100, -4);
        this.tone(when, hz, duration + .45, .011 * v, 'triangle', true, hz, note.pan, .31, .55, 1100, 4); break;
      case 'bass': this.tone(when, hz, duration + .12, .040 * v, 'sine', true, hz, note.pan, .015, .3); break;
      case 'drum':
        this.tone(when, 115, duration, .074 * v, 'sine', true, 48);
        this.noise(when, .08, .022 * v, 500, true, 0, 'lowpass'); break;
      case 'shaker': this.noise(when, duration, .024 * v, 5200, true, note.pan, 'highpass'); break;
    }
  }

  sound(kind: SoundKind, when: number, pan = 0) {
    const tone = (hz: number, duration: number, peak: number, type: OscillatorType = 'sine', end = hz, offset = 0, cutoff = 6000) => this.tone(when + offset, hz, duration, peak, type, false, end, pan, .003, duration * .85, cutoff);
    const noise = (duration: number, peak: number, cutoff: number, type: BiquadFilterType = 'bandpass', end = cutoff, offset = 0) => this.noise(when + offset, duration, peak, cutoff, false, pan, type, end);
    switch (kind) {
      case 'click': tone(660, .075, .032, 'triangle'); break;
      case 'build': [62, 69, 74].forEach((m, i) => tone(frequency(m), .28, .037, 'triangle', frequency(m), i * .085, 2600)); break;
      case 'wave':
        [50, 57, 62].forEach((m, i) => tone(frequency(m), .31, .025, 'triangle', frequency(m), i * .12, 1400));
        tone(115, .19, .047, 'sine', 50); break;
      case 'win': [74, 77, 81, 86].forEach((m, i) => tone(frequency(m), .42, .038, 'sine', frequency(m), i * .16)); break;
      case 'error': tone(185, .17, .036, 'triangle', 93); break;
      case 'bow': tone(310, .16, .047, 'triangle', 92, 0, 2000); noise(.065, .039, 2100); break;
      case 'arrow-hit': noise(.053, .065, 2500, 'highpass'); tone(180, .08, .025, 'triangle', 80); break;
      case 'volley-bow':
        [0, .035, .075].forEach(offset => { tone(335, .13, .025, 'triangle', 108, offset, 2300); noise(.055, .024, 2700, 'bandpass', 3500, offset); }); break;
      case 'volley-hit':
        [0, .045, .09].forEach(offset => { noise(.055, .036, 2600, 'highpass', 2100, offset); tone(160, .07, .013, 'triangle', 75, offset); }); break;
      case 'deadeye-draw': tone(220, .26, .040, 'triangle', 690, 0, 1900); noise(.16, .025, 900, 'bandpass', 3100); break;
      case 'deadeye-hit':
        noise(.09, .088, 3600, 'highpass'); tone(170, .16, .051, 'sine', 38);
        tone(1320, .14, .016, 'triangle', 550); break;
      case 'vines': noise(.36, .055, 1100, 'bandpass', 280); tone(155, .27, .022, 'triangle', 82, 0, 800); break;
      case 'magic-cast': tone(360, .19, .031, 'sine', 830); tone(1175, .17, .013); noise(.085, .011, 2400); break;
      case 'magic-hit': tone(830, .18, .037, 'sine', 240); tone(1245, .14, .017, 'sine', 500); noise(.12, .027, 2300); break;
      case 'arc-chain': noise(.14, .046, 2800, 'highpass', 5400); tone(590, .22, .026, 'sawtooth', 1480, 0, 2300); break;
      case 'arc-hit': noise(.055, .045, 4600, 'highpass'); tone(1770, .10, .019, 'square', 830, 0, 3800); break;
      case 'overload-cast':
        tone(165, .32, .039, 'triangle', 520, 0, 2200); tone(333, .31, .018, 'sine', 1050);
        noise(.24, .020, 600, 'bandpass', 3600); break;
      case 'overload-hit':
        tone(74, .35, .076, 'sine', 24); tone(990, .28, .030, 'sawtooth', 140, 0, 2200);
        noise(.30, .078, 2500, 'lowpass', 430); break;
      case 'frost':
        [86, 93, 98].forEach((m, i) => tone(frequency(m), .48, .019, 'sine', frequency(m), i * .075));
        noise(.55, .032, 4300, 'highpass', 1900); break;
      case 'hero-swing': noise(.17, .082, 700, 'bandpass', 2900); tone(160, .13, .018, 'triangle', 80); break;
      case 'sword': noise(.095, .051, 1900, 'bandpass', 2800); break;
      case 'cleave': noise(.36, .086, 650, 'bandpass', 3300); tone(145, .27, .028, 'triangle', 61, 0, 1800); break;
      case 'metal':
        noise(.055, .046, 3300, 'highpass'); tone(1660, .085, .018, 'square', 1050, 0, 3100);
        tone(930, .21, .016); tone(1420, .15, .009); break;
      case 'dagger': noise(.063, .037, 3200); tone(390, .07, .018, 'triangle', 260); break;
      case 'wolf': tone(123, .17, .032, 'sawtooth', 75, 0, 520); noise(.13, .034, 750); break;
      case 'bite': noise(.085, .052, 750); tone(130, .075, .028, 'sine', 63); break;
      case 'axe': noise(.17, .060, 850, 'bandpass', 1500); tone(115, .16, .027, 'triangle', 65); break;
      case 'stone':
        tone(100, .28, .065, 'sine', 28); noise(.25, .088, 1400, 'lowpass', 450);
        noise(.095, .036, 2400, 'bandpass', 1000, .06); noise(.06, .028, 1700, 'bandpass', 1000, .13); break;
      case 'staff': [800, 1050, 1400].forEach((hz, i) => tone(hz, .15, .019, 'sine', hz * .8, i * .045)); break;
      case 'hero-power':
        [74, 77, 81, 86].forEach((m, i) => tone(frequency(m), .64, .028, 'sine', frequency(m) * 1.003, i * .07));
        noise(.35, .032, 1400, 'bandpass', 3400); tone(95, .35, .033, 'sine', 45); break;
      case 'moon-dash':
        noise(.31, .074, 460, 'bandpass', 4100); tone(415, .32, .027, 'sine', 1660);
        tone(830, .22, .013, 'sine', 2490, .06); break;
      case 'moon-hit':
        noise(.075, .079, 3700, 'highpass'); tone(1220, .32, .031, 'sine', 610);
        tone(1850, .26, .016, 'sine', 1230); tone(115, .19, .040, 'sine', 42); break;
      case 'roots-rise':
        tone(73, .64, .047, 'triangle', 110, 0, 660); noise(.60, .062, 400, 'lowpass', 1500);
        [0, .10, .20].forEach(offset => noise(.09, .032, 2400, 'bandpass', 530, offset)); break;
      case 'oak-oath':
        [50, 57, 62, 69].forEach((m, i) => tone(frequency(m), .95, .028, 'triangle', frequency(m), i * .065, 950));
        [74, 81, 86].forEach((m, i) => tone(frequency(m), .70, .016, 'sine', frequency(m), .23 + i * .09));
        noise(.45, .022, 1000, 'bandpass', 2100); break;
      case 'forest-heal':
        [74, 77, 81, 86].forEach((m, i) => tone(frequency(m), .47, .020, 'sine', frequency(m), i * .09));
        noise(.28, .011, 3700, 'highpass'); break;
      case 'fortify':
        tone(220, .42, .030, 'triangle', 220, 0, 1200); tone(440, .33, .018, 'sine', 440, .04);
        noise(.11, .026, 900, 'lowpass'); break;
      case 'heal': [77, 81, 84].forEach((m, i) => tone(frequency(m), .33, .019, 'sine', frequency(m), i * .07)); break;
      case 'meteor-fall': noise(.39, .060, 550, 'lowpass', 2600); tone(180, .36, .028, 'triangle', 52, 0, 1000); break;
      case 'meteor': tone(88, .55, .11, 'sine', 22); noise(.46, .115, 1700, 'lowpass', 300); tone(190, .19, .027, 'triangle', 70); break;
      case 'cannon-fire':
        tone(125, .25, .09, 'sine', 38); noise(.17, .087, 1700, 'lowpass', 450);
        noise(.06, .042, 3800, 'highpass'); break;
      case 'cannon-blast':
        tone(83, .46, .091, 'sine', 26); noise(.39, .096, 2200, 'lowpass', 290);
        noise(.18, .044, 3000, 'bandpass', 1250, .045); break;
      case 'pierce-fire':
        tone(100, .29, .094, 'triangle', 36, 0, 1200); noise(.21, .080, 1900, 'lowpass', 420);
        tone(1780, .12, .028, 'square', 690, .015, 3200); break;
      case 'pierce-blast':
        tone(66, .48, .10, 'sine', 23); noise(.35, .089, 1700, 'lowpass', 260);
        [0, .033, .075].forEach(offset => { noise(.064, .034, 3400, 'highpass', 2200, offset); tone(1180, .16, .014, 'triangle', 460, offset); }); break;
      case 'cluster-blast':
        [0, .085, .175].forEach(offset => { tone(95, .30, .049, 'sine', 28, offset); noise(.28, .059, 2300, 'lowpass', 350, offset); }); break;
      case 'quake':
        tone(62, .72, .10, 'sine', 21); noise(.63, .084, 1050, 'lowpass', 210);
        [0, .14, .29].forEach(offset => noise(.075, .028, 1900, 'bandpass', 590, offset)); break;
      case 'mud-hit': tone(120, .15, .036, 'sine', 52); noise(.19, .051, 680, 'lowpass', 230); break;
      case 'venom-bite': noise(.15, .047, 4100, 'highpass', 2600); tone(220, .09, .021, 'triangle', 82); break;
      case 'frost-bite':
        noise(.13, .049, 2200, 'bandpass', 3900); tone(136, .11, .026, 'sine', 67);
        tone(2400, .19, .013, 'sine', 1350); break;
      case 'fire-spark': noise(.23, .053, 3500, 'highpass', 1300); tone(330, .15, .020, 'triangle', 72); break;
      case 'floodgate-open':
        tone(168, .20, .028, 'triangle', 78, 0, 1300);
        noise(.11, .035, 900, 'lowpass', 440);
        [0, .06, .12].forEach(offset => { tone(790, .10, .013, 'sine', 410, offset); noise(.045, .016, 2200, 'bandpass', 1000, offset); }); break;
      case 'floodgate-flow':
        // One short rush with a few rounded bubbles; the sustained field does not loop noise.
        noise(.92, .057, 2300, 'lowpass', 720); noise(.48, .016, 3600, 'highpass', 1700, .04);
        [650, 890, 460].forEach((hz, i) => tone(hz, .11, .012, 'sine', hz * .42, .08 + i * .14));
        tone(92, .60, .012, 'sine', 51, .02); break;
      case 'hit': noise(.066, .043, 1500); tone(185, .075, .029, 'sine', 82); break;
    }
  }

  stop(music: boolean) {
    const now = this.context.currentTime;
    for (const voice of [...this.voices]) {
      if (voice.music !== music) continue;
      voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(.00001, now);
      try { voice.source.stop(now + .005); } catch { /* Already ended sources are harmless. */ }
    }
  }
}

export class GameAudio {
  private effectsEnabled = true;
  private backgroundEnabled = true;
  private context: AudioContext | null = null;
  private synth: ForestSynth | null = null;
  private readonly score = createMusicScore();
  private readonly tracker = new EffectSoundTracker();
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private musicEpoch = 0;
  private musicPosition = 0;
  private cursor = 0;
  private loop = 0;
  private phase: Phase = 'preparation';
  private paused = false;
  private hidden = false;
  private disposed = false;
  private lastSounds = new Map<string, number>();
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceGain: GainNode | null = null;
  private voiceRequest: AbortController | null = null;
  private voiceGeneration = 0;
  private voiceBuffers = new Map<string, AudioBuffer>();
  private voiceChoices = new Map<VoiceId, number>();
  private lastVoiceKey: VoiceId | null = null;
  private lastVoiceAt = -Infinity;
  private voiceState: 'ready' | 'loading' | 'unavailable' = 'ready';
  /** Optional UI feedback when a bundled voice clip cannot be loaded or decoded. */
  onVoiceError: ((message: string) => void) | null = null;

  get voiceStatus() { return this.voiceState; }

  get enabled() { return this.effectsEnabled; }
  get isUnlocked() { return this.context?.state === 'running'; }
  set enabled(value: boolean) {
    this.effectsEnabled = value;
    if (!value) this.stopUnitVoice();
    if (this.synth) { this.synth.effects.gain.setTargetAtTime(value && !this.hidden ? .82 : 0, this.context!.currentTime, .025); if (!value) this.synth.stop(false); }
  }
  get musicEnabled() { return this.backgroundEnabled; }
  set musicEnabled(value: boolean) { this.backgroundEnabled = value; this.syncTransport(); }

  unlock() {
    if (this.disposed) return;
    if (!this.context) {
      this.context = new AudioContext(); this.synth = new ForestSynth(this.context);
      this.synth.effects.gain.value = this.effectsEnabled && !this.hidden ? .82 : 0;
      this.context.onstatechange = () => this.syncTransport();
    }
    void this.context.resume().then(() => this.syncTransport()).catch(() => { /* A new user gesture may resume later. */ });
    this.syncTransport();
  }

  setScene(phase: Phase, paused = false, hidden = false) {
    const becameSilent = (paused && !this.paused) || (hidden && !this.hidden);
    const visibilityChanged = hidden !== this.hidden;
    this.phase = phase; this.paused = paused; this.hidden = hidden;
    if (becameSilent) this.stopUnitVoice();
    if (this.synth) {
      if (visibilityChanged) this.synth.effects.gain.setTargetAtTime(this.effectsEnabled && !hidden ? .82 : 0, this.context!.currentTime, .025);
      if (becameSilent) this.synth.stop(false);
    }
    this.syncTransport();
  }

  private syncTransport() {
    const audible = !this.disposed && this.backgroundEnabled && !this.paused && !this.hidden && this.context?.state === 'running';
    if (!audible) { this.stopMusic(); return; }
    if (this.scheduler !== null || !this.context || !this.synth) return;
    this.synth.music.gain.setTargetAtTime(this.voiceSource ? .28 : .70, this.context.currentTime, .035);
    this.musicEpoch = this.context.currentTime + .045 - this.musicPosition;
    this.loop = 0;
    this.cursor = this.score.findIndex(note => note.beat * MUSIC_BEAT + 1e-5 >= this.musicPosition);
    if (this.cursor < 0) { this.cursor = 0; this.loop = 1; }
    this.scheduleMusic();
    this.scheduler = setInterval(() => this.scheduleMusic(), 50);
  }

  private scheduleMusic() {
    if (!this.context || !this.synth) return;
    const now = this.context.currentTime, horizon = now + .28;
    while (true) {
      const note = this.score[this.cursor], when = this.musicEpoch + this.loop * MUSIC_LENGTH + note.beat * MUSIC_BEAT;
      if (when > horizon) break;
      if (when >= now - .008) {
        const percussion = note.instrument === 'drum' || note.instrument === 'shaker';
        const intensity = percussion ? this.phase === 'battle' ? 1.2 : .65 : this.phase === 'defeat' ? .65 : 1;
        this.synth.note(note, Math.max(now + .003, when), intensity);
      }
      this.cursor++;
      if (this.cursor === this.score.length) { this.cursor = 0; this.loop++; }
    }
  }

  private stopMusic() {
    if (this.scheduler === null) return;
    clearInterval(this.scheduler); this.scheduler = null;
    if (!this.context || !this.synth) return;
    this.musicPosition = Math.max(0, this.context.currentTime - this.musicEpoch) % MUSIC_LENGTH;
    this.synth.music.gain.setTargetAtTime(0, this.context.currentTime, .02); this.synth.stop(true);
  }

  play(kind: SoundKind, x = 600, priority = 2) {
    if (!this.effectsEnabled || this.hidden || this.disposed || !this.context || !this.synth || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const group = kind === 'metal' || kind === 'hit' || kind === 'arrow-hit' || kind === 'volley-hit' ? 'contact' : kind;
    const last = this.lastSounds.get(group) ?? -Infinity;
    const interval = priority >= 3 ? .025 : group === 'contact' ? .065 : .055;
    if (now - last < interval) return;
    const effectsVoices = [...this.synth.voices].filter(voice => !voice.music).length;
    if (effectsVoices > 44 && priority < 3) return;
    this.lastSounds.set(group, now);
    this.synth.sound(kind, now + .003, clamp((x - 600) / 900, -.62, .62));
  }

  /** Accept a click response synchronously for subtitles; playback is decoded asynchronously. */
  playUnitVoice(id: VoiceId | string, preview = false): UnitVoiceLine | null {
    if (!Object.hasOwn(UNIT_VOICES, id) || !this.effectsEnabled || (this.paused && !preview) || this.hidden
      || this.disposed || !this.context || !this.synth) return null;
    const key = id as VoiceId, now = this.context.currentTime;
    if (key === this.lastVoiceKey && now - this.lastVoiceAt < .6) return null;
    this.stopUnitVoice();
    this.lastVoiceKey = key; this.lastVoiceAt = now;
    const set = UNIT_VOICES[key], index = this.voiceChoices.get(key) ?? 0;
    const line = set.lines[index % set.lines.length];
    this.voiceChoices.set(key, index + 1);
    this.voiceState = 'loading';
    const generation = this.voiceGeneration, request = new AbortController();
    this.voiceRequest = request;
    void this.loadUnitVoice(line, generation, request, preview);
    return line;
  }

  private async loadUnitVoice(line: UnitVoiceLine, generation: number, request: AbortController, preview: boolean) {
    const context = this.context, synth = this.synth;
    if (!context || !synth) return;
    try {
      let buffer = this.voiceBuffers.get(line.src);
      if (!buffer) {
        const response = await fetch(line.src, { signal: request.signal });
        if (!response.ok) throw new Error(`Voice asset HTTP ${response.status}`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) this.voiceBuffers.set(line.src, buffer);
      }
      if (generation !== this.voiceGeneration || request.signal.aborted || this.disposed
        || (this.paused && !preview) || this.hidden || !this.effectsEnabled) return;
      if (context.state !== 'running') throw new Error('Audio device is suspended');
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; gain.gain.value = .9;
      source.connect(gain).connect(synth.effects);
      this.voiceSource = source; this.voiceGain = gain; this.voiceRequest = null;
      this.voiceState = 'ready';
      // Keep words intelligible while retaining a quiet musical bed.
      synth.music.gain.setTargetAtTime(.28, context.currentTime, .08);
      source.onended = () => {
        source.disconnect(); gain.disconnect();
        if (this.voiceSource !== source) return;
        this.voiceSource = null; this.voiceGain = null;
        this.restoreMusicAfterVoice();
      };
      source.start(context.currentTime + .003);
    } catch {
      if (generation !== this.voiceGeneration || request.signal.aborted || this.disposed) return;
      this.voiceRequest = null; this.voiceState = 'unavailable';
      this.onVoiceError?.('语音暂不可用，请检查声音设备或刷新后重试。');
    }
  }

  private restoreMusicAfterVoice() {
    if (!this.synth || !this.context) return;
    const audible = this.scheduler !== null && this.backgroundEnabled && !this.paused && !this.hidden && !this.disposed;
    this.synth.music.gain.setTargetAtTime(audible ? .70 : 0, this.context.currentTime, .12);
  }

  private stopUnitVoice() {
    this.voiceGeneration++;
    this.voiceRequest?.abort(); this.voiceRequest = null;
    if (this.voiceSource) {
      const source = this.voiceSource; source.onended = null;
      try { source.stop(); } catch { /* Source may have ended before the click handler. */ }
      source.disconnect(); this.voiceGain?.disconnect();
      this.voiceSource = null; this.voiceGain = null;
    }
    this.voiceState = 'ready';
    this.restoreMusicAfterVoice();
  }

  updateEffects(effects: readonly Effect[], gameTime: number, _speed = 1, paused = false) {
    const events = this.tracker.collect(effects, gameTime, paused);
    if (paused || this.paused || this.hidden) return;
    for (const event of events.slice(0, 10)) this.play(event.kind, event.x, event.priority);
  }

  resetEffects() { this.tracker.reset(); this.lastSounds.clear(); this.synth?.stop(false); this.stopUnitVoice(); this.lastVoiceKey = null; this.lastVoiceAt = -Infinity; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopMusic(); this.synth?.stop(false); this.stopUnitVoice(); this.voiceBuffers.clear(); this.tracker.reset();
    if (this.context) { this.context.onstatechange = null; void this.context.close(); }
  }
}

/** Offline preview uses the identical score/synth without requiring audio autoplay. */
export async function renderAudioPreview(seconds = 16, includeCombat = false): Promise<Blob> {
  const duration = clamp(seconds, 2, 90), rate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(duration * rate), rate), synth = new ForestSynth(context);
  const score = createMusicScore();
  for (let loop = 0; loop * MUSIC_LENGTH < duration; loop++) {
    for (const note of score) {
      const when = loop * MUSIC_LENGTH + note.beat * MUSIC_BEAT;
      if (when + .01 < duration) synth.note(note, when + .01);
    }
  }
  if (includeCombat) {
    const sounds: SoundKind[] = ['bow', 'arrow-hit', 'magic-cast', 'magic-hit', 'hero-swing', 'metal', 'wolf', 'bite', 'axe', 'stone', 'hero-power', 'meteor',
      'volley-bow', 'volley-hit', 'deadeye-hit', 'vines', 'arc-chain', 'arc-hit', 'overload-hit', 'frost', 'cleave', 'forest-heal', 'moon-dash', 'moon-hit', 'roots-rise', 'oak-oath',
      'cannon-fire', 'cannon-blast', 'pierce-fire', 'pierce-blast', 'cluster-blast', 'quake'];
    sounds.forEach((kind, i) => { const when = 1 + i * .9; if (when < duration - 1) synth.sound(kind, when, i % 2 ? .3 : -.3); });
  }
  const buffer = await context.startRendering();
  const length = buffer.length * 4, data = new ArrayBuffer(44 + length), view = new DataView(data);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + length, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, length, true);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++) {
    const fade = Math.min(1, i / (rate * .04), (buffer.length - i) / (rate * .4));
    view.setInt16(44 + i * 4, clamp(left[i] * fade, -1, 1) * 32767, true);
    view.setInt16(46 + i * 4, clamp(right[i] * fade, -1, 1) * 32767, true);
  }
  return new Blob([data], { type: 'audio/wav' });
}
