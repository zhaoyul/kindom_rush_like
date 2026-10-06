import './style.css';
import { GameEngine } from './engine';
import { DIFFICULTIES, DIFFICULTY_MULTIPLIERS, isDifficulty } from './difficulties';
import { GameRenderer } from './renderer';
import { ENEMY_STATS, LEVELS, SKILLS, HERO_STATS, HERO_SKILLS, TOWER_ABILITIES, getTowerStats, getTowerAbilities } from './data';
import { icon, emblem, towerArt, heroArt } from './icons';
import { GameAudio } from './audio';
import { UNIT_VOICES, voiceForUnit, type VoiceId } from './voices';
import { ProgressStore, victoryStars } from './progress';
import { deriveBattleUpgrades, type DoctrineId } from './doctrines';
import { DIFFICULTY_UI, PRIORITY_UI, difficultyPicker, difficultyBadges, doctrineWorkshop } from './playability-ui';
import { analyzeWave, getLevelTactics, getEnemyCounters } from './tactical-guide';
import { TOWER_BRANCHES, getTowerBranch, getTowerCombatStats, getBranchChoiceCost, getTowerInvestment } from './tower-branches';
import { CHALLENGES, isChallengeMode, isRuleChallenge } from './challenges';
import { battleReportBody, challengePicker } from './expedition-ui';
import type { Ally, ChallengeMode, Difficulty, EnemyKind, LevelId, Point, RenderOptions, SkillKind, Tower, TowerAbilityKind, TowerBranchId, TowerKind, TowerPriority } from './types';

const localSaveStorage = (() => { try { return window.localStorage; } catch { return null; } })();
const progress = new ProgressStore(localSaveStorage, LEVELS.map(level => level.id));
const startupLevelId=progress.progress.selectedLevelId as LevelId;
const startupChallenge = progress.progress.selectedChallenge ?? 'standard';
let engine = new GameEngine(undefined, startupLevelId, {challenge: startupChallenge, upgrades:deriveBattleUpgrades(progress.progress.doctrines)});
let resumed = false;
const startupCheckpoint=progress.getCheckpoint(startupLevelId, startupChallenge);
if (startupCheckpoint) {
  const result = engine.importSave(startupCheckpoint);
  if (result.ok && engine.level.id===startupLevelId && engine.challenge===startupChallenge && progress.isChallengeUnlocked(engine.level.id, startupChallenge)) resumed = true;
  else { progress.discardCheckpoint(startupLevelId, startupChallenge); engine = new GameEngine(undefined, startupLevelId,{challenge:startupChallenge,upgrades:deriveBattleUpgrades(progress.progress.doctrines)}); }
}
let plannedDifficulty: Difficulty = engine.difficulty;
let plannedChallenge: ChallengeMode = engine.challenge;

const skillControls: { kind: SkillKind; key: string; glyph: string; color: string; caption: string }[] = [
  { kind: 'reinforce', key: '1', glyph: 'users', color: 'green', caption: '战场援军' },
  { kind: 'meteor', key: '2', glyph: 'meteor', color: 'orange', caption: '范围轰击' },
  { kind: 'hero', key: '3', glyph: 'sword', color: 'gold', caption: '剑舞 · 回春' },
  { kind: 'hero-dash', key: '4', glyph: 'moonblade', color: 'moon', caption: '突进 · 穿阵' },
  { kind: 'hero-roots', key: '5', glyph: 'vines', color: 'thorn', caption: '荆棘 · 缚敌' },
  { kind: 'hero-oath', key: '6', glyph: 'ancient-tree', color: 'ancient', caption: '古树 · 护军' },
];
function skillButton(control: typeof skillControls[number]) {
  return `<button class="skill-button" data-skill="${control.kind}" aria-label="${SKILLS[control.kind].name}，快捷键${control.key}"><span class="skill-symbol ${control.color}">${icon(control.glyph)}<span class="skill-cooldown"></span><kbd>${control.key}</kbd></span><span class="skill-caption"><strong>${SKILLS[control.kind].name}</strong><small>${control.caption}</small></span></button>`;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<main class="game-shell">
  <header class="game-header">
    <a class="brand" href="./" aria-label="暮林守卫首页"><span class="brand-emblem">${emblem()}</span><span><strong>暮林守卫</strong><small>THE VERDANT GUARD</small></span></a>
    <div class="level-heading"><span id="level-subtitle"></span><h1 id="level-name"></h1></div>
    <div class="header-tools"><button class="nav-button campaign-nav" data-action="campaign" aria-label="战役地图">${icon('map')}<span>战役地图</span></button><button class="nav-button training-nav" data-action="training" aria-label="星级天赋" title="使用通关星级训练守军">${icon('star')}<span>星级天赋</span><b id="training-badge">0</b></button><button class="nav-button" data-action="bestiary" aria-label="兵种图鉴">${icon('book')}<span>兵种图鉴</span></button><button class="nav-button" data-action="guide" aria-label="操作指南">${icon('help')}<span>操作指南</span></button><button class="icon-button" data-action="save" id="save-button" title="保存当前战斗" aria-label="保存进度">${icon('save')}</button><button class="icon-button" data-action="restart" title="重新开始本关" aria-label="重新开始">${icon('reset')}</button><button class="icon-button" id="fullscreen-button" title="全屏" aria-label="全屏">${icon('expand')}</button></div>
  </header>
  <section class="battle-panel" aria-label="暮林隘口战场">
    <div class="battle-topbar">
      <div class="resources"><span class="resource hearts" title="漏过敌人会失去生命">${icon('heart')}<strong id="lives">20</strong><small>生命</small></span><span class="resource coins">${icon('coin')}<strong id="gold">360</strong><small>金币</small></span><button class="resource waves intel-resource" data-action="intel" aria-label="波次情报" title="查看兵种克制与布阵建议">${icon('wave')}<strong id="wave">0 <em>/ 8</em></strong><small>波次·情报</small></button></div>
      <button class="difficulty-trigger" id="difficulty-button" data-action="difficulty" aria-label="当前难度经典，选择新战局难度" aria-haspopup="dialog" aria-controls="info-dialog" title="选择新战局难度，继续存档保留原难度">${icon('shield')}<span>难度 · <strong id="current-difficulty">经典</strong></span><small>选择新战局</small>${icon('chevron')}</button>
      <div class="battle-actions"><span class="battle-state" id="battle-state">部署阶段</span><button class="icon-button music-button" id="music-button" title="关闭背景音乐" aria-label="关闭背景音乐" aria-pressed="true"><span class="music-note" aria-hidden="true">♫</span></button><button class="icon-button" id="sound-button" title="关闭战斗音效" aria-label="关闭战斗音效" aria-pressed="true">${icon('sound')}</button><button class="small-button speed-button" id="speed-button" title="切换游戏速度">1×</button><button class="icon-button" id="pause-button" title="暂停 / 继续 [空格]" aria-label="暂停">${icon('pause')}</button></div>
    </div>
    <div class="canvas-wrap" id="canvas-wrap">
      <canvas id="game-canvas" tabindex="0" aria-label="塔防战场：点击石基就地选择塔，点击塔就地升级"></canvas><div class="map-vignette"></div>
      <div class="build-sites" id="build-sites"></div>
      <button class="map-event-control" id="map-event-button" data-action="map-event" aria-label="沼泽水闸" hidden></button>
      <div class="map-corner"><span class="map-tag" id="map-label">${icon('flag')}暮林防线</span><small id="deployment-info">经典 · 点击波次查看战术</small></div>
      <div class="boss-hud" id="boss-hud" aria-label="首领战况" hidden></div>
      <div class="tower-menu" id="tower-menu" role="group" aria-label="防御塔操作" hidden></div>
      <div class="target-banner" id="target-banner" hidden><span></span><button title="取消指令" aria-label="取消指令">${icon('close')}</button></div>
      <div class="voice-caption" id="voice-caption" role="status" aria-live="polite" hidden></div>
      <div class="save-status" id="save-status" aria-live="polite"></div>
      <div class="field-tip" id="field-tip">${icon('barracks')}<div><strong>点击石基，建立防线</strong><span>箭塔连射，魔法破甲，炮塔轰击，兵营拦截。</span></div><button aria-label="关闭提示">${icon('close')}</button></div>
      <div class="pause-overlay" id="pause-overlay" hidden><span>${icon('pause')}</span><h2>战斗已暂停</h2><p>森林暂歇，防线仍在。</p><button class="primary-button" data-action="resume">继续战斗</button></div>
      <div class="result-overlay" id="result-overlay" hidden></div><div class="enemy-tooltip" id="enemy-tooltip" hidden></div>
    </div>
    <div class="command-bar">
      <div class="commander-controls">
        <button class="hero-card" id="hero-button" title="指挥艾琳 [H]"><span class="hero-portrait">${heroArt()}</span><span class="hero-info"><strong id="hero-name">艾琳</strong><span id="hero-status" class="hero-status">守卫已就位</span><span class="hero-health-track"><i id="hero-health"></i></span><small id="hero-hp">440 / 440</small></span><kbd>H</kbd></button>
        <div class="skill-group commander-skills" role="group" aria-label="战场指令">${skillControls.slice(0, 2).map(skillButton).join('')}</div>
        <div class="skill-group hero-skills" role="group" aria-label="艾琳的四种绝技"><span class="skill-family-label">艾琳 · 森林守卫</span>${skillControls.slice(2).map(skillButton).join('')}</div>
      </div>
      <div class="wave-preview" id="wave-preview"></div>
      <button class="next-wave-button" id="next-wave-button"><span>${icon('play')}<strong>迎击第一波</strong><small>部署完毕 · N</small></span>${icon('chevron')}</button>
    </div>
    <div class="battle-footnote"><span>N 迎击 / 抢先召敌 <b>·</b> 点击波次查看战术 <b>·</b> H 英雄 <b>·</b> 3–6 绝技</span><span id="audio-hint">点击战场，开启音乐</span></div>
  </section>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<dialog id="info-dialog"><div class="dialog-head"><div><p class="eyebrow" id="dialog-eyebrow">FIELD MANUAL</p><h2 id="dialog-title"></h2></div><button class="icon-button" id="dialog-close" aria-label="关闭">${icon('close')}</button></div><div id="dialog-body"></div></dialog>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const renderer = new GameRenderer(canvas, engine.level);
const audio = new GameAudio();
const options: RenderOptions = { selectedSlot: null, selectedEnemy: null, selectedAlly: null, heroSelected: false, targeting: null, pointer: null, paused: resumed && engine.state.phase === 'battle' };
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const towerKinds: TowerKind[] = ['arrow', 'mage', 'cannon', 'barracks'];
const towerLabels = { arrow: '游侠箭塔', mage: '秘法高塔', cannon: '火药炮塔', barracks: '守卫兵营' };
const towerTags = { arrow: '物理 · 快速射击', mage: '魔法 · 破甲减速', cannon: '爆炸 · 范围杀伤', barracks: '近战 · 三名驻兵' };
let speed = 1, lastTime = performance.now(), uiTimer = 0;
let towerSignature = '', previewSignature = '', previousPhase = engine.state.phase;
let towerPanel: 'branch' | 'skills' = 'branch', towerPanelId: number | null = null, bossSignature = '';
let toastTimeout: ReturnType<typeof setTimeout>;
let hideTip = false;
let audioStarted = false;
let autoSaveTimer = 0;
let voiceTimeout: ReturnType<typeof setTimeout>;

function unlockAudio() {
  audio.unlock();
  audioStarted = true;
}
function playVoice(id: VoiceId) {
  unlockAudio(); const line = audio.playUnitVoice(id, dialog.open);
  if (!line) return;
  const subtitle=line.subtitle;
  const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  const caption = $('#voice-caption');
  caption.innerHTML = `${icon('sound')}<div><span><strong>${UNIT_VOICES[id].name}</strong>「${escape(line.text)}」</span>${subtitle?`<small>${escape(subtitle)}</small>`:''}</div>`;
  caption.hidden = false; clearTimeout(voiceTimeout);
  const preview=$('#dialog-body').querySelector('.voice-preview-text');
  if(dialog.open&&preview) preview.textContent=`${UNIT_VOICES[id].name}：「${line.text}」${subtitle?` · ${subtitle}`:''}`;
  voiceTimeout = setTimeout(() => { caption.hidden = true; }, Math.max(2400, ((line.duration ?? 3.3) + .45) * 1000));
}
function saveCurrent(notify = false) {
  const ok = progress.checkpoint(engine.exportSave(), engine.level.id, engine.challenge);
  $('#save-status').textContent = ok ? '进度已存 · 本机' : '本机存档不可用';
  $('#save-button').title = ok ? `保存进度 · ${new Date(progress.progress.updatedAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}` : '浏览器存储不可用';
  if (notify) toast(ok ? '当前波次、阵容与战役进度已保存。' : '浏览器未允许本机存档，当前战斗仍可继续。', !ok);
  return ok;
}
function mountLevel() {
  options.mapEventHighlighted=false;
  $('#level-name').textContent = engine.level.name; $('#level-subtitle').textContent = engine.level.subtitle;
  $('.battle-panel').setAttribute('aria-label', `${engine.level.name}战场`);
  $('.game-shell').dataset.theme = engine.level.theme;
  $('#map-label').innerHTML = `${icon('flag')}${engine.level.name}防线`;
  $('#deployment-info').textContent = `${DIFFICULTY_UI[engine.difficulty].name} · ${isRuleChallenge(engine.challenge) ? CHALLENGES[engine.challenge].name : engine.level.id === 'forest' && engine.rulesVersion === 1 ? '原版续战' : '点击波次查看战术'}`;
  const difficultyName = DIFFICULTY_UI[engine.difficulty].name;
  $('#current-difficulty').textContent = difficultyName;
  $('#difficulty-button').dataset.difficultyLevel = engine.difficulty;
  $('#difficulty-button').setAttribute('aria-label', `当前难度${difficultyName}，选择新战局难度`);
  $('#build-sites').innerHTML = engine.level.slots.map(s => `<button class="build-site" data-slot="${s.id}" aria-label="建造点 ${s.id + 1}" title="点击选择防御塔"></button>`).join('');
  renderer.setLevel(engine.level); towerSignature = ''; previewSignature = '';
}
function toast(message: string, error = false) {
  const el = $('#toast'); el.innerHTML = `${icon(error ? 'help' : 'check')}<span>${message}</span>`;
  el.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 2600);
}
function cancelTarget() { options.targeting = null; updateTargetBanner(); }
function deselect() { options.selectedSlot = null; options.selectedEnemy = null; options.selectedAlly = null; options.heroSelected = false; cancelTarget(); updateUI(); }
function updateTargetBanner() {
  const banner = $('#target-banner'); banner.hidden = !options.targeting && !options.heroSelected;
  if (!banner.hidden) banner.querySelector('span')!.textContent = options.targeting === 'rally' ? '选择高亮道路作为集结地 · Esc 取消' : options.targeting === 'meteor' ? '点击敌群，召唤陨星' : options.targeting === 'reinforce' ? '点击道路，派出援军' : options.targeting === 'hero-dash' ? '月刃突袭 · 选择英雄 240 范围内的突进终点' : options.targeting === 'hero-roots' ? '荆棘缚境 · 选择英雄 260 范围内的敌群' : '点击地面，指挥艾琳移动';
  canvas.style.cursor = options.targeting || options.heroSelected ? 'crosshair' : 'pointer';
  document.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach(el => el.classList.toggle('selected', el.dataset.skill === options.targeting));
  $('#hero-button').classList.toggle('selected', options.heroSelected);
}

