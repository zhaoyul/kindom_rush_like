import { DOCTRINES, deriveBattleUpgrades, type BattleUpgrades } from './doctrines';
import { DIFFICULTIES, HARD_DIFFICULTIES, DIFFICULTY_MULTIPLIERS } from './difficulties';
import { icon } from './icons';
import type { ProgressStore } from './progress';
import type { Difficulty, TowerPriority } from './types';

export const DIFFICULTY_UI: Record<Difficulty, { name: string; description: string; glyph: string }> = {
  normal: { name: '经典', description: '熟悉道路，练习混合布阵', glyph: 'shield' },
  veteran: { name: '老兵', description: '厚实的敌军，更考验火力分配', glyph: 'sword' },
  heroic: { name: '英雄', description: '强敌压境，充分利用英雄与专精', glyph: 'flag' },
  nightmare: { name: '噩梦', description: '熟练运用英雄绝技与减速，迎战更厚重、更快、更密集的敌军', glyph: 'moonblade' },
  inferno: { name: '炼狱', description: '推荐完成星级训练，精确安排塔专精、集结与四种绝技', glyph: 'meteor' },
};
export const PRIORITY_UI: Record<TowerPriority, { name: string; description: string }> = {
  first: { name: '出口', description: '优先攻击最接近出口的敌人，拦住漏网者。' },
  strong: { name: '强敌', description: '优先攻击当前生命最多的敌人，集中处理重型目标。' },
  weak: { name: '残血', description: '优先攻击当前生命最少的敌人，尽快收割。' },
};

export function difficultyPicker(selected: Difficulty, current: Difficulty = selected): string {
  const selectedValues = DIFFICULTY_MULTIPLIERS[selected];
  const tempo = selectedValues.spawnInterval < 1 ? `出兵间隔缩短 ${Math.round((1 - selectedValues.spawnInterval) * 100)}%，敌军出场更密集。` : '保留原有出兵节奏。';
  return `<section class="difficulty-picker" id="difficulty-picker" aria-label="新战局难度"><div class="difficulty-heading"><strong>选择新战局难度</strong><small>切换不会改变当前战斗</small></div><p class="difficulty-current">当前防线：<strong>${DIFFICULTY_UI[current].name}</strong></p><div class="difficulty-options">${DIFFICULTIES.map(id => {
    const entry = DIFFICULTY_UI[id], values = DIFFICULTY_MULTIPLIERS[id];
    return `<button class="difficulty-choice ${id} ${selected === id ? 'chosen' : ''}" data-difficulty="${id}" aria-label="选择${entry.name}难度" aria-pressed="${selected === id}"><span class="difficulty-choice-title">${icon(entry.glyph)}<strong>${entry.name}</strong>${selected === id ? icon('check', 'difficulty-check') : ''}</span><span class="difficulty-values"><small>敌生命 <b>×${values.hp}</b></small><small>攻击伤害 <b>×${values.damage}</b></small><small>移动速度 <b>×${values.speed}</b></small><small>出兵间隔 <b>${Math.round(values.spawnInterval * 100)}%</b></small></span></button>`;
  }).join('')}</div><p class="difficulty-advice">${DIFFICULTY_UI[selected].description}。${tempo}击杀收益相同。</p><div class="difficulty-deployment"><p><strong>新战局 · ${DIFFICULTY_UI[selected].name}</strong>点击关卡的「重新部署」或「开始关卡」，使用此难度和当前训练。</p><p><strong>继续存档 · 保留原难度</strong>沿用存档的难度与训练，此处选择不会改变续战。高难度成绩独立记录。</p></div></section>`;
}

export function difficultyBadges(records: Partial<Record<Difficulty, number>>, ruleChallenge = false): string {
  return (ruleChallenge ? DIFFICULTIES : HARD_DIFFICULTIES).filter(id => (records[id] ?? 0) > 0).map(id => `<span class="${id}">${icon(DIFFICULTY_UI[id].glyph)}${DIFFICULTY_UI[id].name} ${records[id]}${ruleChallenge ? '级徽章' : '★'}</span>`).join('');
}

