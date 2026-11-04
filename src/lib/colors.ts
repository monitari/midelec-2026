import type { Party, Rating } from './types';

export const PALETTE = {
  D: '#3182f6',
  Dstrong: '#1b64da',
  Dmid: '#90c2ff',
  Dlight: 'var(--p-dlight)',
  R: '#f04452',
  Rstrong: '#d22030',
  Rmid: '#ff9ea6',
  Rlight: 'var(--p-rlight)',
  I: '#8b6cef',
  Ilight: 'var(--p-ilight)',
  O: '#8b95a1',
  toss: '#ffc342',
  // 아래는 테마(밝게/어둡게)에 따라 바뀌는 지도 중립색
  pending: 'var(--m-pending)',
  none: 'var(--m-none)',
  noneMark: 'var(--m-none-mark)',
  noForecast: 'var(--m-nofc)',
  noForecastMark: 'var(--m-nofc-mark)',
  neutral: 'var(--m-neutral)',
  muted: 'var(--m-muted)',
  mutedMark: 'var(--m-muted-mark)',
  ink: '#191f28',
  ink2: '#4e5968',
};

export const RATING_COLOR: Record<Rating, string> = {
  safeD: '#1b64da',
  likelyD: '#5b9df9',
  leanD: '#a9cdfc',
  tossup: '#ffc342',
  leanR: '#ffb2b8',
  likelyR: '#f6707c',
  safeR: '#d22030',
};

export const partyColor = (p: Party) => PALETTE[p];
export const partyLight = (p: Party) =>
  p === 'D' ? PALETTE.Dlight : p === 'R' ? PALETTE.Rlight : p === 'I' ? PALETTE.Ilight : PALETTE.neutral;

export const PARTY_NAME: Record<Party, string> = { D: '민주당', R: '공화당', I: '무소속', O: '기타' };
export const PARTY_SHORT: Record<Party, string> = { D: '민주', R: '공화', I: '무소속', O: '기타' };

/** 지도·범례 공용 채움. pattern 은 color 위에 흰색 무늬를 겹친다 */
export interface Fill {
  color: string;
  pattern?: 'hatch' | 'dots';
  /** 무늬 색 (기본: 흰색 반투명) */
  mark?: string;
  /** 지도에서 영역 둘레에 그리는 얇은 선 */
  edge?: string;
}

const idPart = (c: string) => c.replace(/[^a-z0-9]/gi, '');
export const fillKey = (f: Fill) =>
  f.pattern ? `p-${f.pattern}-${idPart(f.color)}-${idPart(f.mark ?? 'fff')}` : '';

export const fillRef = (f: Fill) => (f.pattern ? `url(#${fillKey(f)})` : f.color);