function renderTowerMenu() {
  const slot = engine.level.slots.find(s => s.id === options.selectedSlot);
  const menu = $('#tower-menu');
  menu.hidden = !slot || options.targeting !== null || options.paused || ['victory', 'defeat'].includes(engine.state.phase);
  if (menu.hidden || !slot) return;
  const tower = engine.state.towers.find(t => t.slotId === slot.id);
  if (tower?.id !== towerPanelId) { towerPanelId = tower?.id ?? null; towerPanel = tower?.branch ? 'skills' : 'branch'; }
  const signature = `${slot.id}:${tower?.kind}:${tower?.level}:${tower?.branch}:${towerPanel}:${JSON.stringify(tower?.abilities)}:${tower?.targetPriority}:${engine.state.gold}:${engine.state.towers.length}`;
  if (signature !== towerSignature) {
    towerSignature = signature;
    const close = `<button class="menu-close" data-action="deselect" aria-label="关闭塔菜单">${icon('close')}</button>`;
    menu.dataset.mode = tower ? 'tower' : 'build';
    if (!tower) {
      const full = engine.challenge === 'four-towers' && engine.state.towers.length >= 4;
      menu.setAttribute('aria-label', `建造点 ${slot.id + 1} 选择防御塔`);
      menu.innerHTML = `<div class="tower-menu-heading"><span><strong>建造防御塔</strong><small>${engine.challenge === 'four-towers' ? `四塔防线 · ${engine.state.towers.length} / 4 座` : '选择一种工事'}</small></span>${close}</div><div class="tower-choices">${towerKinds.map(kind => {
        const stats = getTowerStats(kind, 1);
        return `<button class="build-choice ${kind}" data-tower="${kind}" aria-label="建造${towerLabels[kind]} ${stats.cost}金币" ${full || engine.state.gold < stats.cost ? 'disabled' : ''}><span class="choice-art">${towerArt(kind)}</span><strong>${towerLabels[kind]}</strong><span class="choice-tag">${towerTags[kind]}</span><span class="choice-cost">${icon('coin')}${stats.cost}</span></button>`;
      }).join('')}</div><p class="menu-note">${icon(full ? 'shield' : 'coin')}${full ? '已达 4 座上限 · 出售一座后可换位重建' : '击败敌人赚取金币 · 四种工事互相配合'}</p>`;
    } else {
      const stats = getTowerCombatStats(tower), next = getTowerStats(tower.kind, Math.min(3, tower.level + 1));
      menu.setAttribute('aria-label', `${stats.name}就地升级与操作`);
      const damage = tower.kind === 'barracks' ? Math.round(stats.soldierDamage!) : Math.round(stats.damage * engine.upgrades.rangedDamageMultiplier);
      const soldierArmor = engine.state.allies.find(ally => ally.towerId === tower.id)?.armor ?? stats.soldierArmor ?? 0;
      menu.innerHTML = `<div class="tower-menu-heading"><span><strong>${stats.name}</strong><small>等级 ${tower.level} / 3 · ${tower.kind === 'barracks' ? '3 名驻兵' : '自动攻击'}</small></span>${close}</div><div class="tower-menu-stats"><span>${icon('sword')}<b>${damage}</b>攻击</span><span>${icon('clock')}<b>${stats.rate.toFixed(2).replace(/0$/, '')}s</b>间隔</span><span>${icon(tower.kind === 'barracks' ? 'heart' : 'arrow')}<b>${tower.kind === 'barracks' ? Math.ceil(engine.state.allies.find(a => a.towerId === tower.id)?.maxHp ?? stats.soldierHp!) : stats.range}</b>${tower.kind === 'barracks' ? '生命' : '射程'}</span></div>${tower.kind==='barracks'?'':renderTargetPriority(tower)}<div class="tower-actions">${tower.level < 3 ? `<button class="tower-action upgrade" data-action="upgrade" aria-label="升级至${tower.level + 1}级 ${stats.upgradeCost}金币" ${engine.state.gold < stats.upgradeCost ? 'disabled' : ''}>${icon('wave')}<span>升级至 ${tower.level + 1} 级<small>${tower.kind === 'barracks' ? `生命 ${Math.ceil(next.soldierHp! * engine.upgrades.soldierHpMultiplier + (tower.abilities['barracks-fortify']??0)*55)} · 攻击 ${next.soldierDamage}` : `伤害 ${Math.round(next.damage * engine.upgrades.rangedDamageMultiplier)} · 射程 ${next.range}`}</small></span><b>${icon('coin')}${stats.upgradeCost}</b></button>` : `${renderTowerAdvancedPanel(tower)}`}${tower.kind === 'barracks' ? `<button class="tower-action rally" data-action="rally" aria-label="选择兵营集结地">${icon('flag')}<span>选择集结地<small>部署到范围内的道路</small></span><kbd>R</kbd></button>` : ''}<button class="tower-action sell" data-action="sell" aria-label="出售防御塔 返还${Math.floor(getTowerInvestment(tower) * 70 / 100)}金币">${icon('coin')}<span>出售防御塔</span><b>+${Math.floor(getTowerInvestment(tower) * 70 / 100)}</b></button></div><p class="menu-note">${tower.kind === 'barracks' ? `${Math.round(soldierArmor * 100)}% 护甲 · 阵亡后 9 秒补员` : stats.description}</p>`;
    }
  }
  positionTowerMenu();
}
function renderTargetPriority(tower: Tower) {
  const selected=tower.targetPriority??'first';
  return `<section class="target-priority" aria-label="火力优先级"><div><strong>${icon('crosshair')}火力优先级</strong><small>${PRIORITY_UI[selected].description}</small></div><div class="priority-options">${(Object.keys(PRIORITY_UI) as TowerPriority[]).map(priority=>`<button data-priority="${priority}" class="${priority===selected?'chosen':''}" aria-label="优先攻击${PRIORITY_UI[priority].name}" aria-pressed="${priority===selected}" title="${PRIORITY_UI[priority].description}">${PRIORITY_UI[priority].name}</button>`).join('')}</div></section>`;
}
function renderTowerAdvancedPanel(tower: Tower) {
  return `<div class="tower-panel-tabs" aria-label="三级塔发展"><button data-tower-panel="branch" aria-label="查看终极流派" aria-pressed="${towerPanel === 'branch'}" class="${towerPanel === 'branch' ? 'chosen' : ''}">${icon('shield')}终极流派${getTowerBranch(tower) ? '' : '<i>2 选 1</i>'}</button><button data-tower-panel="skills" aria-label="查看塔专精" aria-pressed="${towerPanel === 'skills'}" class="${towerPanel === 'skills' ? 'chosen' : ''}">${icon('star')}进阶专精</button></div>${towerPanel === 'branch' ? renderTowerBranches(tower) : renderTowerAbilities(tower)}`;
}
function renderTowerBranches(tower: Tower) {
  const current = getTowerBranch(tower);
  return `<section class="tower-branches" aria-label="终极流派选择"><p class="branch-intro">${current ? `当前：${current.name} · 付费转型保留已学专精` : '选择一个流派，改变攻击方式与建筑外观。'}</p>${Object.values(TOWER_BRANCHES).filter(branch => branch.towerKind === tower.kind).map(branch => {
    const selected = tower.branch === branch.id, cost = getBranchChoiceCost(tower, branch.id);
    const preview = getTowerCombatStats({ ...tower, branch: branch.id });
    const details = tower.kind === 'barracks' ? `生命 ${Math.ceil(preview.soldierHp! * engine.upgrades.soldierHpMultiplier + (tower.abilities['barracks-fortify'] ?? 0) * 55)} · 攻击 ${Math.round(preview.soldierDamage!)} · 护甲 ${Math.round((preview.soldierArmor! + (tower.abilities['barracks-fortify'] ?? 0) * .08) * 100)}%` : `攻击 ${Math.round(preview.damage * engine.upgrades.rangedDamageMultiplier)} · ${preview.rate.toFixed(2)}s · 射程 ${preview.range}`;
    const passive = tower.kind === 'cannon' ? `爆炸半径 ${preview.splashRadius ?? 68}${preview.armorBreak ? ` · 护甲 −${Math.round(preview.armorBreak * 100)}% · 魔抗 −${Math.round((preview.magicBreak ?? 0) * 100)}%` : ''}` : tower.kind === 'mage' ? `普通命中减速 ${Math.round((preview.slowAmount ?? .35) * 100)}% · 持续 ${preview.slowDuration ?? 1.3}s` : '';
    return `<button class="branch-choice ${selected ? 'chosen' : ''}" data-branch="${branch.id}" aria-label="${selected ? `当前流派${branch.name}` : `${current ? '转型' : '选择'}${branch.name} ${cost}金币`}" ${selected || engine.state.gold < cost ? 'disabled' : ''}><span class="branch-glyph">${icon(branch.icon)}</span><span class="branch-copy"><strong>${branch.name}</strong><small>${branch.description}</small><b>${details}${passive ? `<br>${passive}` : ''}</b></span><span class="branch-price">${selected ? icon('check') : `${icon('coin')}${cost}`}<small>${selected ? '已选' : current ? '转型' : '选择'}</small></span></button>`;
  }).join('')}<small class="branch-footnote">两个流派互斥 · 驻兵转型按比例保留生命</small></section>`;
}
function renderTowerAbilities(tower: Tower) {
  const damageBonus = Math.round((engine.upgrades.rangedDamageMultiplier - 1) * 100);
  return `<section class="tower-advanced" aria-label="三级塔进阶技能"><div class="advanced-heading">${icon('star')}<strong>进阶专精</strong><small>学习后自动触发 · 各有 2 级</small></div>${tower.kind !== 'barracks' && damageBonus > 0 ? `<p class="menu-note">本局远程伤害 +${damageBonus}% · 下列伤害为基础值</p>` : ''}${getTowerAbilities(tower.kind).map(ability => {
    const rank = tower.abilities[ability.id] ?? 0;
    const maxed = rank >= 2, cost = maxed ? 0 : ability.costs[rank];
    const label = maxed ? `${ability.name} 已精通` : rank ? `强化${ability.name}至2级 ${cost}金币` : `学习${ability.name} ${cost}金币`;
    return `<button class="tower-ability ${rank ? 'learned' : ''} ${maxed ? 'mastered' : ''}" data-ability="${ability.id}" aria-label="${label}" title="${ability.description} ${ability.rankDescriptions.join('；')}" ${maxed || engine.state.gold < cost ? 'disabled' : ''}><span class="ability-glyph">${icon(ability.icon)}</span><span class="ability-info"><span class="ability-name"><strong>${ability.name}</strong><span class="ability-ranks" aria-label="${rank}级">${[1, 2].map(level => `<i class="${rank >= level ? 'earned' : ''}"></i>`).join('')}</span></span><small>${ability.rankDescriptions[Math.max(0, rank - 1)]}</small>${rank === 1 ? `<span class="ability-next">下一级：${ability.rankDescriptions[1]}</span>` : ''}</span><span class="ability-purchase">${maxed ? icon('check') : `${icon('coin')}<b>${cost}</b>`}<small>${maxed ? '已精通' : rank ? '强化' : '学习'}</small></span></button>`;
  }).join('')}</section>`;
}
function positionTowerMenu() {
  const menu = $('#tower-menu'), slot = engine.level.slots.find(s => s.id === options.selectedSlot);
  if (menu.hidden || !slot) return;
  const position = renderer.worldToScreen(slot), bounds = canvas.getBoundingClientRect();
  const tower = engine.state.towers.find(t => t.slotId === slot.id);
  const scale = Math.min(bounds.width / 1200, bounds.height / 720);
  const towerHeight = tower ? Math.min(tower.y - 8, tower.level === 3 ? 134 : tower.level === 2 ? 121 : 105) * scale : 16 * scale;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const above = position.y - towerHeight - h - 14;
  const below = position.y + 28 * scale;
  let top = above >= 9 ? above : below + h <= bounds.height - 9 ? below : Math.max(9, (bounds.height - h) / 2);
  const left = Math.max(9, Math.min(bounds.width - w - 9, position.x - w / 2));
  top = Math.max(9, Math.min(bounds.height - h - 9, top));
  menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  menu.style.setProperty('--anchor-x', `${Math.max(18, Math.min(w - 18, position.x - left))}px`);
  menu.dataset.placement = top + h < position.y ? 'above' : 'below';
}
function updateBuildSites() {
  const blocked = options.targeting !== null || options.heroSelected || options.paused || ['victory', 'defeat'].includes(engine.state.phase);
  const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / 1200, rect.height / 720);
  document.querySelectorAll<HTMLButtonElement>('.build-site').forEach(button => {
    const slot = engine.level.slots[Number(button.dataset.slot)], p = renderer.worldToScreen(slot), tower = engine.state.towers.find(t => t.slotId === slot.id);
    button.style.left = `${p.x}px`; button.style.top = `${p.y}px`;
    button.style.width = `${Math.max(30, 72 * scale)}px`; button.style.height = `${Math.max(24, 42 * scale)}px`;
    button.disabled = blocked;
    button.setAttribute('aria-label', tower ? `选择${getTowerCombatStats(tower).name} 建造点${slot.id + 1} 等级${tower.level}` : `建造点 ${slot.id + 1}`);
    button.title = tower ? '点击就地升级、集结或出售' : '点击选择防御塔';
  });
  $('#build-sites').classList.toggle('command-active', blocked);
}

