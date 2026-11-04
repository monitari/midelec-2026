import type { Chamber, ElectionData, Mode, Party, Race } from './types';
import { PALETTE, RATING_COLOR, partyLight, type Fill } from './colors';
import { RATING_LABEL, RATING_ORDER, ratingSide } from './ratings';
import { currentForecast, isDecided, outcome, raceTitle, verdict } from './classify';

export interface Segment {
  key: string;
  label: string;
  value: number;
  fill: Fill;
}

export interface Summary {
  /** 막대 왼쪽(민주)·오른쪽(공화) 큰 숫자 */
  left: { label: string; value: number; sub?: string };
  right: { label: string; value: number; sub?: string };
  center?: { label: string; value: number };
  segments: Segment[];
  total: number;
  majority?: { value: number; label: string };
  chips: { label: string; tone?: 'D' | 'R' | 'neutral' }[];
  /** 결과 기준 다수당 판정 (상원·하원) */
  control?: Control;
}

export type Control =
  | { decided: true; party: 'D' | 'R'; at: string; clincher: string; seats: number }
  | { decided: false; need: Record<'D' | 'R', number> };

const CHAMBER_TOTAL: Record<Chamber, number> = { senate: 100, house: 435, governor: 50 };

/** 이번 선거 대상이 아닌 자리(상원 비개선 의석, 선거 없는 주지사) */
export function holdovers(data: ElectionData, chamber: Chamber, races: Race[]): Record<Party, number> {
  const out: Record<Party, number> = { D: 0, R: 0, I: 0, O: 0 };
  if (chamber === 'senate') {
    for (const seats of Object.values(data.senateSeats)) for (const p of seats) out[p]++;
    for (const r of races) if (r.heldBy) out[r.heldBy]--;
  } else if (chamber === 'governor') {
    const up = new Set(races.map((r) => r.state));
    for (const [st, g] of Object.entries(data.governors)) if (!up.has(st)) out[g.party]++;
  }
  return out;
}

/** 선거 전 의석·자리 구성 */
function before(data: ElectionData, chamber: Chamber): Record<Party, number> {
  const out: Record<Party, number> = { D: 0, R: 0, I: 0, O: 0 };
  if (chamber === 'senate') for (const seats of Object.values(data.senateSeats)) for (const p of seats) out[p]++;
  else if (chamber === 'governor') for (const g of Object.values(data.governors)) out[g.party]++;
  else Object.assign(out, { D: data.houseBefore.D, R: data.houseBefore.R, I: data.houseBefore.I, O: data.houseBefore.O });
  return out;
}

/**
 * 다수당 판정: 승자 발표된 선거만 세어, 한 정당이 과반선을 넘긴 순간(그 선거의 발표 시각)을 찾는다.
 * 상원은 무소속의 연대(caucus)를 포함하고, 부통령이 공화당이라 공화는 50석으로 충분하다.
 */
export function controlOf(data: ElectionData, chamber: Chamber, races: Race[], hold: Record<Party, number>): Control | undefined {
  if (chamber === 'governor') return undefined;
  const need = chamber === 'senate' ? { D: 51, R: 50 } : { D: 218, R: 218 };
  const seats = { D: 0, R: 0 };
  if (chamber === 'senate') {
    seats.D = hold.D;
    seats.R = hold.R;
    for (const [st, c] of Object.entries(data.senateCaucus)) {
      if (data.senateSeats[st]?.includes('I') && !races.some((r) => r.state === st && r.heldBy === 'I')) seats[c]++;
    }
  }
  const called = races.filter((r) => isDecided(r) && r.result.calledAt)
    .sort((a, b) => Date.parse(a.result.calledAt!) - Date.parse(b.result.calledAt!));
  for (const r of called) {
    const w = r.result.winner;
    if (w !== 'D' && w !== 'R') continue;
    seats[w]++;
    if (seats[w] >= need[w]) return { decided: true, party: w, at: r.result.calledAt!, clincher: raceTitle(r), seats: need[w] };
  }
  return { decided: false, need: { D: Math.max(0, need.D - seats.D), R: Math.max(0, need.R - seats.R) } };
}

