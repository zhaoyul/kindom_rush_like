import type { ChallengeMode } from './types';

export interface ChallengeDefinition {
  id: ChallengeMode;
  name: string;
  description: string;
  icon: string;
}

export const CHALLENGES: Record<ChallengeMode, ChallengeDefinition> = {
  standard: { id: 'standard', name: '标准战役', description: '按关卡规则守住防线，获得战役星级并解锁后续关卡。', icon: 'flag' },
  'four-towers': { id: 'four-towers', name: '四塔防线', description: '同时最多拥有四座防御塔；可以出售后重建。英雄、全部技能、塔升级与流派照常可用。', icon: 'formation' },
  'no-meteor': { id: 'no-meteor', name: '禁咒试炼', description: '禁用陨星坠落；援军与全部英雄技能照常可用。依靠塔位、拦截与英雄守住关卡。', icon: 'meteor' },
};

export function isChallengeMode(value: unknown): value is ChallengeMode {
  return typeof value === 'string' && Object.hasOwn(CHALLENGES, value);
}

export function isRuleChallenge(value: unknown): value is Exclude<ChallengeMode, 'standard'> {
  return isChallengeMode(value) && value !== 'standard';
}

export function getChallenge(id: string): ChallengeDefinition | undefined {
  return isChallengeMode(id) ? CHALLENGES[id] : undefined;
}

export function describeChallenge(mode: ChallengeMode): string {
  return getChallenge(mode)?.description ?? '';
}