function updateUI() {
  const state = engine.state;
  updateBossHud();
  updateMapEventControl();
  $('#training-badge').textContent = String(progress.availableStars());
  $('.training-nav').classList.toggle('has-stars',progress.availableStars()>0);
  $('#audio-hint').textContent = !audioStarted || !audio.isUnlocked ? '点击战场，开启音乐' : audio.musicEnabled ? '暮林序曲 · 原创配乐' : '背景音乐已关闭';
  $('#lives').textContent = String(state.lives); $('#gold').textContent = String(state.gold); $('#wave').innerHTML = `${state.wave} <em>/ ${engine.level.waves.length}</em>`;
  const phaseLabel = { preparation: '部署阶段', battle: '战斗进行中', intermission: '波次间歇', victory: '防守成功', defeat: '防线失守' };
  $('#battle-state').textContent = options.paused ? '已暂停' : phaseLabel[state.phase];
  $('#pause-button').innerHTML = icon(options.paused ? 'play' : 'pause'); $('#pause-button').setAttribute('aria-label', options.paused ? '继续' : '暂停');
  $('#pause-overlay').hidden = !options.paused || ['victory', 'defeat'].includes(state.phase);
  $('#field-tip').hidden = hideTip || state.phase !== 'preparation' || options.selectedSlot !== null;
  const waveButton = $<HTMLButtonElement>('#next-wave-button');
  const early=engine.getEarlyWaveOffer();
  waveButton.disabled = ['victory', 'defeat'].includes(state.phase) || state.phase==='battle'&&(!early.available||options.paused);
  waveButton.classList.toggle('early-ready',early.available&&!options.paused);
  waveButton.title = early.available ? `上一波的 ${state.enemies.length} 名余敌仍会继续进攻。抢先召敌获得 ${early.gold} 金币，所有技能冷却减少 ${early.cooldownReduction} 秒。` : state.phase === 'battle' ? early.reason??'当前波仍在出兵。' : '部署完成后迎击下一波。';
  waveButton.innerHTML = state.phase === 'battle' ? early.available ? `<span>${icon('flag')}<strong>抢先召第 ${state.wave+1} 波</strong><small>+${early.gold} 金币 · 冷却 −${early.cooldownReduction}s · N</small></span>${icon('chevron')}` : `<span>${icon('wave')}<strong>第 ${state.wave} 波进攻中</strong><small>${state.spawnQueue.length>0?'敌军尚在出场 · ':''}剩余 ${state.enemies.length + state.spawnQueue.length} 名敌人</small></span>` : `<span>${icon('play')}<strong>${state.wave === 0 ? '迎击第一波' : state.wave >= engine.level.waves.length ? '战役已结束' : `迎击第 ${state.wave + 1} 波`}</strong><small>${state.wave === 0 ? '部署完毕 · N' : '整顿防线 · N'}</small></span>${icon('chevron')}`;
  const hero = state.allies.find(a => a.type === 'hero');
  if (hero) {
    $('#hero-name').textContent = HERO_STATS.name.split(' · ')[0]; $('#hero-hp').textContent = `${Math.ceil(Math.max(0, hero.hp))} / ${Math.ceil(hero.maxHp)}`;
    $('#hero-health').style.width = `${Math.max(0, hero.hp / hero.maxHp * 100)}%`;
    $('#hero-status').textContent = hero.hp <= 0 ? `复活 · ${Math.ceil(hero.respawnTimer)}秒` : (hero.buffTimer ?? 0) > 0 ? `古树盟约 · ${Math.ceil(hero.buffTimer!)}秒` : hero.engagedWith ? '正在战斗' : options.heroSelected ? '选择目的地' : '月刃 · 荆棘 · 古树';
    $('#hero-button').classList.toggle('empowered', (hero.buffTimer ?? 0) > 0);
    $('#hero-button').title = `艾琳：攻击 ${Math.round(hero.damage * (hero.damageMultiplier ?? 1))} · 护甲 ${Math.round((hero.armor + (hero.armorBonus ?? 0)) * 100)}% · 点击指挥 [H]`;
  }
  if (options.heroSelected && (!hero || hero.hp <= 0)) { options.heroSelected = false; updateTargetBanner(); }
  if (options.targeting && HERO_SKILLS.some(kind => kind === options.targeting) && (!hero || hero.hp <= 0 || state.phase !== 'battle')) cancelTarget();
  document.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach(el => {
    const kind = el.dataset.skill as SkillKind, cd = state.skillCooldowns[kind];
    const forbidden = engine.challenge === 'no-meteor' && kind === 'meteor';
    el.disabled = forbidden || cd > 0 || state.phase !== 'battle' || options.paused || (HERO_SKILLS.some(skill => skill === kind) && (!hero || hero.hp <= 0));
    el.classList.toggle('forbidden', forbidden);
    el.querySelector('.skill-cooldown')!.textContent = cd > 0 ? String(Math.ceil(cd)) : ''; el.classList.toggle('cooling', cd > 0);
    el.title = forbidden ? '禁咒试炼：本局禁止陨星坠落。' : `${SKILLS[kind].description} · 冷却 ${(SKILLS[kind].cooldown * engine.upgrades.skillCooldownMultiplier).toFixed(1).replace(/\.0$/, '')} 秒`;
  });
  const previewIndex = state.phase==='battle'&&!early.available ? state.wave-1 : state.wave;
  const previewKey = `${previewIndex}:${state.phase}:${early.available}`;
  if (previewKey !== previewSignature) {
    previewSignature = previewKey;
    const wave = engine.level.waves[previewIndex], intel=analyzeWave(engine.level,previewIndex,engine.difficulty);
    $('#wave-preview').innerHTML = wave&&intel ? `<button class="wave-intel-link" data-action="intel" aria-label="查看第${previewIndex+1}波战术情报"><div class="wave-preview-heading"><span>${state.phase === 'battle'&&!early.available ? '当前进攻' : '下一波'}</span><strong class="wave-name">${wave.name}</strong>${icon('help')}</div><div class="wave-enemies">${wave.enemies.map(e => `<span>${ENEMY_STATS[e.kind].name.replace('林地', '').replace('疾奔', '').replace('荒野', '').replace('铁甲', '')}<b>×${e.count}</b></span>`).join('')}</div><span class="wave-tactical-tip">${intel.advice[0]??'混合布阵，守好出口。'}</span></button>` : `<strong class="wave-name">防线重归宁静</strong><span>古道仍通向王国</span>`;
  }
  renderTowerMenu(); updateBuildSites();
  const selectedEnemy = state.enemies.find(e => e.id === options.selectedEnemy), selectedAlly = state.allies.find(a => a.id === options.selectedAlly && a.hp > 0), tooltip = $('#enemy-tooltip');
  tooltip.hidden = !selectedEnemy && !selectedAlly;
  if (selectedEnemy) {
    const stats = ENEMY_STATS[selectedEnemy.kind];
    const armor = Math.max(0, stats.armor - ((selectedEnemy.armorBreakTimer ?? 0) > 0 ? selectedEnemy.armorBreakAmount ?? 0 : 0));
    const magicResist = Math.max(0, stats.magicResist - ((selectedEnemy.magicBreakTimer ?? 0) > 0 ? selectedEnemy.magicBreakAmount ?? 0 : 0));
    tooltip.innerHTML = `<strong>${stats.name}</strong><span>生命 ${Math.ceil(selectedEnemy.hp)} / ${Math.ceil(selectedEnemy.maxHp)}</span><span>攻击 ${Math.round(stats.damage * DIFFICULTY_MULTIPLIERS[engine.difficulty].damage)} · 护甲 ${Math.round(armor * 100)}% · 魔抗 ${Math.round(magicResist * 100)}%</span><span>基础移速 ${(stats.speed * DIFFICULTY_MULTIPLIERS[engine.difficulty].speed).toFixed(1)} · ${DIFFICULTY_UI[engine.difficulty].name}难度</span>${(selectedEnemy.armorBreakTimer ?? 0) > 0 ? `<span>护甲削弱 · ${Math.ceil(selectedEnemy.armorBreakTimer!)} 秒</span>` : ''}${(selectedEnemy.magicBreakTimer ?? 0) > 0 ? `<span>魔抗削弱 · ${Math.ceil(selectedEnemy.magicBreakTimer!)} 秒</span>` : ''}${selectedEnemy.bossCast ? `<span>重击蓄力 ${selectedEnemy.bossCast.remaining.toFixed(1)}s · 突袭或荆棘打断</span>` : ''}${(selectedEnemy.rootTimer ?? 0) > 0 ? `<span>荆棘定身 · ${selectedEnemy.rootTimer!.toFixed(1)} 秒</span>` : selectedEnemy.slowTimer > 0 ? `<span>减速 ${Math.round((selectedEnemy.slowAmount ?? .35) * 100)}% · ${selectedEnemy.slowTimer.toFixed(1)} 秒</span>` : ''}`;
  }
  if (selectedAlly) { tooltip.innerHTML = `<strong>${UNIT_VOICES[voiceForUnit(allyVoice(selectedAlly))].name}</strong><span>生命 ${Math.ceil(selectedAlly.hp)} / ${Math.ceil(selectedAlly.maxHp)}</span><span>攻击 ${Math.round(selectedAlly.damage*(selectedAlly.damageMultiplier??1))} · 护甲 ${Math.round((selectedAlly.armor+(selectedAlly.armorBonus??0))*100)}%</span>${(selectedAlly.poisonTimer??0)>0?`<span>中毒 · ${Math.ceil(selectedAlly.poisonTimer!)} 秒</span>`:''}`; }
  if (state.phase !== previousPhase) {
    previousPhase = state.phase;
    if (state.phase !== 'battle' && (options.targeting === 'meteor' || options.targeting === 'reinforce')) cancelTarget();
    if (state.phase === 'intermission') { toast(`第 ${state.wave} 波已击退！整顿防线，迎接下一波。`); audio.play('build'); saveCurrent(); }
    if (state.phase === 'victory' || state.phase === 'defeat') { deselect(); showResult(true); if (state.phase === 'victory') audio.play('win'); }
  }
}

