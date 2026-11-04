// 화면 위쪽의 한 줄 요약과 개표 흐름(승자 발표 누적) 계산
import type { Chamber, ElectionData, Race } from './types';
import { CHAMBER_LABEL, isDecided, outcome } from './classify';
import { PARTY_NAME } from './colors';
import { controlOf, holdovers, type Control } from './tally';

export const CHAMBERS: Chamber[] = ['senate', 'house', 'governor'];

export const racesOf = (data: ElectionData, c: Chamber) => data.races.filter((r) => r.chamber === c);

/** 한국어 조사: 받침 있으면 '이', 없으면 '가' */
const iGa = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
};

export function headline(data: ElectionData): { title: string; sub: string } {
  const control = Object.fromEntries(
    (['senate', 'house'] as const).map((c) => {
      const races = racesOf(data, c);
      return [c, controlOf(data, c, races, holdovers(data, c, races))];
    }),
  ) as Record<'senate' | 'house', Control | undefined>;
  const won = (c: 'senate' | 'house') => (control[c]?.decided ? control[c].party : null);
  const s = won('senate');
  const h = won('house');

  let title: string;
  if (s && h && s === h) title = `${PARTY_NAME[s]}${iGa(PARTY_NAME[s])} 상원과 하원을 모두 가져갔어요`;
  else if (s && h) title = `상원은 ${PARTY_NAME[s]}, 하원은 ${PARTY_NAME[h]}${iGa(PARTY_NAME[h])} 가져갔어요`;
  else if (s || h) {
    const [c, p] = s ? ['상원', s] : ['하원', h!];
    title = `${PARTY_NAME[p]}${iGa(PARTY_NAME[p])} ${c} 다수당을 확정했어요`;
  } else title = '아직 다수당이 정해지지 않았어요';

  const flips = CHAMBERS.map((c) => {
    const n = racesOf(data, c).filter((r) => outcome(r) === 'flip').length;
    return `${CHAMBER_LABEL[c]} ${n}`;
  });
  return { title, sub: `정당이 바뀐 자리 · ${flips.join(' · ')}` };
}

// ── 개표 흐름 ─────────────────────────────────────────────

export interface TimelinePoint { t: number; d: number; r: number }

export interface Timeline {
  points: TimelinePoint[];
  start: number;
  end: number;
  need?: { D: number; R: number };
  control?: Control;
  /** 상원: 민주 쪽 선에 민주 협력 무소속을 포함했는지 */
  caucusIncluded: number;
}

/**
 * 승자 발표 시각 순으로 확보 의석을 누적한다. 상원·주지사는 이번 선거 대상이 아닌 자리에서 출발하고,
 * 상원은 민주 협력 무소속을 민주 쪽에 더해 다수당 판정과 같은 기준으로 그린다.
 */
export function timeline(data: ElectionData, chamber: Chamber): Timeline {
  const races = racesOf(data, chamber);
  const hold = holdovers(data, chamber, races);
  let caucus = 0;
  if (chamber === 'senate') {
    for (const [st, c] of Object.entries(data.senateCaucus)) {
      if (c === 'D' && data.senateSeats[st]?.includes('I') && !races.some((r) => r.state === st && r.heldBy === 'I')) caucus++;
    }
  }
  let d = hold.D + caucus;
  let r = hold.R;
  const called = races
    .filter((x): x is Race & { result: { calledAt: string } } => isDecided(x) && !!x.result.calledAt)
    .sort((a, b) => Date.parse(a.result.calledAt) - Date.parse(b.result.calledAt));
  // 첫 투표소 마감(미 동부 오후 6시) 무렵부터
  const start = Math.min(Date.parse(`${data.meta.electionDay}T23:00:00Z`), ...called.map((x) => Date.parse(x.result.calledAt)));
  const points: TimelinePoint[] = [{ t: start, d, r }];
  for (const x of called) {
    if (x.result.winner === 'D') d++;
    else if (x.result.winner === 'R') r++;
    else continue;
    points.push({ t: Date.parse(x.result.calledAt), d, r });
  }
  const end = Math.max(Date.parse(data.meta.generatedAt), points.at(-1)!.t);
  points.push({ t: end, d, r });
  return {
    points,
    start,
    end,
    need: chamber === 'senate' ? { D: 51, R: 50 } : chamber === 'house' ? { D: 218, R: 218 } : undefined,
    control: controlOf(data, chamber, races, hold),
    caucusIncluded: caucus,
  };
}