const percentage = (value: number, inverse = false) => `${inverse ? '−' : '+'}${Math.round(Math.abs(value - 1) * 100)}%`;
export function trainingSummary(upgrades: BattleUpgrades): string {
  return `<div class="training-summary"><span>${icon('arrow')}远程攻击 <b>${percentage(upgrades.rangedDamageMultiplier)}</b></span><span>${icon('shield')}驻兵生命 <b>${percentage(upgrades.soldierHpMultiplier)}</b></span><span>${icon('heart')}英雄生命 <b>${percentage(upgrades.heroHpMultiplier)}</b></span><span>${icon('clock')}技能冷却 <b>${percentage(upgrades.skillCooldownMultiplier, true)}</b></span></div>`;
}

export function doctrineWorkshop(progress: ProgressStore, deployed: BattleUpgrades): string {
  const available = progress.availableStars(), spent = progress.spentStars(), earned = progress.earnedStars();
  const chosen = deriveBattleUpgrades(progress.progress.doctrines);
  const pending = (Object.keys(chosen) as (keyof BattleUpgrades)[]).some(key => Math.abs(chosen[key] - deployed[key]) > 1e-6);
  return `<div class="training-intro"><div><p>通关获得星级，训练让下一次部署更有优势。每阶消耗 1 星，可免费重新分配。</p><small>重打提升最高星级才会新增可用星；挑战徽章不重复发星。</small></div><div class="training-currency">${icon('star')}<strong>${available}</strong><span>可用星<small>已分配 ${spent} / 已获得 ${earned}</small></span></div></div><div class="doctrine-grid">${Object.values(DOCTRINES).map(doctrine => {
    const rank = progress.progress.doctrines[doctrine.id] ?? 0, maxed = rank >= doctrine.maxRank;
    const effect = Math.round(Math.abs(doctrine.effect.perRank * rank) * 100);
    const nextEffect = Math.round(Math.abs(doctrine.effect.perRank * (rank + 1)) * 100);
    const sign = doctrine.id === 'focus' ? '−' : '+';
    const action = rank ? '强化' : '学习';
    return `<article class="doctrine-card ${rank ? 'trained' : ''}"><div class="doctrine-heading"><span class="doctrine-emblem">${icon(doctrine.icon)}</span><div><small>${doctrine.nameEn}</small><h3>${doctrine.name}</h3></div><b>${sign}${effect}%</b></div><p>${doctrine.description}</p><div class="doctrine-ranks" aria-label="${rank}阶，共3阶">${[1, 2, 3].map(n => `<span class="${n <= rank ? 'earned' : ''}">${n <= rank ? icon('check') : n}</span>`).join('')}</div><button class="doctrine-learn" data-doctrine="${doctrine.id}" aria-label="${maxed ? `${doctrine.name}已精通` : `${action}${doctrine.name}至${rank + 1}阶 消耗1星`}" ${maxed || available < 1 ? 'disabled' : ''}>${icon(maxed ? 'check' : 'star')}<span>${maxed ? '训练完成' : `${action} · 1 星`}</span><b>${maxed ? '3 / 3' : `升至 ${sign}${nextEffect}%`}</b></button></article>`;
  }).join('')}</div><div class="training-deployment"><strong>${pending ? '新训练已准备好' : '本次部署的训练'}</strong><p>${pending ? '开始新关或重新挑战时生效。继续现有存档会保留其原训练配置。' : '新部署会使用上面的训练配置，进行中的战斗数值保持一致。'}</p>${trainingSummary(pending ? chosen : deployed)}</div><div class="training-footer"><button class="secondary-button" data-action="reset-doctrines" ${spent < 1 ? 'disabled' : ''}>${icon('reset')}免费重新分配 ${spent} 星</button><button class="primary-button" data-action="campaign">${icon('map')}返回战役地图</button></div>`;
}