function updateBossHud() {
  const boss = engine.state.enemies.find(enemy => enemy.hp > 0 && (enemy.kind === 'chieftain' || enemy.kind === 'juggernaut'));
  const hud = $('#boss-hud'); hud.hidden = !boss || ['victory', 'defeat'].includes(engine.state.phase);
  if (hud.hidden || !boss) { bossSignature = ''; return; }
  const cast = boss.bossCast;
  const interrupted = engine.state.effects.some(effect => effect.sourceId === boss.id && effect.style === 'boss-interrupted');
  const signature = `${boss.id}:${Math.ceil(boss.hp)}:${cast ? Math.ceil(cast.remaining * 10) : 'idle'}:${Math.ceil(boss.bossRecover ?? 0)}:${interrupted}:${engine.rulesVersion}`;
  if (signature === bossSignature) return;
  bossSignature = signature; hud.classList.toggle('danger', !!cast); hud.dataset.danger = String(!!cast);
  const recovery = (boss.bossRecover ?? 0) > 0;
  hud.innerHTML = `<div class="boss-heading">${icon(cast ? 'help' : 'shield')}<strong>${ENEMY_STATS[boss.kind].name}</strong><span>${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}</span></div><div class="boss-health"><i style="width:${Math.max(0, Math.min(100, boss.hp / boss.maxHp * 100))}%"></i></div><p>${cast ? `${icon('clock')}重击蓄力 ${cast.remaining.toFixed(1)}s · 离开红圈` : interrupted ? `${icon('check')}重击已打断 · 抓住输出机会` : recovery ? '首领收招 · 抓住输出机会' : engine.rulesVersion >= 2 ? '重击前摇可用月刃突袭 / 荆棘打断' : '集中火力，注意友军生命'}</p>`;
}
function showResult(record = false) {
  const state = engine.state, won = state.phase === 'victory', stars = victoryStars(state.lives, engine.level.lives), rule = isRuleChallenge(engine.challenge);
  const starsBefore=progress.earnedStars();
  if(won) {
    if(rule) progress.recordRuleVictory(engine.level.id,engine.challenge,state.lives,engine.level.lives,!record,engine.difficulty);
    else progress.recordVictory(engine.level.id,state.lives,engine.level.lives,!record,engine.difficulty);
  }
  if(record||won) saveCurrent();
  const newStars=progress.earnedStars()-starsBefore;
  const next = LEVELS[LEVELS.findIndex(level=>level.id===engine.level.id)+1];
  $('#result-overlay').hidden = false;
  $('#result-overlay').innerHTML = `<div class="result-card"><div class="result-emblem">${icon(won ? 'shield' : 'flag')}</div><p class="eyebrow">${won ? 'THE KINGDOM STANDS' : 'THE LINE HAS FALLEN'}</p><h2>${won ? `${engine.level.name}已守住` : '防线暂时失守'}</h2><span class="result-difficulty">${icon(DIFFICULTY_UI[engine.difficulty].glyph)}${DIFFICULTY_UI[engine.difficulty].name} · ${CHALLENGES[engine.challenge].name}</span><p>${won ? rule ? '挑战徽章已保存，可以尝试其他规则与难度。' : next ? `战役进度已保存，${next.name}现已解锁。` : '四处防线已完成，王国重归宁静。' : '调整布阵，再战一次。'}</p>${won ? `<div class="result-stars" aria-label="${rule ? '挑战徽章' : '战役星级'} ${stars}">${[0, 1, 2].map(i => icon('star', i < stars ? 'earned' : '')).join('')}</div>` : ''}<div class="result-stats"><span><strong>${state.kills}</strong>击败敌人</span><span><strong>${state.wave}/${engine.level.waves.length}</strong>防守波次</span><span><strong>${state.lives}</strong>剩余生命</span></div><p class="result-training">${won ? rule ? '规则挑战独立计分，按剩余生命授予 1–3 级徽章。' : newStars > 0 ? `新增 ${newStars} 颗星，前往星级天赋训练守军。` : `可用 ${progress.availableStars()} 星 · 提升最高星级可获得更多星。` : '查看复盘，调整火力优先级和集结点，再挑战这条防线。'}</p>${(state.stats.earlyWavesCalled??0)>0?`<p class="early-wave-result">抢先召敌 ${state.stats.earlyWavesCalled} 次 · 额外取得 ${state.stats.earlyWaveGold} 金币</p>`:''}<div class="result-buttons"><button class="primary-button" data-action="report" aria-label="查看战斗复盘">${icon('book')}查看战斗复盘</button>${won&&!rule?`<button class="secondary-button" data-action="training">${icon('star')}星级天赋</button>`:''}${won&&!rule&&next?`<button class="primary-button" data-level="${next.id}" data-mode="standard">${icon('chevron')}前往${next.name}</button>`:''}<button class="secondary-button" data-action="campaign">${icon('map')}战役地图</button><button class="secondary-button" data-action="restart">${icon('reset')}重新挑战本关</button></div></div>`;
}
function showBattleReport() {
  if (!engine.state.report) return;
  openDialog('战斗复盘', `${engine.level.name} · ${DIFFICULTY_UI[engine.difficulty].name} · ${CHALLENGES[engine.challenge].name}`, battleReportBody(engine.state.report, engine.level.pathLength, engine.state.time, !!engine.getMapEventStatus()));
}
function restart() {
  engine=new GameEngine(undefined,engine.level.id,{difficulty:engine.difficulty,challenge:engine.challenge,upgrades:deriveBattleUpgrades(progress.progress.doctrines)});
  plannedChallenge=engine.challenge;
  options.paused = false; options.selectedSlot = null; options.selectedEnemy = null; options.selectedAlly = null; options.heroSelected = false; cancelTarget();
  previousPhase = engine.state.phase; $('#result-overlay').hidden = true; towerSignature = ''; previewSignature = ''; audio.resetEffects(); hideTip = false;
  $('#voice-caption').hidden=true; mountLevel(); updateUI(); saveCurrent(); toast('新的防线已准备，已采用当前星级天赋。');
}
function updateMapEventControl() {
  const button=$<HTMLButtonElement>('#map-event-button'), status=engine.getMapEventStatus();
  button.hidden=!status || ['victory','defeat'].includes(engine.state.phase);
  if(!status || button.hidden) return;
  const point=renderer.worldToScreen({x:status.position.x+37,y:status.position.y-27}), rect=canvas.getBoundingClientRect();
  const scale=renderer.worldToScreen({x:1,y:0}).x-renderer.worldToScreen({x:0,y:0}).x;
  button.style.left=`${point.x}px`; button.style.top=`${point.y}px`;
  button.style.setProperty('--gate-control-size',`${Math.max(24,Math.min(36,30*scale))}px`);
  button.classList.toggle('compact',rect.width<600);
  const hero=engine.state.allies.find(ally=>ally.type==='hero')!;
  const near=Math.hypot(hero.x-status.position.x,hero.y-status.position.y)<=status.triggerRadius;
  const active=status.activeRemaining>0, cooling=status.cooldownRemaining>0;
  const label=active?`洪流 ${Math.ceil(status.activeRemaining)}s`:cooling?`冷却 ${Math.ceil(status.cooldownRemaining)}s`:!near?'前往水闸':status.ready?'开启水闸':engine.state.phase==='battle'?'等待敌群':'水闸待命';
  if(button.dataset.label!==label) {
    button.innerHTML=`<span class="gate-control-caption">${label}</span>`;
    button.dataset.label=label;
  }
  button.dataset.state=active?'active':cooling?'cooling':status.ready?'ready':'idle';
  button.disabled=options.paused || !!options.targeting || options.heroSelected || hero.hp<=0 || active || cooling || near&&!status.ready;
  button.setAttribute('aria-label',`沼泽水闸：${label}`);
  button.title=`艾琳靠近后开闸：范围减速55%，持续6秒，冷却35秒。${status.reason}`;
}
function useMapEvent() {
  options.mapEventHighlighted=false;
  const status=engine.getMapEventStatus(), hero=engine.state.allies.find(ally=>ally.type==='hero');
  if(!status || options.paused || !hero || hero.hp<=0) return;
  if(Math.hypot(hero.x-status.position.x,hero.y-status.position.y)>status.triggerRadius) {
    deselect(); const result=engine.moveHero(status.position.x,status.position.y);
    if(result.ok) { saveCurrent(); toast('艾琳正在靠近水闸，敌群进入关口后点击开闸。'); }
    else toast(result.message,true);
  } else {
    const result=engine.activateMapEvent(); toast(result.message,!result.ok);
    if(result.ok) saveCurrent();
  }
  updateUI();
}
function selectHero() {
  const hero = engine.state.allies.find(a => a.type === 'hero');
  if (!hero || hero.hp <= 0) { toast('英雄正在复活，请稍候。', true); return; }
  cancelTarget(); options.heroSelected = !options.heroSelected; options.selectedSlot = null; options.selectedEnemy = null; options.selectedAlly = hero.id; playVoice(voiceForUnit({type:'hero'})); updateTargetBanner(); updateUI();
}
function beginRally() {
  const tower = engine.state.towers.find(t => t.slotId === options.selectedSlot);
  if (!tower || tower.kind !== 'barracks' || options.paused || ['victory', 'defeat'].includes(engine.state.phase)) return;
  options.heroSelected = false; options.pointer = null; options.targeting = options.targeting === 'rally' ? null : 'rally'; updateTargetBanner(); updateUI();
}
function activateSkill(kind: SkillKind) {
  if (engine.challenge === 'no-meteor' && kind === 'meteor') { toast('禁咒试炼：本局禁止陨星坠落。', true); return; }
  if (options.paused || engine.state.phase !== 'battle' || engine.state.skillCooldowns[kind] > 0) return;
  const hero = engine.state.allies.find(a => a.type === 'hero');
  if (HERO_SKILLS.some(skill => skill === kind) && (!hero || hero.hp <= 0)) return;
  if (SKILLS[kind].target === 'hero') {
    if (!hero) return;
    options.heroSelected = false; options.selectedSlot = null; cancelTarget();
    const result = engine.castSkill(kind, hero.x, hero.y);
    toast(result.message, !result.ok); if(result.ok) saveCurrent(); updateUI();
  } else {
    options.heroSelected = false; options.selectedSlot = null; options.targeting = options.targeting === kind ? null : kind; updateTargetBanner(); updateUI();
  }
}
function chooseSlot(id: number) {
  if (options.paused || ['victory', 'defeat'].includes(engine.state.phase)) return;
  options.selectedSlot = options.selectedSlot === id ? null : id; options.selectedEnemy = null; options.selectedAlly = null; options.heroSelected = false; cancelTarget();
  const tower=engine.state.towers.find(t=>t.slotId===id);
  if(tower) playVoice(voiceForUnit({type:'tower',kind:tower.kind,level:tower.level})); else audio.play('click'); updateUI();
}
function allyVoice(ally: Ally) {
  return {type:ally.type,level:engine.state.towers.find(t=>t.id===ally.towerId)?.level??1};
}
function handleMapClick(point: Point) {
  unlockAudio();
  if (['victory', 'defeat'].includes(engine.state.phase) || options.paused) return;
  if (options.targeting) {
    const tower = engine.state.towers.find(t => t.slotId === options.selectedSlot);
    const result = options.targeting === 'rally' ? tower ? engine.setRally(tower.id, point.x, point.y) : { ok: false, message: '请先选择兵营。' } : engine.castSkill(options.targeting, point.x, point.y);
    if (result.ok) { cancelTarget(); if (options.selectedSlot !== null) towerSignature = ''; }
    toast(result.message, !result.ok); if(result.ok) saveCurrent(); updateUI(); return;
  }
  const hero = engine.state.allies.find(a => a.type === 'hero');
  if (hero && hero.hp > 0 && Math.abs(point.x - hero.x) < 27 && point.y >= hero.y - 84 && point.y <= hero.y + 16) { selectHero(); return; }
  if (options.heroSelected) { const result = engine.moveHero(point.x, point.y); if (!result.ok) toast(result.message, true); else {audio.play('click');saveCurrent();} return; }
  const ally = [...engine.state.allies].reverse().find(a=>a.type!=='hero'&&a.hp>0&&Math.abs(point.x-a.x)<20&&point.y>=a.y-52&&point.y<=a.y+10);
  if(ally) { options.selectedAlly=ally.id; options.selectedEnemy=null; options.selectedSlot=null; playVoice(voiceForUnit(allyVoice(ally))); cancelTarget(); updateUI(); return; }
  const tower = [...engine.state.towers].reverse().find(t => Math.abs(point.x - t.x) < (t.level === 3 ? 47 : 36) && point.y >= t.y - Math.min(t.y - 8, t.level === 3 ? 134 : t.level === 2 ? 121 : 105) && point.y <= t.y + 22);
  const slot = tower ? engine.level.slots[tower.slotId] : engine.level.slots.find(s => Math.hypot(point.x - s.x, point.y - s.y) < 42);
  if (slot) { chooseSlot(slot.id); return; }
  const enemy = [...engine.state.enemies].reverse().find(e => Math.abs(point.x-e.x)<(e.kind==='golem'||e.kind==='chieftain'||e.kind==='juggernaut'?32:23)&&point.y>=e.y-(e.kind==='golem'||e.kind==='chieftain'||e.kind==='juggernaut'?70:46)&&point.y<=e.y+10);
  options.selectedEnemy = enemy?.id ?? null; options.selectedAlly=null; options.selectedSlot = null;
  if(enemy) playVoice(voiceForUnit({type:'enemy',kind:enemy.kind})); cancelTarget(); updateUI();
}

