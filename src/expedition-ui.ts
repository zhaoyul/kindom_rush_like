import { CHALLENGES } from './challenges';
import { ENEMY_STATS } from './data';
import { getMostDangerousWave, getTopTowers } from './battle-report';
import { icon } from './icons';
import { getTowerCombatStats } from './tower-branches';
import type { BattleReport, ChallengeMode } from './types';

export function challengePicker(selected: ChallengeMode): string {
  return `<section class="challenge-picker" aria-label="玩法规则"><div class="challenge-picker-heading"><strong>${icon('flag')}选择玩法</strong><span>规则挑战 · 通关本关后开放</span></div><div class="challenge-options">${Object.values(CHALLENGES).map(mode => `<button class="challenge-choice ${mode.id === selected ? 'chosen' : ''}" data-challenge="${mode.id}" aria-label="选择${mode.name}" aria-pressed="${mode.id === selected}">${icon(mode.icon)}<span><strong>${mode.name}</strong><small>${mode.id === 'standard' ? '战役星级与关卡解锁' : mode.id === 'four-towers' ? '同时最多 4 座塔' : '禁用陨星坠落'}</small></span>${mode.id === selected ? icon('check') : ''}</button>`).join('')}</div><p>${CHALLENGES[selected].description}</p><small>挑战徽章独立记录，每种玩法保留自己的续战。</small></section>`;
}

export function formatBattleTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function battleReportBody(report: BattleReport, pathLength: number, time: number, hasFloodgate = false): string {
  const towers = getTopTowers(report, report.towers.length), worst = getMostDangerousWave(report);
  const topDamage = Math.max(1, ...towers.map(tower => tower.damage));
  const leaks = Object.entries(report.leaks).filter(([, leak]) => leak && leak.count > 0);
  const observed = formatBattleTime(report.startedAt);
  return `<p class="dialog-intro">${report.partial ? `本局从 ${observed} 恢复后开始记录，续战前的数据未计入下列贡献。` : '记录每次实际伤害、拦截损失和敌军推进，帮助你调整下一局的防线。'}</p><div class="report-metrics"><span><strong>${formatBattleTime(time)}</strong>本局用时 · 1×</span><span><strong>${Math.round(report.totalDamage)}</strong>${report.partial ? '续战后' : '实际'}伤害</span><span><strong>${report.totalKills}</strong>${report.partial ? '续战后' : '贡献'}击杀</span><span><strong>${hasFloodgate ? report.mapActivations : report.hero.bossInterrupts}</strong>${hasFloodgate ? '水闸启动' : '首领打断'}</span></div><section class="report-risk"><span class="report-section-title">${icon('wave')}最危险的交战时段</span>${worst ? `<h3>第 ${worst.wave} 波</h3><div><span>峰值 <b>${worst.peakEnemies}</b> 名敌人</span><span>最远推进 <b>${Math.min(100, Math.round(worst.furthestProgress / pathLength * 100))}%</b> 道路</span><span>损失 <b>${worst.livesLost}</b> 生命</span></div><small>先按生命损失，再按推进距离比较；提前召敌时包含场上的上一波余敌。</small>` : '<p>尚未记录交战时段。</p>'}</section><div class="report-columns"><section class="report-hero"><span class="report-section-title">${icon('moonblade')}艾琳的贡献</span><dl><div><dt>实际伤害</dt><dd>${Math.round(report.hero.damage)}</dd></div><div><dt>击败敌人</dt><dd>${report.hero.kills}</dd></div><div><dt>成功打断首领</dt><dd>${report.hero.bossInterrupts}</dd></div><div><dt>英雄阵亡</dt><dd>${report.hero.deaths}</dd></div><div><dt>驻兵阵亡</dt><dd>${report.soldierDeaths}</dd></div></dl></section><section class="report-leaks"><span class="report-section-title">${icon('flag')}突破防线的敌人</span>${leaks.length ? `<ul>${leaks.map(([kind, leak]) => `<li><strong>${ENEMY_STATS[kind as keyof typeof ENEMY_STATS].name}</strong><span>${leak!.count} 名 · 损失 ${leak!.lives} 生命</span></li>`).join('')}</ul>` : `<p class="report-clean">${report.partial ? '续战记录中没有突破防线的敌人' : '没有敌人突破防线'}</p>`}</section></div><section class="report-towers"><span class="report-section-title">${icon('barracks')}各塔战斗贡献</span><p class="report-caption">包含驻兵与专精伤害；售出的塔保留记录，转型前后的贡献合并。</p>${towers.length ? towers.map(tower => `<article class="report-tower"><div><strong>${getTowerCombatStats(tower).name}</strong><small>建造点 ${tower.slotId + 1} · ${tower.level} 级${tower.soldAt !== undefined ? ' · 已出售' : ''}</small></div><div class="report-tower-numbers"><b>${Math.round(tower.damage)}</b>伤害<span>${tower.kills} 击杀</span></div><div class="report-damage-bar"><i style="width:${Math.max(0, Math.min(100, tower.damage / topDamage * 100))}%"></i></div></article>`).join('') : '<p class="report-caption">本段记录中没有防御塔。</p>'}<p class="report-caption">援军与陨星：${Math.round(report.support.damage)} 伤害 · ${report.support.kills} 击杀。伤害按敌人实际生命损失计算，过量伤害不计入。</p></section>`;
}
