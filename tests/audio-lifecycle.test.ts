import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { GameAudio } from '../src/audio';

class FakeParam {
  value = 0;
  setValueAtTime(value: number, _time: number) { this.value = value; }
  linearRampToValueAtTime(value: number, _time: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number, _time: number) { this.value = value; }
  setTargetAtTime(value: number, _time: number, _constant: number) { this.value = value; }
  cancelScheduledValues(_time: number) {}
}
class FakeNode {
  connections: FakeNode[] = [];
  disconnected = false;
  connect(destination: FakeNode) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; }
}
class FakeSource extends FakeNode {
  frequency = new FakeParam();
  detune = new FakeParam();
  playbackRate = new FakeParam();
  type = 'sine';
  buffer: unknown;
  loop = false;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: number[] = [];
  start(time = 0) { this.starts.push(time); }
  stop(time = 0) { this.stops.push(time); }
}
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 1;
  sampleRate = 22_050;
  state = 'suspended';
  destination = new FakeNode();
  sources: FakeSource[] = [];
  resumes = 0;
  closes = 0;
  decodes = 0;
  constructor() { FakeContext.instances.push(this); }
  createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam() }); }
  createOscillator() { const node = new FakeSource(); this.sources.push(node); return node; }
  createBufferSource() { const node = new FakeSource(); this.sources.push(node); return node; }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam() }); }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() }); }
  createDelay(_maximum?: number) { return Object.assign(new FakeNode(), { delayTime: new FakeParam() }); }
  createStereoPanner() { return Object.assign(new FakeNode(), { pan: new FakeParam() }); }
  createBuffer(channels: number, length: number, _sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / this.sampleRate, getChannelData: (channel: number) => data[channel] };
  }
  async resume() { this.resumes++; this.state = 'running'; }
  async decodeAudioData(_data: ArrayBuffer) { this.decodes++; return { duration: 1.5, spokenVoice: true }; }
  async close() { this.closes++; this.state = 'closed'; }
}

function harness(t: TestContext) {
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  FakeContext.instances = [];
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeContext });
  let nextTimer = 1;
  const intervals = new Map<number, () => void>();
  const createInterval = ((callback: () => void) => { const id = nextTimer++; intervals.set(id, callback); return id; }) as unknown as typeof setInterval;
  const removeInterval = ((id: number) => { intervals.delete(id); }) as unknown as typeof clearInterval;
  t.mock.method(globalThis, 'setInterval', createInterval);
  t.mock.method(globalThis, 'clearInterval', removeInterval);
  t.after(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'AudioContext', originalAudio);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  return { intervals, context: () => FakeContext.instances[0] };
}

async function settleUnlock(audio: GameAudio) { await audio.unlock(); await Promise.resolve(); }

// Mock only the browser audio device and the recurring scheduler. These tests
// check lifecycle failures that pure score/event timing tests cannot exercise.
test('audio waits for a user unlock and repeated scene updates keep one music scheduler', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.setScene('preparation', false, false);
  assert.equal(FakeContext.instances.length, 0);
  assert.equal(h.intervals.size, 0);
  await settleUnlock(audio);
  assert.equal(FakeContext.instances.length, 1);
  assert.equal(h.intervals.size, 1);
  const started = h.context().sources.length;
  assert.ok(started > 0, 'unlocked background music creates voices');
  for (let i = 0; i < 50; i++) audio.setScene('preparation', false, false);
  assert.equal(h.intervals.size, 1);
  assert.equal(h.context().sources.length, started, 'same scene does not restart the score');
  await settleUnlock(audio);
  assert.equal(FakeContext.instances.length, 1);
  assert.equal(h.intervals.size, 1);
});

test('background music and attack effects have independent mute controls', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.enabled = false;
  audio.setScene('battle', false, false);
  await settleUnlock(audio);
  assert.equal(h.intervals.size, 1, 'disabling effects does not disable music');
  let before = h.context().sources.length;
  audio.play('build');
  assert.equal(h.context().sources.length, before, 'effect mute suppresses effect voices');
  audio.musicEnabled = false;
  assert.equal(h.intervals.size, 0);
  assert.equal(audio.enabled, false);
  audio.enabled = true;
  audio.play('build');
  assert.ok(h.context().sources.length > before, 'effects still play with music muted');
  before = h.context().sources.length;
  audio.enabled = false;
  audio.musicEnabled = true;
  assert.equal(h.intervals.size, 1);
  assert.ok(h.context().sources.length > before, 'music-only playback can restart');
});

test('pause, page hiding and disposal stop the music and resume without overlapping loops', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.setScene('battle', false, false);
  await settleUnlock(audio);
  const ctx = h.context(), musicVoices = [...ctx.sources];
  audio.setScene('battle', true, false);
  assert.equal(h.intervals.size, 0);
  assert.ok(musicVoices.every(node => node.stops.some(time => time <= ctx.currentTime + .02)), 'pause cancels already scheduled music voices');
  audio.setScene('battle', false, false);
  assert.equal(h.intervals.size, 1);
  audio.setScene('battle', false, true);
  assert.equal(h.intervals.size, 0);
  audio.setScene('battle', false, false);
  assert.equal(h.intervals.size, 1);
  audio.dispose();
  assert.equal(h.intervals.size, 0);
  assert.equal(ctx.closes, 1);
});