canvas.addEventListener('pointermove', event => { options.pointer = renderer.screenToWorld(event.clientX, event.clientY); });
canvas.addEventListener('pointerleave', () => { options.pointer = null; });
canvas.addEventListener('click', event => handleMapClick(renderer.screenToWorld(event.clientX, event.clientY)));
canvas.addEventListener('contextmenu', event => { event.preventDefault(); deselect(); });
$('#target-banner button').addEventListener('click', () => { options.heroSelected = false; cancelTarget(); updateUI(); });
$('#field-tip button').addEventListener('click', () => { hideTip = true; updateUI(); });
$('#hero-button').addEventListener('click', selectHero);
const gateControl=$<HTMLButtonElement>('#map-event-button');
gateControl.addEventListener('pointerenter',()=>{ options.mapEventHighlighted=true; });
gateControl.addEventListener('pointerleave',()=>{ options.mapEventHighlighted=false; });
gateControl.addEventListener('focus',()=>{ options.mapEventHighlighted=true; });
gateControl.addEventListener('blur',()=>{ options.mapEventHighlighted=false; });
$('#next-wave-button').addEventListener('click', () => {
  unlockAudio(); options.paused = false; const result = engine.state.phase==='battle'?engine.callEarlyWave():engine.startWave();
  if (result.ok) { hideTip = true; deselect(); audio.play('wave'); toast(result.message); saveCurrent(); } else toast(result.message, true); updateUI();
});
function togglePause() { if (['victory', 'defeat'].includes(engine.state.phase)) return; options.paused = !options.paused; updateUI(); }
$('#pause-button').addEventListener('click', togglePause);
$('#speed-button').addEventListener('click', () => { speed = speed === 1 ? 2 : 1; $('#speed-button').textContent = `${speed}×`; });
$('#sound-button').addEventListener('click', () => {
  audio.enabled = !audio.enabled; unlockAudio(); const name = audio.enabled ? '关闭战斗音效' : '开启战斗音效';
  $('#sound-button').innerHTML = icon(audio.enabled ? 'sound' : 'mute'); $('#sound-button').title = name; $('#sound-button').setAttribute('aria-label', name); $('#sound-button').setAttribute('aria-pressed', String(audio.enabled));
});
$('#music-button').addEventListener('click', () => {
  audio.musicEnabled = !audio.musicEnabled; unlockAudio(); const name = audio.musicEnabled ? '关闭背景音乐' : '开启背景音乐';
  $('#music-button').classList.toggle('muted', !audio.musicEnabled); $('#music-button').title = name; $('#music-button').setAttribute('aria-label', name); $('#music-button').setAttribute('aria-pressed', String(audio.musicEnabled));
});
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('当前浏览器不支持全屏。', true); } });

