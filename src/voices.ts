import type { EnemyKind, TowerKind } from './types';
import { VOICE_DURATIONS } from './voice-durations';

export type VoiceId = 'hero' | 'soldier-1' | 'soldier-2' | 'soldier-3' | 'reinforcement'
  | 'tower-arrow' | 'tower-mage' | 'tower-barracks' | 'tower-cannon'
  | 'enemy-goblin' | 'enemy-wolf' | 'enemy-orc' | 'enemy-shaman' | 'enemy-golem' | 'enemy-chieftain'
  | 'enemy-bogling' | 'enemy-serpent' | 'enemy-icewolf' | 'enemy-frostguard' | 'enemy-imp' | 'enemy-juggernaut';

export type VoiceModel = 'mimo-v2.5-tts' | 'mimo-v2.5-tts-voicedesign' | 'mimo-v2.5-tts-voiceclone';
export interface VoiceProfile {
  readonly language: 'en'; readonly model: VoiceModel; readonly style: string;
  readonly preset?: 'Mia' | 'Chloe' | 'Milo' | 'Dean';
  readonly consistency: 'preset' | 'self-reference';
}
export interface UnitVoiceLine {
  /** Actual spoken English; the Chinese translation is only a subtitle. */
  readonly text: string; readonly subtitle?: string; readonly src: string; readonly model: VoiceModel; readonly duration?: number;
}
export interface UnitVoiceSet { readonly name: string; readonly profile: VoiceProfile; readonly lines: readonly UnitVoiceLine[] }

const human = (preset: VoiceProfile['preset'], style: string): VoiceProfile => ({
  language: 'en', model: 'mimo-v2.5-tts', preset, style, consistency: 'preset',
});
const creature = (style: string): VoiceProfile => ({
  language: 'en', model: 'mimo-v2.5-tts-voicedesign', style, consistency: 'self-reference',
});
const voice = (id: VoiceId, name: string, profile: VoiceProfile, ...lines: (readonly [string, string])[]): UnitVoiceSet => ({
  name, profile,
  lines: lines.map(([text, subtitle], index) => ({ text, subtitle, src: `/voices/mimo-en/${id}-${index + 1}.mp3`, duration: VOICE_DURATIONS[id]?.[index],
    model: index > 0 && profile.consistency === 'self-reference' ? 'mimo-v2.5-tts-voiceclone' : profile.model })),
});