async function settleVoice() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

test('bundled unit voices rotate lines, throttle repeated clicks and interrupt the previous speaker', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  const fetched: string[] = [];
  t.mock.method(globalThis, 'fetch', (async (url: string | URL | Request) => {
    fetched.push(String(url));
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(32) } as Response;
  }) as typeof fetch);
  assert.equal(audio.playUnitVoice('hero'), null, 'selection cannot create an audio device before a gesture');
  await settleUnlock(audio);
  assert.match(audio.playUnitVoice('hero')!.src, /hero-1\.mp3$/);
  assert.equal(audio.voiceStatus, 'loading');
  await settleVoice();
  const ctx = h.context(), first = ctx.sources.at(-1)!;
  assert.equal(audio.voiceStatus, 'ready');
  assert.ok(first.buffer);
  assert.equal(audio.playUnitVoice('hero'), null, 'repeated clicks do not chatter over the same line');
  assert.match(audio.playUnitVoice('tower-cannon')!.src, /tower-cannon-1\.mp3$/);
  assert.equal(first.stops.length, 1, 'a different unit interrupts the previous voice');
  await settleVoice();
  ctx.currentTime += .7;
  assert.match(audio.playUnitVoice('hero')!.src, /hero-2\.mp3$/);
  await settleVoice();
  ctx.currentTime += .7;
  assert.match(audio.playUnitVoice('hero')!.src, /hero-1\.mp3$/);
  await settleVoice();
  assert.equal(fetched.length, 3, 'decoded clips are cached across repeated selection');
  assert.equal(ctx.decodes, 3);
  assert.equal(audio.playUnitVoice('unknown-unit'), null);
});

test('effects mute, pause, hidden pages and reset stop speech and prevent delayed speech from starting', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  let requestSignal: AbortSignal | undefined;
  let finishFetch: ((response: Response) => void) | undefined;
  t.mock.method(globalThis, 'fetch', ((_url: unknown, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return new Promise<Response>(resolve => { finishFetch = resolve; });
  }) as typeof fetch);
  await settleUnlock(audio);
  audio.musicEnabled = false;
  audio.playUnitVoice('hero');
  const before = h.context().sources.length;
  audio.setScene('battle', true, false);
  assert.ok(requestSignal!.aborted);
  finishFetch!({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
  await settleVoice();
  assert.equal(h.context().sources.length, before, 'a canceled asset cannot begin speech after pause');
  assert.equal(audio.playUnitVoice('hero'), null);
  audio.setScene('battle', false, false);
  h.context().currentTime += 1;
  audio.playUnitVoice('hero');
  audio.setScene('battle', false, true);
  assert.ok(requestSignal!.aborted, 'hiding the page cancels an in-flight response');
  assert.equal(audio.playUnitVoice('soldier-1'), null);
  audio.setScene('battle', false, false);
  audio.playUnitVoice('soldier-1');
  audio.enabled = false;
  assert.ok(requestSignal!.aborted, 'effects mute also mutes unit speech');
  assert.equal(audio.playUnitVoice('tower-cannon'), null);
  audio.enabled = true;
  audio.playUnitVoice('reinforcement');
  audio.resetEffects();
  assert.ok(requestSignal!.aborted, 'changing level cancels pending speech');
  audio.playUnitVoice('hero');
  audio.dispose();
  assert.ok(requestSignal!.aborted);
  assert.equal(audio.playUnitVoice('hero'), null);
});

test('failed speech assets expose an honest UI fallback and a later selection can retry', async t => {
  harness(t);
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  const feedback: string[] = [];
  audio.onVoiceError = message => feedback.push(message);
  t.mock.method(globalThis, 'fetch', (async () => { throw new Error('asset unavailable'); }) as typeof fetch);
  await settleUnlock(audio);
  assert.ok(audio.playUnitVoice('hero'));
  await settleVoice();
  assert.equal(audio.voiceStatus, 'unavailable');
  assert.equal(feedback.length, 1);
  assert.match(feedback[0], /语音暂不可用/);
  assert.ok(audio.playUnitVoice('tower-arrow'), 'a different selection is allowed to retry');
  await settleVoice();
  assert.equal(feedback.length, 2);
});

test('encyclopedia voice previews can speak while the battle is paused but respect mute and visibility', async t => {
  const h = harness(t), audio = new GameAudio();
  t.after(() => audio.dispose());
  t.mock.method(globalThis, 'fetch', (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)) as typeof fetch);
  await settleUnlock(audio);
  audio.setScene('battle', true, false);
  assert.equal(audio.playUnitVoice('enemy-serpent'), null);
  assert.ok(audio.playUnitVoice('enemy-serpent', true));
  await settleVoice();
  const voice = h.context().sources.at(-1)!;
  assert.ok(voice.buffer, 'the preview creates a decoded speech source while battle time is frozen');
  audio.enabled = false;
  assert.equal(voice.stops.length, 1);
  assert.equal(audio.playUnitVoice('enemy-imp', true), null);
  audio.enabled = true;
  audio.setScene('battle', true, true);
  assert.equal(audio.playUnitVoice('enemy-imp', true), null);
});