document.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return; unlockAudio();
  if (button.dataset.slot !== undefined) chooseSlot(Number(button.dataset.slot));
  if (button.dataset.tower && options.selectedSlot !== null && !options.paused) {
    const result = engine.build(options.selectedSlot, button.dataset.tower as TowerKind); toast(result.message, !result.ok);
    if (result.ok) { audio.play('build'); hideTip = true; towerSignature = ''; } updateUI();
  }
  if (button.dataset.skill) activateSkill(button.dataset.skill as SkillKind);
  const action = button.dataset.action, tower = engine.state.towers.find(t => t.slotId === options.selectedSlot);
  if (action === 'upgrade' && tower && !options.paused) { const result = engine.upgrade(tower.id); toast(result.message, !result.ok); if (result.ok) audio.play('build'); updateUI(); }
  if (button.dataset.ability && tower && !options.paused) { const result = engine.buyTowerAbility(tower.id, button.dataset.ability as TowerAbilityKind); toast(result.message, !result.ok); if (result.ok) audio.play('build'); updateUI(); }
  if (button.dataset.priority && tower && !options.paused) { const result=engine.setTowerPriority(tower.id,button.dataset.priority as TowerPriority); toast(result.message,!result.ok); updateUI(); }
  if (button.dataset.towerPanel === 'branch' || button.dataset.towerPanel === 'skills') { towerPanel = button.dataset.towerPanel; updateUI(); }
  if (button.dataset.branch && tower && !options.paused) {
    const result = engine.chooseTowerBranch(tower.id, button.dataset.branch as TowerBranchId);
    toast(result.message, !result.ok); if (result.ok) { audio.play('build'); towerSignature = ''; } updateUI();
  }
  if (action === 'sell' && tower && !options.paused) { const result = engine.sell(tower.id); toast(result.message, !result.ok); deselect(); }
  if (action === 'deselect') deselect();
  if (action === 'rally') beginRally();
  if (action === 'restart') restart();
  if (action === 'save') saveCurrent(true);
  if (action === 'campaign') showCampaign();
  if (action === 'difficulty') showCampaign(true);
  if (action === 'training') showTraining();
  if (action === 'intel') showWaveIntel();
  if (action === 'report') showBattleReport();
  if (action === 'map-event') useMapEvent();
  if (button.dataset.challenge && isChallengeMode(button.dataset.challenge)) { plannedChallenge=button.dataset.challenge; $('#dialog-body').innerHTML=campaignBody(); }
  if (isDifficulty(button.dataset.difficulty)) { plannedDifficulty=button.dataset.difficulty; $('#dialog-body').innerHTML=campaignBody(); focusDifficultyPicker(); }
  if (button.dataset.doctrine) { const result=progress.learnDoctrine(button.dataset.doctrine as DoctrineId); $('#dialog-body').innerHTML=doctrineWorkshop(progress,engine.upgrades); toast(result.message,!result.ok); if(result.ok) audio.play('build'); updateUI(); }
  if (action === 'reset-doctrines') { const result=progress.resetDoctrines(); $('#dialog-body').innerHTML=doctrineWorkshop(progress,engine.upgrades); toast(result.message,!result.ok); updateUI(); }
  if (button.dataset.level) enterLevel(button.dataset.level as LevelId, button.dataset.resume === 'true', isChallengeMode(button.dataset.mode) ? button.dataset.mode : plannedChallenge);
  if (button.dataset.voice) playVoice(button.dataset.voice as VoiceId);
  if (action === 'resume') { options.paused = false; updateUI(); }
  if (action === 'guide') showGuide();
  if (action === 'bestiary') showBestiary();
  if(button.dataset.tower||button.dataset.ability||button.dataset.priority||button.dataset.branch||action==='upgrade'||action==='sell') saveCurrent();
});
document.addEventListener('keydown', event => {
  if (dialog.open || event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target as Element).matches('input,textarea,select,[contenteditable="true"]')) return;
  unlockAudio();
  if (event.key === ' ') { event.preventDefault(); togglePause(); }
  if (event.key === 'Escape') deselect();
  if (event.key.toLowerCase() === 'h') selectHero();
  const skillControl = skillControls.find(control => control.key === event.key);
  if (skillControl) activateSkill(skillControl.kind);
  if (event.key.toLowerCase() === 'n') $('#next-wave-button').click();
  if (event.key.toLowerCase() === 'r') beginRally();
});
const dialog = document.querySelector<HTMLDialogElement>('#info-dialog')!;
$('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
let pausedBeforeDialog = false;
dialog.addEventListener('close', () => { options.paused = pausedBeforeDialog; updateUI(); });
function openDialog(title: string, eyebrow: string, body: string) {
  if(!dialog.open) pausedBeforeDialog = options.paused;
  options.paused = true; $('#dialog-title').textContent = title; $('#dialog-eyebrow').textContent = eyebrow; $('#dialog-body').innerHTML = body; if(!dialog.open) dialog.showModal(); updateUI();
}
function enterLevel(id: LevelId, load = false, mode: ChallengeMode = plannedChallenge) {
  const level=LEVELS.find(candidate=>candidate.id===id);
  if(!level||!progress.isChallengeUnlocked(id,mode)) { toast(isRuleChallenge(mode)?'先通关本关标准战役，解锁规则挑战。':'完成前一关后解锁。',true); return; }
  saveCurrent();
  const deployment={difficulty:plannedDifficulty,challenge:mode,upgrades:deriveBattleUpgrades(progress.progress.doctrines)};
  let nextEngine=new GameEngine(undefined,id,deployment);
  const checkpoint=load?progress.getCheckpoint(id,mode):null;
  let restored=false;
  if(checkpoint) { const result=nextEngine.importSave(checkpoint); restored=result.ok&&nextEngine.level.id===id&&nextEngine.challenge===mode; if(!restored) {progress.discardCheckpoint(id,mode);nextEngine=new GameEngine(undefined,id,deployment);} }
  engine=nextEngine; options.selectedSlot=null; options.selectedEnemy=null; options.selectedAlly=null; options.heroSelected=false; options.targeting=null; options.pointer=null;
  plannedDifficulty=engine.difficulty;
  plannedChallenge=engine.challenge;
  options.paused=restored&&engine.state.phase==='battle'; previousPhase=engine.state.phase;
  pausedBeforeDialog=options.paused; if(dialog.open) dialog.close();
  $('#result-overlay').hidden=true; $('#voice-caption').hidden=true; hideTip=engine.state.phase!=='preparation';
  audio.resetEffects(); lastTime=performance.now(); mountLevel(); updateTargetBanner(); updateUI();
  if(engine.state.phase==='victory'||engine.state.phase==='defeat') showResult();
  saveCurrent(); toast(restored?`已恢复${level.name} · ${DIFFICULTY_UI[engine.difficulty].name}原难度，第 ${engine.state.wave} 波。`:`${level.name} · ${DIFFICULTY_UI[engine.difficulty].name}难度，开始部署防线。`);
}
function campaignBody() {
  const earned=progress.earnedStars();
  return `<div class="campaign-intro"><p>通关解锁疆土与本关规则挑战。换一种限制，再守同一条防线。</p><span>${icon('star')}${earned} / ${LEVELS.length*3}<button data-action="training">训练 · ${progress.availableStars()} 星</button></span></div>${difficultyPicker(plannedDifficulty, engine.difficulty)}${challengePicker(plannedChallenge)}<div class="campaign-grid">${LEVELS.map((level,index)=>{
    const baseUnlocked=progress.isUnlocked(level.id),unlocked=progress.isChallengeUnlocked(level.id,plannedChallenge),record=progress.progress.completed[level.id],tactics=getLevelTactics(level,plannedDifficulty);
    const checkpoint=progress.getCheckpoint(level.id,plannedChallenge) as {difficulty?:Difficulty;state?:{phase?:string;wave?:number}}|null;
    const resumable=!!checkpoint&&['preparation','battle','intermission'].includes(checkpoint.state?.phase??'');
    const candidateWave=checkpoint?.state?.wave;
    const savedWave=typeof candidateWave==='number'&&Number.isInteger(candidateWave)?candidateWave:0;
    const savedDifficulty=isDifficulty(checkpoint?.difficulty)?checkpoint.difficulty:'normal';
    const paths=level.path.map(p=>`${p.x},${p.y}`).join(' '),kinds=[...new Set(level.waves.flatMap(w=>w.enemies.map(e=>e.kind)))];
    const medals=isRuleChallenge(plannedChallenge)?difficultyBadges(Object.fromEntries(DIFFICULTIES.map(difficulty=>[difficulty,progress.getRuleRecord(level.id,plannedChallenge,difficulty)?.medal??0])),true):difficultyBadges(record?.challengeStars??{});
    const label=isRuleChallenge(plannedChallenge)?`重新部署 · ${CHALLENGES[plannedChallenge].name}`:record||resumable?'重新部署':'开始关卡';
    return `<article class="campaign-card ${level.theme} ${unlocked?'':'locked'}"><div class="campaign-map"><svg viewBox="0 0 1200 720" aria-hidden="true"><polyline points="${paths}" fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round" stroke-linejoin="round"/>${level.slots.map(slot=>`<circle cx="${slot.x}" cy="${slot.y}" r="23" fill="currentColor"/>`).join('')}</svg><span>0${index+1} · ${level.theme.toUpperCase()}</span>${!unlocked?`<b>${icon('shield')}${baseUnlocked?'先通关本关战役':'完成前一关解锁'}</b>`:''}</div><div class="campaign-card-body"><div class="campaign-title"><h3>${level.name}</h3><span class="campaign-stars" aria-label="标准战役 ${record?.stars??0} 星">${[1,2,3].map(n=>icon('star',n<=(record?.stars??0)?'earned':'')).join('')}</span></div><p>${level.subtitle} · ${level.waves.length} 波进攻</p><div class="campaign-roster">${kinds.map(kind=>`<span>${ENEMY_STATS[kind].name}</span>`).join('')}</div><p class="campaign-tactic" title="${tactics.advice[0]??''}">${tactics.advice[0]??'混合布阵守住道路。'}</p><div class="campaign-badges">${medals}</div><div class="campaign-card-actions">${resumable&&unlocked?`<button class="primary-button" data-level="${level.id}" data-mode="${plannedChallenge}" data-resume="true">${icon('play')}${savedWave>0?`继续第 ${savedWave} 波`:'继续部署'}<small>原难度 · ${DIFFICULTY_UI[savedDifficulty].name}</small></button>`:''}<button class="${resumable?'secondary-button':'primary-button'}" data-level="${level.id}" data-mode="${plannedChallenge}" ${!unlocked?'disabled':''}>${icon(unlocked?'flag':'shield')}${label}<small>新战局 · ${DIFFICULTY_UI[plannedDifficulty].name}</small></button></div></div></article>`;
  }).join('')}</div><p class="campaign-save-note">${icon('save')}标准战役与每种规则挑战独立续战，保留难度、天赋、流派与塔策略。挑战徽章不增加战役星币，旧存档仍可继续。</p>`;
}
function focusDifficultyPicker() {
  const picker = $('#dialog-body').querySelector<HTMLElement>('#difficulty-picker');
  picker?.scrollIntoView({ block: 'nearest' });
  picker?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
function showCampaign(focusDifficulty = false) {
  saveCurrent(); openDialog('王国防线','THE FOUR FRONTIERS',campaignBody());
  if (focusDifficulty) focusDifficultyPicker();
}
function showTraining() {
  saveCurrent(); openDialog('星级天赋','TRAIN THE GUARD',doctrineWorkshop(progress,engine.upgrades));
}
function showWaveIntel() {
  const early=engine.getEarlyWaveOffer(), state=engine.state;
  const index=state.phase==='battle'&&!early.available?state.wave-1:Math.min(state.wave,engine.level.waves.length-1);
  const intel=analyzeWave(engine.level,index,engine.difficulty); if(!intel) return;
  const wave=engine.level.waves[index],counts=new Map<EnemyKind,number>();
  for(const group of wave.enemies) counts.set(group.kind,(counts.get(group.kind)??0)+group.count);
  const positions=getLevelTactics(engine.level,engine.difficulty).positions.slice(0,2);
  if(engine.challenge==='no-meteor') {
    intel.advice=intel.advice.filter(advice=>!advice.includes('陨星'));
    intel.advice.unshift('禁咒试炼：陨星不可用，优先用炮塔清群，并让英雄绝技处理急迫威胁。');
  }
  openDialog(`第 ${index+1} 波 · ${intel.name}`,'SCOUT THE APPROACH',`<p class="dialog-intro">${wave.description} · ${DIFFICULTY_UI[engine.difficulty].name}难度</p><div class="intel-metrics"><span><strong>${intel.enemyCount}</strong>名敌军</span><span><strong>${intel.bounty}</strong>击杀金币</span><span><strong>${Math.ceil(intel.spawnDuration)}s</strong>出兵约时 · 1×</span></div>${early.available?`<aside class="intel-risk">${icon('flag')}现在抢先召敌：+${early.gold} 金币、全技能冷却 −${early.cooldownReduction}s；上一波 ${state.enemies.length} 名余敌仍会继续进攻。</aside>`:''}<div class="intel-advice"><h3>这波怎么守</h3>${intel.advice.map(advice=>`<p>${icon('check')}${advice}</p>`).join('')}${intel.warnings.map(warning=>`<p class="warning">${icon('help')}${warning}</p>`).join('')}</div><div class="intel-towers"><span>建议工事</span>${intel.recommendedTowers.map(kind=>`<b>${icon(kind==='mage'?'magic':kind==='arrow'?'arrow':kind==='cannon'?'cannon':'barracks')}${towerLabels[kind]}</b>`).join('')}</div><div class="intel-priorities">${intel.targetingAdvice.map(advice=>`<p><strong>${towerLabels[advice.towerKind]} · 优先${PRIORITY_UI[advice.priority].name}</strong><span>${advice.reason}</span></p>`).join('')}</div><h3 class="roster-heading">兵种与克制</h3><div class="intel-enemies">${[...counts].map(([kind,count])=>{const enemy=ENEMY_STATS[kind],counter=getEnemyCounters(kind,engine.difficulty);return `<article><div><strong>${enemy.name}</strong><b>×${count}</b></div><small>生命 ${Math.ceil(enemy.hp*DIFFICULTY_MULTIPLIERS[engine.difficulty].hp)} · 护甲 ${Math.round(enemy.armor*100)}% · 魔抗 ${Math.round(enemy.magicResist*100)}%</small><p>${counter.advice[0]??'用连射清理轻甲敌军。'}</p></article>`;}).join('')}</div><div class="intel-positions"><h3>道路布防参考</h3>${positions.map(position=>`<p><strong>建造点 ${position.slotId+1}</strong>${position.reason}</p>`).join('')}<small>把卫兵集结在已有火力范围里，并让英雄守在出口前救险。</small></div>`);
}
function showGuide() {
  openDialog('指挥官手册', 'A FIELD GUIDE', `<p class="dialog-intro">守住四关战役的每波进攻，别让敌人突破王国防线。击败敌人可获得金币，用来建设与升级防线。</p><div class="guide-grid"><article>${icon('barracks')}<h3>布置你的防线</h3><p>点击地图的圆形石基，在石基旁选择箭塔、魔法塔、炮塔或兵营。点击已建的塔，就地升级、集结或出售。到达 3 级后，可在「终极流派」选择两种战斗风格之一，再切换「进阶专精」学习三种技能，每种可强化至 2 级。流派转型需金币，已学专精保留。点击空地或 Esc 关闭菜单。</p></article><article>${icon('sword')}<h3>指挥英雄</h3><p>点击英雄卡片或按 H，再点击地面移动。英雄会自动拦截并攻击附近敌人，倒下后自动复活。</p></article><article>${icon('flag')}<h3>驻兵与拦截</h3><p>兵营派出 3 名士兵。选中兵营，点击就地菜单里的集结旗帜或按 R，再选择高亮道路上的集结地。三名卫兵会前往该处，阵亡补充后继续守住这里。</p></article><article>${icon('magic')}<h3>把握技能时机</h3><p>1：派出临时援军。2：陨石造成无视护甲的范围伤害。3：守林之怒，剑舞杀伤并回春。4：月刃突袭，选择英雄附近的突进终点，斩击沿途敌人。5：荆棘缚境，选择敌群，定身并减速。6：古树盟约，治疗附近友军并暂时提升攻击与护甲。四种绝技有独立冷却，英雄倒下时不能使用。</p></article></div><div class="guide-strategy"><strong>${icon('shield')}暮林战术</strong><p>箭塔擅长快速消灭轻甲敌人；魔法塔穿透护甲并减速；炮塔范围轰击清理密集敌人；兵营争取输出时间。狼跑得快，兽人护甲高，萨满会治疗，巨人披坚甲。让每种塔做它最擅长的事。</p></div><div class="guide-strategy"><strong>首领重击 · 抢下反制窗口</strong><p>新战局中，荆棘酋长和熔铠领主会锁定友军位置，蓄力后攻击地面的红色圆圈。红圈不会跟随移动：及时撤开英雄或移动集结点，也可以用月刃突袭或荆棘缚境命中首领来打断蓄力。普通减速无法打断。首领蓄力时停止移动和普通攻击。</p></div><div class="specialization-guide"><h3>三级塔 · 进阶专精</h3>${towerKinds.map(kind => `<p><strong>${getTowerStats(kind, 3).name}</strong>：${getTowerAbilities(kind).map(ability => `${ability.name}（${ability.description}）`).join('；')}。</p>`).join('')}</div><div class="guide-strategy"><strong>暮林之声</strong><p>第一次点击战场后，原创森林主题音乐开始播放。右上角音符控制背景音乐，扬声器控制战斗音效，两者可以独立开关；点击英雄、驻兵、敌人或防御塔可听到各自的英文回应，图鉴中也可试听。暂停或切出页面时音乐和单位语音暂歇。自动存档每 5 秒更新一次，也可点击顶部存档按钮立即保存；战役地图保留各关续战与最高星级。</p></div><div class="guide-strategy"><strong>战术与成长</strong><p>箭塔、魔法塔和炮塔可就地选择优先出口、强敌或残血。点击顶部波次或下方预告，查看兵种克制、技能与布防建议。当前波敌人全部出场后，可以抢先召下一波，最多额外取得 25 金币并让全部技能冷却减少 4 秒；旧敌仍会继续进攻。</p><p>通关的最高星级可用于四种天赋，每阶 1 星，可以免费重新分配。新关和重新挑战会采用当前训练，继续旧存档保留原配置。战场顶部「难度」按钮打开五档选择：经典、老兵、英雄、噩梦、炼狱。新难度只在重新部署时生效，继续存档保留原难度和训练。噩梦需要熟练运用英雄绝技；炼狱推荐完成星级训练。各档高难度徽章分别记录，最高总星级仍为 12 星。</p></div><div class="shortcuts"><span><kbd>空格</kbd>暂停</span><span><kbd>H</kbd>英雄</span><span><kbd>N</kbd>下一波</span><span><kbd>R</kbd>兵营集结点</span><span><kbd>3–6</kbd>艾琳绝技</span><span><kbd>Esc</kbd>取消选择</span></div>`);
  $('#dialog-body .shortcuts').insertAdjacentHTML('beforebegin', `<div class="guide-strategy"><strong>沼泽水闸 · 借地形守关</strong><p>新版毒沼渡口的岸边设有水闸，河水沿低矮渡道流向下游池塘。点击手轮旁的「前往水闸」指挥艾琳靠近，悬停或聚焦手轮可查看减速范围；敌群进入关口后点击「开启水闸」。范围内敌军减速 55%，持续 6 秒，冷却 35 秒。需要艾琳存活并站在水闸 100 范围内；洪流不打断首领蓄力。</p></div><div class="guide-strategy"><strong>规则挑战与战斗复盘</strong><p>本关标准战役通关后，在战役地图选择「四塔防线」（同时最多 4 座塔，可出售换位）或「禁咒试炼」（禁用陨星）。挑战按难度记录独立徽章，各玩法各自续战。胜败后点击「查看战斗复盘」，比较各塔实际伤害、英雄贡献、漏怪和最危险的交战时段。旧存档从恢复后开始记录贡献，并明确标注。</p></div>`);

}
function showBestiary() {
  const roles: Partial<Record<EnemyKind,string>> = { wolf:'迅捷突袭', orc:'重甲战士', shaman:'治疗施法者', golem:'重甲巨兽', chieftain:'森林首领', bogling:'泥群再生', serpent:'毒牙突袭', icewolf:'霜狼抗缓', frostguard:'冰甲防线', imp:'阵亡自爆', juggernaut:'熔铠首领' };
  const allies = [{voice:'hero' as VoiceId,hp:HERO_STATS.hp,damage:HERO_STATS.damage,armor:HERO_STATS.armor,description:'月刃突袭穿阵，荆棘缚敌，古树盟约护军。'}, ...[1,2,3].map(level=>{const stats=getTowerStats('barracks',level);return {voice:`soldier-${level}` as VoiceId,hp:stats.soldierHp!,damage:stats.soldierDamage!,armor:stats.soldierArmor!,description:`${level} 级驻兵 · 三人编队 · 集结拦路 · 阵亡 9 秒补员。`};}), {voice:'reinforcement' as VoiceId,hp:185,damage:20,armor:.25,description:'战场指令召来两名援军，协助拦截，持续 24 秒。'}];
  openDialog('兵种与战场之声', 'THE BESTIARY', `<p class="dialog-intro">${Object.keys(ENEMY_STATS).length} 种敌军、五种友军形态，各有属性与英文台词。以下为经典基础数值；敌军生命、攻击、移速随难度改变，守军属性受星级训练影响。点击单位可查看实际属性并听见回应。</p><p class="voice-preview-text" aria-live="polite">${icon('sound')}点击“试听回应”，听听他们怎么说。</p><h3 class="roster-heading">王国守军</h3><div class="bestiary-grid allied-roster">${allies.map(ally=>`<article class="enemy-card"><div class="enemy-card-heading"><span class="enemy-sigil" style="--enemy-color:#7aa986">${icon(ally.voice==='hero'?'moonblade':'shield')}</span><h3>${UNIT_VOICES[ally.voice].name}</h3></div><p>${ally.description}</p><dl><div><dt>生命</dt><dd>${ally.hp}</dd></div><div><dt>攻击</dt><dd>${ally.damage}</dd></div><div><dt>护甲</dt><dd>${Math.round(ally.armor*100)}%</dd></div></dl><button class="voice-preview-button" data-voice="${ally.voice}" aria-label="试听${UNIT_VOICES[ally.voice].name}">${icon('sound')}试听回应</button></article>`).join('')}</div><h3 class="roster-heading">来袭敌军</h3><div class="bestiary-grid">${(Object.keys(ENEMY_STATS) as EnemyKind[]).map(kind => {
    const e = ENEMY_STATS[kind],voice=voiceForUnit({type:'enemy',kind});
    return `<article class="enemy-card"><div class="enemy-card-heading"><span class="enemy-sigil" style="--enemy-color:${e.color}">${icon(kind.includes('wolf') ? 'arrow' : kind === 'shaman' ? 'magic' : e.armor>.5 ? 'armor' : kind === 'chieftain'||kind==='juggernaut' ? 'shield' : 'sword')}</span><div><h3>${e.name}</h3><small>${roles[kind]??'轻甲步兵'}</small></div><span class="enemy-reward">${icon('coin')}${e.gold}</span></div><p>${e.description}</p><p class="counter-note">${getEnemyCounters(kind).advice[0]??'箭塔连射适合清理轻甲步兵。'}</p><dl><div><dt>生命</dt><dd>${e.hp}</dd></div><div><dt>攻击</dt><dd>${e.damage}</dd></div><div><dt>移速</dt><dd>${e.speed}</dd></div><div><dt>护甲</dt><dd>${Math.round(e.armor * 100)}%</dd></div><div><dt>魔抗</dt><dd>${Math.round(e.magicResist * 100)}%</dd></div><div><dt>突破损失</dt><dd>${e.lives} 生命</dd></div></dl><button class="voice-preview-button" data-voice="${voice}" aria-label="试听${e.name}">${icon('sound')}试听回应</button></article>`;
  }).join('')}</div><h3 class="roster-heading">防御塔操作员</h3><div class="tower-voice-roster">${towerKinds.map(kind=>`<button class="voice-preview-button" data-voice="${voiceForUnit({type:'tower',kind})}">${icon(kind==='mage'?'magic':kind==='arrow'?'arrow':kind==='cannon'?'cannon':'barracks')}${UNIT_VOICES[voiceForUnit({type:'tower',kind})].name} · 试听</button>`).join('')}</div>`);
}

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .08); lastTime = now;
  if (!options.paused) engine.update(dt * speed);
  renderer.render(engine.state, options); uiTimer += dt;
  if (uiTimer > .12) { updateUI(); uiTimer = 0; }
  autoSaveTimer += dt;
  if(autoSaveTimer >= 5) { if(!document.hidden) saveCurrent(); autoSaveTimer=0; }
  audio.setScene(engine.state.phase, options.paused, document.hidden);
  audio.updateEffects(engine.state.effects, engine.state.time, speed, options.paused);
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => { renderer.resize(); positionTowerMenu(); updateBuildSites(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.state.phase === 'battle') { options.paused = true; if (dialog.open) pausedBeforeDialog = true; updateUI(); }
  audio.setScene(engine.state.phase, options.paused, document.hidden);
  if(document.hidden) saveCurrent();
  lastTime = performance.now();
});
window.addEventListener('pagehide',()=>saveCurrent());
window.addEventListener('beforeunload',()=>saveCurrent());
audio.onVoiceError=message=>{ $('#voice-caption').hidden=true; const preview=$('#dialog-body').querySelector('.voice-preview-text'); if(dialog.open&&preview) preview.textContent=message; toast(message,true); };
Object.defineProperty(window, 'verdantGame', { value: { snapshot: () => structuredClone(engine.state) }, configurable: true });
mountLevel(); updateUI();
if(resumed) { hideTip=true; if(engine.state.phase==='victory'||engine.state.phase==='defeat') showResult(); toast(`已恢复${engine.level.name} · 第 ${engine.state.wave} 波${options.paused?'，点击继续战斗':''}。`); }
saveCurrent(); requestAnimationFrame(frame);
