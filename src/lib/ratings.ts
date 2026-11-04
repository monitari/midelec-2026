import type { Rating } from './types';

export const RATING_ORDER: Rating[] = ['safeD', 'likelyD', 'leanD', 'tossup', 'leanR', 'likelyR', 'safeR'];

export const RATING_LABEL: Record<Rating, string> = {
  safeD: '민주 확고',
  likelyD: '민주 우세',
  leanD: '민주 경합 우세',
  tossup: '경합',
  leanR: '공화 경합 우세',
  likelyR: '공화 우세',
  safeR: '공화 확고',
};

export const ratingSide = (r: Rating): 'D' | 'R' | null =>
  r === 'tossup' ? null : r.endsWith('D') ? 'D' : 'R';

/** 경합 우세 이상으로 접전 */
export const isCompetitive = (r: Rating | undefined) =>
  r === 'tossup' || r === 'leanD' || r === 'leanR';
