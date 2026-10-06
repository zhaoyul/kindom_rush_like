import assert from 'node:assert/strict';
import test from 'node:test';
import { DIFFICULTIES, DIFFICULTY_MULTIPLIERS } from '../src/difficulties';
import { DIFFICULTY_UI, difficultyBadges, difficultyPicker } from '../src/playability-ui';
import type { Difficulty } from '../src/types';

const plain = (html: string) => html.replace(/<[^>]+>/g, '');

test('deployment offers all five difficulties in shared order without unlock gates', () => {
  const html = difficultyPicker('nightmare', 'normal');
  assert.deepEqual([...html.matchAll(/data-difficulty="([^"]+)"/g)].map(match => match[1]), DIFFICULTIES);
  assert.equal(DIFFICULTIES.length, 5);
  assert.match(plain(html), /噩梦/);
  assert.match(plain(html), /炼狱/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /data-difficulty="nightmare"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(html, /\bdisabled\b/);
});

test('each choice displays the actual HP, attack, movement and spawn schedule values', () => {
  for (const difficulty of DIFFICULTIES) {
    const html = difficultyPicker(difficulty);
    const button = [...html.matchAll(/<button\b[^>]*data-difficulty="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].find(match => match[1] === difficulty);
    assert.ok(button, difficulty);
    const text = plain(button[2]), values = DIFFICULTY_MULTIPLIERS[difficulty];
    assert.ok(text.includes(`敌生命 ×${values.hp}`), `${difficulty} HP`);
    assert.ok(text.includes(`攻击伤害 ×${values.damage}`), `${difficulty} attack`);
    assert.ok(text.includes(`移动速度 ×${values.speed}`), `${difficulty} movement`);
    assert.ok(text.includes(`出兵间隔 ${Math.round(values.spawnInterval * 100)}%`), `${difficulty} schedule`);
    assert.doesNotMatch(html, /undefined|NaN/);
  }
  assert.match(plain(difficultyPicker('nightmare')), /出兵间隔缩短 10%/);
  assert.match(plain(difficultyPicker('inferno')), /出兵间隔缩短 22%/);
});

test('planning inferno explains that the live veteran battle and resumed training stay unchanged', () => {
  const text = plain(difficultyPicker('inferno', 'veteran'));
  assert.match(text, /当前防线：老兵/);
  assert.match(text, /切换不会改变当前战斗/);
  assert.match(text, /新战局 · 炼狱/);
  assert.match(text, /重新部署/);
  assert.match(text, /继续存档 · 保留原难度/);
  assert.match(text, /沿用存档的难度与训练，此处选择不会改变续战/);
  assert.match(text, /推荐完成星级训练/);
});

test('campaign badges include nightmare and inferno while standard stars remain separate', () => {
  const records: Readonly<Partial<Record<Difficulty, number>>> = Object.freeze({ normal: 3, veteran: 2, nightmare: 1, inferno: 3 });
  const text = plain(difficultyBadges(records));
  assert.doesNotMatch(text, /经典/);
  assert.equal(text, '老兵 2★噩梦 1★炼狱 3★');
  assert.deepEqual(records, { normal: 3, veteran: 2, nightmare: 1, inferno: 3 });
});

test('rule challenge medals render every earned tier in shared order with no empty awards', () => {
  const records = Object.fromEntries(DIFFICULTIES.map((difficulty, index) => [difficulty, index % 3 + 1]));
  const text = plain(difficultyBadges(records, true));
  assert.equal(text, DIFFICULTIES.map(difficulty => `${DIFFICULTY_UI[difficulty].name} ${records[difficulty]}级徽章`).join(''));
  assert.equal(difficultyBadges({ nightmare: 0, inferno: 0 }, true), '');
  assert.equal(difficultyBadges({}, false), '');
});