/** Original English battle barks generated with MiMo, shipped as static MP3s with Chinese subtitles. */
export const UNIT_VOICES: Readonly<Record<VoiceId, UnitVoiceSet>> = {
  hero: voice('hero', '艾琳', human('Mia', 'A female elven forest guardian gives a powerful but controlled battle acknowledgment. Speak natural English, clear and confident with a warm luminous alto, crisp pacing and a decisive finish. No music or sound effects.'),
    ['My blade guards the ancient forest.', '我的月刃守护古老森林。'], ['The old trees fight beside us.', '古树与我们并肩而战。']),
  'soldier-1': voice('soldier-1', '林地卫兵', human('Milo', 'A young male woodland guard, bright earnest tenor and disciplined determination. Give a crisp English battlefield acknowledgment, energetic but clearly articulated. No laughter or sound effects.'),
    ['Shields up! Hold the line!', '举盾！守住阵线！'], ['Ready to guard our homeland!', '准备守护我们的家园！']),
  'soldier-2': voice('soldier-2', '森林精兵', human('Dean', 'A professional male forest swordsman in his thirties, steady low-mid voice, clipped military diction and confident resolve. Speak natural English at a brisk commanding pace. No extra sounds.'),
    ['Stay sharp. Orders are clear.', '保持警觉，军令已明。'], ['Not one step behind the shield!', '这面盾牌之后，寸步不退！']),
  'soldier-3': voice('soldier-3', '圣林禁卫', human('Dean', 'A veteran royal guard with a firm resonant baritone, disciplined authority and a battle-ready edge. Speak the short English line forcefully and clearly, with a deliberate heroic cadence. No music or sound effects.'),
    ['By steel and oath, we stand.', '以钢铁与誓言，坚守此地。'], ['The sacred grove will not fall.', '圣林永不陷落。']),
  reinforcement: voice('reinforcement', '援军', human('Milo', 'An upbeat young male scout arrives to help his comrades, warm clear mid-high voice and encouraging urgency. Speak a brisk, natural English battle acknowledgment with a smile in the tone, no laughter.'),
    ['Reinforcements here! Keep the line steady!', '援军抵达！稳住阵线！'], ['Point us toward the next fight.', '指引我们奔赴下一场战斗。']),
  'tower-arrow': voice('tower-arrow', '弓箭手', human('Milo', 'An experienced male ranger with a light precise tenor, quiet concentration and dry confidence. Speak clear English in short decisive phrases, restrained energy and sharp consonants.'),
    ['Wind is steady. Arrows are ready.', '风向稳定，箭矢已备。'], ['One clear shot. One fallen foe.', '一箭命中，一敌倒下。']),
  'tower-mage': voice('tower-mage', '奥术法师', human('Chloe', 'A poised young female arcane mage, cool silky voice, refined precision and understated dangerous confidence. Speak natural English, slightly deliberate and commanding, with clear consonants and no whispering.'),
    ['The stars answer my command.', '星辰回应我的号令。'], ['Step closer. Feel the arcane storm.', '再靠近些，感受奥术风暴。']),
  'tower-barracks': voice('tower-barracks', '驻兵队长', human('Dean', 'A middle-aged male barracks captain with a hearty gravel-edged baritone and protective camaraderie. Deliver an assertive English command to his squad, bold and brisk rather than angry.'),
    ['Stand together! Guard this road!', '并肩列阵！守卫这条道路！'], ['Brothers, rally beneath our banner!', '兄弟们，在军旗下集结！']),
  'tower-cannon': voice('tower-cannon', '炮塔工匠', human('Dean', 'A cheerful older male artillery engineer with a rugged chesty baritone, lively practical confidence and a slightly raspy grin. Speak the English acknowledgment with punchy excitement and clear words, no laughter or explosions.'),
    ['Powder loaded. Let the earth tremble!', '火药装填，让大地震颤！'], ['Light the fuse! Brace for thunder!', '点燃引线！迎接雷鸣！']),
  'enemy-goblin': voice('enemy-goblin', '哥布林', creature('An adult male fantasy goblin with a distinctly high, scratchy nasal voice, pinched forward resonance, mischievous greed and sly confidence. Deliver a short English battle taunt with playful bite and very clear words, at a brisk but intelligible pace. No laughter, music or sound effects.'),
    ['Your shiny gold is mine!', '你的闪亮金币归我了！'], ["Too slow! You'll never catch me!", '太慢了！你永远抓不住我！']),
  'enemy-wolf': voice('enemy-wolf', '疾风狼', creature('An adult male wolf-warrior with a low husky predatory voice, rough breath-edged throat resonance and alert menace. Speak a short English taunt with clear words and measured confidence, not animal noises.'),
    ['I can smell your fear.', '我嗅得到你的恐惧。'], ['The pack is closing in.', '狼群正在逼近。']),
  'enemy-orc': voice('enemy-orc', '兽人战士', creature('A large middle-aged male orc fighter with a coarse booming bass-baritone, broad chest resonance, thick gravel and impatient battle hunger. Deliver a punchy English threat forcefully but with every word intelligible, no roars or extra sounds.'),
    ['My axe hungers for battle!', '我的战斧渴望战斗！'], ['Move aside, or meet my blade!', '让开，否则尝尝我的刀锋！']),
  'enemy-shaman': voice('enemy-shaman', '荒野萨满', creature('An elderly female wilderness shaman with a low smoky husky alto, weathered grain, deliberate ritual cadence and ominous calm. Speak clear natural English with solemn intensity, keeping the short line concise rather than chanting.'),
    ['Ancient spirits, lend me your power.', '远古之灵，赐予我力量。'], ['The wilds have chosen your fate.', '荒野已决定你的命运。']),
  'enemy-golem': voice('enemy-golem', '岩石巨像', creature('A colossal ancient stone guardian with an extremely deep masculine bass, weighty rough chest resonance, thick gravel and slow unwavering authority. Speak the short English line clearly with firm separated words, no rumbling sound effects or lengthy pauses.'),
    ['Stone does not bend or break.', '岩石不会屈服，也不会碎裂。'], ['The earth obeys my heavy hand.', '大地听从我的巨掌。']),
  'enemy-chieftain': voice('enemy-chieftain', '兽人酋长', creature('A middle-aged male orc war chief with a broad commanding rough baritone, proud swagger, resonant authority and a forceful battle cadence. Speak the short English taunt boldly and clearly, fierce but controlled rather than a roar.'),
    ['Our war banner will never fall!', '我们的战旗永不倒下！'], ['Your gates will bow before me!', '你们的城门将在我面前屈服！']),
  'enemy-bogling': voice('enemy-bogling', '沼泥怪', creature('A male swamp creature with a low throaty gurgly voice, soft rounded consonants, gravelly thick throat resonance and sluggish sly menace. Speak English words distinctly at a measured pace, preserving intelligibility and avoiding nonverbal creature noises.'),
    ['The swamp will swallow you whole.', '沼泽会将你整个吞没。'], ['Every muddy step belongs to me.', '每一步淤泥都属于我。']),
  'enemy-serpent': voice('enemy-serpent', '毒沼蛇', creature('An adult female serpent sorceress with a low silky contralto, close soft sibilants, smooth cold confidence and poisonous amusement. Speak the short English threat clearly, quietly menacing but fully voiced rather than whispering, no added hissing.'),
    ['Taste the promise of my venom.', '尝尝毒液为你许下的承诺。'], ['Come closer. My fangs are ready.', '再近一些，我的毒牙已备。']),
  'enemy-icewolf': voice('enemy-icewolf', '霜狼', creature('An adult male frost wolf-warrior with a lean dark mid-low voice, dry cold breath-edged texture, crisp articulation and steel-calm predatory resolve. Speak a concise English line at a measured pace, sharper and cleaner than a growling beast.'),
    ['Winter sharpens every fang I bear.', '寒冬磨利我的每一颗獠牙。'], ['No prey escapes the frozen hunt.', '没有猎物能逃出冰封的追猎。']),
  'enemy-frostguard': voice('enemy-frostguard', '霜铠卫', creature('A mature male armored winter sentinel with a grave restrained baritone, cool clean chest resonance, formal clipped diction and unyielding discipline. Speak the short English acknowledgment with deliberate military precision, no shouting.'),
    ['Frostbound armor. An oath unbroken.', '霜封铠甲，誓言不灭。'], ['The winter wall marches ever forward.', '凛冬的铁壁永远向前。']),
  'enemy-imp': voice('enemy-imp', '熔火小鬼', creature('A young adult female fire imp with a distinctly high bright reedy voice, wiry sharp resonance, gleeful mischief and explosive excitement. Speak a quick clear English taunt with playful bite, no laughter, cackling or fire sound effects.'),
    ['Burn it all! Watch the sparks!', '烧光一切！看这些火花！'], ['One more spark, then everything burns!', '再来一簇火花，一切就会燃烧！']),
  'enemy-juggernaut': voice('enemy-juggernaut', '熔铠领主', creature('A colossal middle-aged male molten warlord with a very deep dark bass, heavy chest resonance, coarse iron-edged throat grain and absolute imperial authority. Speak a concise English threat slowly but clearly, dominant and ominous without roaring or sound effects.'),
    ['Molten roads open beneath my hammer.', '熔火道路在我的巨锤下展开。'], ['Kneel before the throne of fire!', '跪在烈焰王座之前！']),
};

export type UnitVoiceTarget = { type: 'hero' | 'soldier' | 'reinforcement'; level?: number }
  | { type: 'enemy'; kind: EnemyKind }
  | { type: 'tower'; kind: TowerKind; level?: number };

export function voiceForUnit(unit: UnitVoiceTarget): VoiceId {
  if (unit.type === 'enemy') return `enemy-${unit.kind}` as VoiceId;
  if (unit.type === 'tower') return `tower-${unit.kind}` as VoiceId;
  if (unit.type === 'soldier') {
    const level = Number.isFinite(unit.level) ? Math.floor(unit.level!) : 1;
    return `soldier-${Math.max(1, Math.min(3, level))}` as VoiceId;
  }
  return unit.type;
}
