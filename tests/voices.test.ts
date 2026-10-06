import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ENEMY_STATS } from '../src/data';
import { UNIT_VOICES, voiceForUnit } from '../src/voices';
import type { EnemyKind, TowerKind } from '../src/types';

test('every enemy, tower and allied class has two distinct MiMo English voice recordings with Chinese subtitles', () => {
  const targets = [
    voiceForUnit({ type: 'hero' }), voiceForUnit({ type: 'reinforcement' }),
    ...[1, 2, 3].map(level => voiceForUnit({ type: 'soldier', level })),
    ...(['arrow', 'mage', 'barracks', 'cannon'] as TowerKind[]).map(kind => voiceForUnit({ type: 'tower', kind })),
    ...(Object.keys(ENEMY_STATS) as EnemyKind[]).map(kind => voiceForUnit({ type: 'enemy', kind })),
  ];
  assert.equal(new Set(targets).size, 21);
  assert.equal(Object.keys(UNIT_VOICES).length, 21);
  const paths = new Set<string>(), texts = new Set<string>();
  let totalBytes = 0;
  for (const key of targets) {
    const group = UNIT_VOICES[key];
    assert.ok(group, `missing voice set for ${key}`);
    assert.equal(group.lines.length, 2);
    for (const line of group.lines) {
      assert.match(line.text, /^[A-Za-z][A-Za-z\s'!.,?–-]+$/);
      assert.match(line.subtitle ?? '', /[\u4e00-\u9fff]/);
      const words = line.text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)!;
      assert.ok(words.length >= 4 && words.length <= 8, `${key} should have a short 4–8 word battle bark`);
      assert.ok(!texts.has(line.text), `${key} reuses another unit's response`);
      assert.ok(!paths.has(line.src), `${key} reuses another recording`);
      texts.add(line.text); paths.add(line.src);
      const bytes = readFileSync(new URL(`../public${line.src}`, import.meta.url));
      assert.ok(bytes.length > 4_000, `${line.src} must contain a complete voice recording`);
      assert.equal(bytes.subarray(0, 3).toString(), 'ID3', `${line.src} has an MP3 header`);
      assert.ok(bytes.includes(Buffer.from([0xff, 0xf3])), `${line.src} contains MPEG audio frames`);
      totalBytes += bytes.length;
    }
  }
  assert.equal(paths.size, 42);
  assert.ok(totalBytes < 1_000_000, 'the complete speech pack stays below 1 MB');
});

test('MiMo provenance, distinct voice profiles and decoded audio checks agree with every shipped file', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/voices/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.provider, 'Xiaomi MiMo');
  assert.equal(manifest.apiBase, 'https://api.xiaomimimo.com/v1');
  assert.equal(manifest.language, 'en');
  assert.equal(manifest.subtitleLanguage, 'zh-CN');
  assert.equal(manifest.summary.clips, 42);
  assert.equal(manifest.summary.asrChecked, 42);
  assert.equal(manifest.summary.asrExact, 42);
  const presets = new Set<string>(), styles = new Set<string>();
  for (const [id, voice] of Object.entries(UNIT_VOICES)) {
    assert.equal(voice.profile.language, 'en');
    styles.add(voice.profile.style);
    if (voice.profile.preset) presets.add(voice.profile.preset);
    assert.deepEqual(manifest.units[id].profile, voice.profile);
    for (const [index, line] of voice.lines.entries()) {
      const meta = manifest.units[id].lines[index];
      assert.equal(meta.text, line.text);
      assert.equal(meta.subtitle, line.subtitle);
      assert.equal(meta.src, line.src);
      assert.equal(meta.model, line.model);
      assert.equal(meta.generation.model, line.model);
      assert.equal(meta.generation.verifiedText ?? meta.generation.text, line.text);
      assert.equal(meta.duration, line.duration);
      const bytes = readFileSync(new URL(`../public${line.src}`, import.meta.url));
      assert.equal(meta.quality.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(meta.quality.bytes, bytes.length);
      assert.ok(meta.quality.duration > .4 && meta.quality.duration <= 4);
      assert.ok(meta.quality.peak > .01 && meta.quality.peak < .99);
      assert.ok(meta.quality.rms > .01);
      assert.equal(meta.asr.model, 'mimo-v2.5-asr');
      assert.equal(meta.asr.wordErrorRate, 0, `${id} needs review: ${meta.asr.transcript}`);
      if (id.startsWith('enemy-')) {
        assert.equal(line.model, index ? 'mimo-v2.5-tts-voiceclone' : 'mimo-v2.5-tts-voicedesign');
        if (index) assert.equal(meta.generation.referenceSha256, manifest.units[id].lines[0].generation.sourceSha256,
          `${id} second line must clone the exact first-line source voice`);
      } else {
        assert.equal(line.model, 'mimo-v2.5-tts');
      }
    }
  }
  assert.deepEqual(presets, new Set(['Mia', 'Chloe', 'Milo', 'Dean']));
  assert.equal(styles.size, 21, 'every role has its own voice direction');
});

test('soldier voice follows its barracks tier and clamps unknown numeric tiers', () => {
  assert.equal(voiceForUnit({ type: 'soldier' }), 'soldier-1');
  assert.equal(voiceForUnit({ type: 'soldier', level: 2 }), 'soldier-2');
  assert.equal(voiceForUnit({ type: 'soldier', level: 9 }), 'soldier-3');
  assert.equal(voiceForUnit({ type: 'soldier', level: -3 }), 'soldier-1');
  assert.equal(voiceForUnit({ type: 'soldier', level: NaN }), 'soldier-1');
});