export function summarize(data: ElectionData, chamber: Chamber, races: Race[], mode: Mode, source: string): Summary {
  const hold = holdovers(data, chamber, races);
  const total = CHAMBER_TOTAL[chamber];
  const majority =
    chamber === 'senate' ? { value: 51, label: '과반 51' } : chamber === 'house' ? { value: 218, label: '과반 218' } : undefined;
  const holdLabel = chamber === 'senate' ? '비개선 의석' : '선거 없는 주';
  const caucusD = Object.values(data.senateCaucus).filter((c) => c === 'D').length;
  const indepNote = chamber === 'senate' && hold.I ? [{ label: `무소속 ${hold.I}${caucusD === hold.I ? ' (민주 협력)' : ''}`, tone: 'neutral' as const }] : [];

  if (mode === 'forecast') {
    const count: Record<string, number> = {};
    let unrated = 0;
    for (const r of races) {
      const f = currentForecast(r, source);
      if (f) count[f.rating] = (count[f.rating] ?? 0) + 1;
      else unrated++;
    }
    const dSide = hold.D + hold.I + RATING_ORDER.filter((x) => ratingSide(x) === 'D').reduce((s, x) => s + (count[x] ?? 0), 0);
    const rSide = hold.R + RATING_ORDER.filter((x) => ratingSide(x) === 'R').reduce((s, x) => s + (count[x] ?? 0), 0);
    return {
      left: { label: '민주 우세권', value: dSide, sub: '경합 우세 이상' },
      right: { label: '공화 우세권', value: rSide, sub: '경합 우세 이상' },
      center: { label: '경합', value: count.tossup ?? 0 },
      total,
      majority,
      segments: [
        { key: 'holdD', label: `민주 ${holdLabel}`, value: hold.D, fill: { color: partyLight('D') } },
        { key: 'holdI', label: `무소속 ${holdLabel}`, value: hold.I, fill: { color: partyLight('I') } },
        ...RATING_ORDER.map((x) => ({ key: x, label: RATING_LABEL[x], value: count[x] ?? 0, fill: { color: RATING_COLOR[x] } })),
        { key: 'unrated', label: '예측 없음', value: unrated, fill: { color: PALETTE.noForecast } },
        { key: 'holdR', label: `공화 ${holdLabel}`, value: hold.R, fill: { color: partyLight('R') } },
      ],
      chips: [...indepNote, ...(unrated ? [{ label: `예측 없음 ${unrated}` }] : [])],
    };
  }

  if (mode === 'baseline') {
    const up: Record<Party, number> = { D: 0, R: 0, I: 0, O: 0 };
    let vacant = 0;
    let open = 0;
    for (const r of races) {
      if (r.seatStatus === 'vacant') vacant++;
      else if (r.heldBy) up[r.heldBy]++;
      if (!r.incumbent?.running) open++;
    }
    // 하원은 경계가 바뀐 선거구가 있어 선거구별 보유 정당 대신 실제 의원 구성을 쓴다
    if (chamber === 'house') {
      const b = data.houseBefore;
      [up.D, up.R, up.I, up.O, vacant] = [b.D, b.R, b.I, b.O, b.vacant];
    }
    const d = hold.D + up.D;
    const rr = hold.R + up.R;
    const i = hold.I + up.I;
    return {
      left: { label: '민주당', value: d, sub: '선거 전 보유' },
      right: { label: '공화당', value: rr, sub: '선거 전 보유' },
      center: vacant ? { label: '공석', value: vacant } : undefined,
      total,
      majority,
      segments: [
        { key: 'holdD', label: `민주 ${holdLabel}`, value: hold.D, fill: { color: partyLight('D') } },
        { key: 'upD', label: '민주 · 이번 선거 대상', value: up.D, fill: { color: PALETTE.D } },
        { key: 'I', label: '무소속', value: i, fill: { color: PALETTE.I } },
        { key: 'vacant', label: '공석', value: vacant, fill: { color: PALETTE.muted } },
        { key: 'upR', label: '공화 · 이번 선거 대상', value: up.R, fill: { color: PALETTE.R } },
        { key: 'holdR', label: `공화 ${holdLabel}`, value: hold.R, fill: { color: partyLight('R') } },
      ],
      chips: [
        { label: `이번 선거 ${races.length}${chamber === 'governor' ? '개 주' : '석'}` },
        { label: `현직 불출마 ${open}` },
        ...(vacant ? [{ label: `공석 ${vacant}` }] : []),
      ],
    };
  }

  // 결과 / 예측 ↔ 결과
  const won: Record<Party, number> = { D: 0, R: 0, I: 0, O: 0 };
  let flips = 0;
  let undecided = 0;
  let unclassified = 0;
  const verdicts = { expected: 0, tossup: 0, upset: 0 };
  for (const r of races) {
    if (!isDecided(r)) {
      undecided++;
      continue;
    }
    const w = r.result.winner!;
    won[w]++;
    const o = outcome(r);
    if (o === 'flip') flips++;
    else if (o === 'unclassified') unclassified++;
    const v = verdict(r, source, data.meta.forecastFreezeAt);
    if (v === 'expected' || v === 'tossup' || v === 'upset') verdicts[v]++;
  }
  const d = hold.D + won.D;
  const rr = hold.R + won.R;
  const prev = before(data, chamber);
  // 상원 무소속 중 민주 협력 의석 (비개선 + 이번 당선 중 연대가 알려진 경우)
  const withCaucus = chamber === 'senate' && hold.I && caucusD === hold.I ? d + hold.I : null;
  const chips: Summary['chips'] =
    mode === 'compare'
      ? [
          { label: `예상대로 ${verdicts.expected}` },
          { label: `경합지 ${verdicts.tossup}` },
          { label: `예상 밖 ${verdicts.upset}`, tone: 'neutral' },
        ]
      : [{ label: `정당 교체 ${flips}` }];
  if (unclassified) chips.push({ label: `새 경계 ${unclassified}곳 미판정` });
  return {
    left: {
      label: '민주당',
      value: d,
      sub: `선거 전 ${prev.D}${withCaucus ? ` · 무소속 포함 ${withCaucus}` : ''}`,
    },
    right: { label: '공화당', value: rr, sub: `선거 전 ${prev.R}` },
    control: controlOf(data, chamber, races, hold),
    center: { label: '미결정', value: undecided },
    total,
    majority,
    segments: [
      { key: 'holdD', label: `민주 ${holdLabel}`, value: hold.D, fill: { color: partyLight('D') } },
      { key: 'wonD', label: '민주 · 이번 선거 확보', value: won.D, fill: { color: PALETTE.D } },
      { key: 'I', label: '무소속', value: hold.I + won.I + won.O, fill: { color: PALETTE.I } },
      { key: 'undecided', label: '미결정', value: undecided, fill: { color: PALETTE.pending } },
      { key: 'wonR', label: '공화 · 이번 선거 확보', value: won.R, fill: { color: PALETTE.R } },
      { key: 'holdR', label: `공화 ${holdLabel}`, value: hold.R, fill: { color: partyLight('R') } },
    ],
    chips,
  };
}
