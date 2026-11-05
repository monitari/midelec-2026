import type { Chamber, ForecastEntry, Mode, Party, Race } from './types';
import { PALETTE, PARTY_SHORT, RATING_COLOR, partyColor, partyLight, type Fill } from './colors';
import { RATING_LABEL, RATING_ORDER, isCompetitive, ratingSide } from './ratings';
import { districtCode, stateName } from './states';

// ── 결과 해석 ─────────────────────────────────────────────

export const isDecided = (r: Race) => r.result.status === 'called' || r.result.status === 'certified';
export const leaderParty = (r: Race): Party | undefined =>
  r.result.candidates[0]?.votes ? r.result.candidates[0].party : undefined;

export function voteShares(r: Race) {
  const total = r.result.candidates.reduce((s, c) => s + c.votes, 0);
  return r.result.candidates.map((c) => ({ ...c, pct: total ? (c.votes / total) * 100 : 0 }));
}

/** 1위-2위 득표율 격차(%p). 무투표 당선은 100 */
export function marginPts(r: Race) {
  if (r.result.uncontested) return 100;
  const [a, b] = voteShares(r);
  return a && b ? a.pct - b.pct : 0;
}

/**
 * 2024 대선 대비 이동 폭(%p, + = 민주 쪽): (이번 민주 − 공화 득표율차) − (같은 경계의 2024 대선 득표율차).
 * 무투표, 양당 후보가 다 없는 선거, 개표가 덜 된 선거(승자 미발표이면서 90% 미만)는 비교하지 않는다.
 */
export function swingOf(r: Race): number | null {
  if (r.pres2024 == null || r.result.uncontested) return null;
  if (!isDecided(r) && (r.result.expectedPct ?? 0) < 90) return null;
  const shares = voteShares(r);
  const d = shares.find((c) => c.party === 'D');
  const rep = shares.find((c) => c.party === 'R');
  if (!d?.votes || !rep?.votes) return null;
  return d.pct - rep.pct - r.pres2024;
}

/** 정당 교체 판정 기준이 되는 기존 보유 정당. 경계가 바뀐 선거구는 null (같은 번호의 이전 선거구와 비교하지 않는다) */
export const priorParty = (r: Race): Party | null => (r.boundaryChanged ? null : r.heldBy);

export type Outcome = 'hold' | 'flip' | 'unclassified' | 'pending';

/** 새 경계 선거구에서 추정 보유 정당과 다른 정당이 이긴 경우 (공식 정당 교체와 따로 센다) */
export const estimatedFlip = (r: Race) =>
  !!(r.boundaryChanged && isDecided(r) && r.notional && r.result.winner !== r.notional.party);

export const NOTIONAL_BASIS = { incumbent: '출마한 현직 정당 기준', pres2024: '새 경계 2024 대선 기준' } as const;
export function outcome(r: Race): Outcome {
  if (!isDecided(r)) return 'pending';
  const prior = priorParty(r);
  if (!prior) return 'unclassified';
  return prior === r.result.winner ? 'hold' : 'flip';
}

export function outcomeText(r: Race): string {
  const o = outcome(r);
  const w = r.result.winner!;
  if (o === 'hold') return `${PARTY_SHORT[w]} 유지`;
  if (o === 'flip') return `${PARTY_SHORT[w]} 획득 · ${PARTY_SHORT[priorParty(r)!]}→${PARTY_SHORT[w]}`;
  if (o === 'unclassified') {
    return estimatedFlip(r)
      ? `${PARTY_SHORT[w]} 승리 · 추정 교체 ${PARTY_SHORT[r.notional!.party]}→${PARTY_SHORT[w]}`
      : `${PARTY_SHORT[w]} 승리 · 교체 판정 보류`;
  }
  if (r.result.status === 'runoff') return '결선 투표 예정';
  const lead = leaderParty(r);
  const pct = r.result.expectedPct;
  return lead ? `${PARTY_SHORT[lead]} 선두${pct == null ? '' : ` · 개표 ${pct.toFixed(0)}%`}` : '개표 전';
}

export const STATUS_LABEL = {
  pending: '개표 전',
  counting: '개표 중',
  runoff: '결선 예정',
  called: '승자 발표',
  certified: '공식 인증',
} as const;

// ── 예측 ─────────────────────────────────────────────

export const currentForecast = (r: Race, src: string): ForecastEntry | undefined =>
  r.forecasts[src]?.history.at(-1);

export const previousForecast = (r: Race, src: string): ForecastEntry | undefined =>
  r.forecasts[src]?.history.at(-2);

/** 고정 시점 이전에 발표된 마지막 평가 — 예측 ↔ 결과 비교는 이것만 쓴다 */
export function frozenForecast(r: Race, src: string, freezeAt: string): ForecastEntry | undefined {
  const h = r.forecasts[src]?.history ?? [];
  const t = Date.parse(freezeAt);
  for (let i = h.length - 1; i >= 0; i--) if (Date.parse(h[i].publishedAt) < t) return h[i];
  return undefined;
}

export type Verdict = 'expected' | 'tossup' | 'upset' | 'unrated' | 'pending';
export function verdict(r: Race, src: string, freezeAt: string): Verdict {
  if (!isDecided(r)) return 'pending';
  const f = frozenForecast(r, src, freezeAt);
  if (!f) return 'unrated';
  const side = ratingSide(f.rating);
  if (!side) return 'tossup';
  const w = r.result.winner === 'D' ? 'D' : 'R';
  return side === w ? 'expected' : 'upset';
}

// ── 지도 분류 ─────────────────────────────────────────────

export type Basis =
  | 'party' | 'margin' | 'swing'
  | 'rating'
  | 'held' | 'incumbency'
  | 'delta';

export const BASES: Record<Mode, { id: Basis; label: string }[]> = {
  result: [
    { id: 'party', label: '정당 · 유지/교체' },
    { id: 'margin', label: '득표율 격차' },
    { id: 'swing', label: '2024 대선 대비 변화' },
  ],
  forecast: [{ id: 'rating', label: '평가 등급' }],
  baseline: [
    { id: 'held', label: '기존 보유 정당' },
    { id: 'incumbency', label: '현직 출마 · 공석' },
  ],
  compare: [{ id: 'delta', label: '선거 전 예측 대비 결과' }],
};

export interface Category {
  key: string;
  label: string;
  fill: Fill;
}

export interface ClassifyCtx {
  basis: Basis;
  source: string;
  freezeAt: string;
  includeLeader: boolean;
}

const NONE: Category = { key: 'none', label: '선거 없음', fill: { color: PALETTE.none, pattern: 'dots', mark: PALETTE.noneMark } };
const PENDING: Category = { key: 'pending', label: '결과 미발표', fill: { color: PALETTE.pending } };
const NO_FORECAST: Category = {
  key: 'noForecast', label: '예측 없음', fill: { color: PALETTE.noForecast, pattern: 'hatch', mark: PALETTE.noForecastMark },
};

const RUNOFF: Category = { key: 'runoff', label: '결선 투표 예정', fill: { color: PALETTE.pending, pattern: 'hatch', mark: PALETTE.mutedMark } };
const NEW_BOUNDARY: Category = { key: 'heldNew', label: '새 경계 · 기존 보유 정당 없음', fill: { color: PALETTE.muted, pattern: 'dots', mark: PALETTE.mutedMark } };

const P = (p: Party) => (p === 'O' ? 'I' : p);

/** 범례 순서. 지도에 실제로 나타난 항목만 범례에 표시한다 */
export function categoryOrder(basis: Basis): string[] {
  switch (basis) {
    case 'party':
      return ['holdD', 'flipD', 'estD', 'unclD', 'leadD', 'holdI', 'flipI', 'estI', 'unclI', 'leadI', 'pending', 'runoff', 'leadR', 'unclR', 'estR', 'flipR', 'holdR', 'none'];
    case 'margin':
      return ['mD3', 'mD2', 'mD1', 'mD0', 'mI', 'pending', 'runoff', 'mR0', 'mR1', 'mR2', 'mR3', 'none'];
    case 'swing':
      return ['sD3', 'sD2', 'sD1', 's0', 'sR1', 'sR2', 'sR3', 'noSwing', 'pending', 'none'];
    case 'rating':
      return [...RATING_ORDER, 'noForecast', 'none'];
    case 'held':
      return ['heldD', 'heldI', 'heldNew', 'heldR', 'none'];
    case 'incumbency':
      return ['runD', 'openD', 'runI', 'newOpen', 'vacant', 'runR', 'openR', 'none'];
    case 'delta':
      return ['expD', 'tossD', 'upsetD', 'unratedD', 'pending', 'unratedR', 'upsetR', 'tossR', 'expR', 'none'];
  }
}

export function classify(r: Race | undefined, ctx: ClassifyCtx): Category {
  if (!r) return NONE;
  switch (ctx.basis) {
    case 'party': {
      const o = outcome(r);
      if (o === 'pending') {
        if (r.result.status === 'runoff') return RUNOFF;
        const lead = leaderParty(r);
        if (ctx.includeLeader && lead && r.result.status === 'counting') {
          return { key: `lead${P(lead)}`, label: `${PARTY_SHORT[lead]} 현재 선두 (미발표)`, fill: { color: partyLight(lead) } };
        }
        return PENDING;
      }
      const w = r.result.winner!;
      if (o === 'hold') return { key: `hold${P(w)}`, label: `${PARTY_SHORT[w]} 유지`, fill: { color: partyColor(w) } };
      if (o === 'flip') return { key: `flip${P(w)}`, label: `${PARTY_SHORT[w]} 획득 (정당 교체)`, fill: { color: partyColor(w), pattern: 'hatch' } };
      if (estimatedFlip(r)) {
        return { key: `est${P(w)}`, label: `${PARTY_SHORT[w]} 승리 · 새 경계 추정 교체`, fill: { color: partyColor(w), pattern: 'hatch', edge: PALETTE.ink } };
      }
      return { key: `uncl${P(w)}`, label: `${PARTY_SHORT[w]} 승리 · 새 경계 (교체 판정 제외)`, fill: { color: partyColor(w), edge: PALETTE.ink } };
    }
    case 'margin': {
      const decided = isDecided(r);
      const p = decided ? r.result.winner : ctx.includeLeader && r.result.status === 'counting' ? leaderParty(r) : undefined;
      if (!p) return r.result.status === 'runoff' ? RUNOFF : PENDING;
      if (p !== 'D' && p !== 'R') return { key: 'mI', label: '무소속·기타 승리', fill: { color: PALETTE.I } };
      const m = marginPts(r);
      const bin = m >= 20 ? 3 : m >= 10 ? 2 : m >= 5 ? 1 : 0;
      const ranges = ['5%p 미만', '5–10%p', '10–20%p', '20%p 이상'];
      const shades = p === 'D'
        ? [PALETTE.Dlight, PALETTE.Dmid, PALETTE.D, PALETTE.Dstrong]
        : [PALETTE.Rlight, PALETTE.Rmid, PALETTE.R, PALETTE.Rstrong];
      return { key: `m${p}${bin}`, label: `${PARTY_SHORT[p]} ${ranges[bin]}`, fill: { color: shades[bin] } };
    }
    case 'swing': {
      const s = swingOf(r);
      if (s == null) {
        if (!isDecided(r) && (r.result.expectedPct ?? 0) < 90 && !r.result.uncontested) return PENDING;
        return { key: 'noSwing', label: '비교 불가 (무투표·양당 후보 없음)', fill: { color: PALETTE.noForecast, pattern: 'hatch', mark: PALETTE.noForecastMark } };
      }
      const a = Math.abs(s);
      if (a < 2) return { key: 's0', label: '변화 2%p 미만', fill: { color: PALETTE.muted } };
      const p = s > 0 ? 'D' : 'R';
      const bin = a >= 10 ? 3 : a >= 5 ? 2 : 1;
      const ranges = ['', '2–5%p', '5–10%p', '10%p 이상'];
      const shades = p === 'D' ? ['', PALETTE.Dmid, PALETTE.D, PALETTE.Dstrong] : ['', PALETTE.Rmid, PALETTE.R, PALETTE.Rstrong];
      return { key: `s${p}${bin}`, label: `${PARTY_SHORT[p]} 쪽 ${ranges[bin]}`, fill: { color: shades[bin] } };
    }
    case 'rating': {
      const f = currentForecast(r, ctx.source);
      if (!f) return NO_FORECAST;
      return { key: f.rating, label: RATING_LABEL[f.rating], fill: { color: RATING_COLOR[f.rating] } };
    }
    case 'held': {
      if (!r.heldBy) return NEW_BOUNDARY;
      const p = P(r.heldBy);
      return { key: `held${p}`, label: `${PARTY_SHORT[p]} 보유`, fill: { color: partyColor(p) } };
    }
    case 'incumbency': {
      if (r.seatStatus === 'vacant') return { key: 'vacant', label: '실제 공석', fill: { color: PALETTE.muted, pattern: 'hatch', mark: PALETTE.mutedMark } };
      if (r.incumbent?.running) {
        const p = P(r.incumbent.party);
        return { key: `run${p}`, label: `${PARTY_SHORT[p]} 현직 출마`, fill: { color: partyColor(p) } };
      }
      const held = r.incumbent?.party ?? r.heldBy;
      if (!held) return { key: 'newOpen', label: '새 경계 · 출마한 현직 없음', fill: { color: PALETTE.muted, pattern: 'dots', mark: PALETTE.mutedMark } };
      const p = P(held);
      return { key: `open${p}`, label: `${PARTY_SHORT[p]} 현직 불출마 (열린 선거)`, fill: { color: partyLight(p), pattern: 'hatch', mark: partyColor(p) } };
    }
    case 'delta': {
      const v = verdict(r, ctx.source, ctx.freezeAt);
      if (v === 'pending') return PENDING;
      const w = r.result.winner === 'D' ? 'D' : 'R';
      const name = PARTY_SHORT[w];
      if (v === 'expected') return { key: `exp${w}`, label: `${name} · 예상대로`, fill: { color: partyLight(w) } };
      if (v === 'tossup') return { key: `toss${w}`, label: `${name} · 경합지 승리`, fill: { color: partyColor(w) } };
      if (v === 'upset') return { key: `upset${w}`, label: `${name} · 예상 밖 승리`, fill: { color: w === 'D' ? PALETTE.Dstrong : PALETTE.Rstrong, pattern: 'dots', mark: '#ffffff' } };
      return { key: `unrated${w}`, label: `${name} 승리 · 선거 전 예측 없음`, fill: { color: partyColor(w), pattern: 'hatch', mark: PALETTE.neutral } };
    }
  }
}

// ── 필터 ─────────────────────────────────────────────

export type FilterKey = 'competitive' | 'flip' | 'undecided' | 'open' | 'boundary';
export const FILTERS: { id: FilterKey; label: string; houseOnly?: boolean }[] = [
  { id: 'competitive', label: '경합지' },
  { id: 'flip', label: '정당 교체' },
  { id: 'undecided', label: '미결정' },
  { id: 'open', label: '현직 불출마·공석' },
  { id: 'boundary', label: '경계 변경', houseOnly: true },
];

export function matchesFilters(r: Race, filters: Set<FilterKey>, source: string, freezeAt: string) {
  for (const f of filters) {
    if (f === 'competitive' && !isCompetitive(frozenForecast(r, source, freezeAt)?.rating)) return false;
    if (f === 'flip' && outcome(r) !== 'flip') return false;
    if (f === 'undecided' && isDecided(r)) return false;
    if (f === 'open' && r.seatStatus !== 'vacant' && r.incumbent?.running) return false;
    if (f === 'boundary' && !r.boundaryChanged) return false;
  }
  return true;
}

// ── 이름 ─────────────────────────────────────────────

export function raceTitle(r: Race): string {
  const s = stateName(r.state);
  if (r.chamber === 'senate') return `${s} 상원${r.kind === 'special' ? ' 특별선거' : ''}`;
  if (r.chamber === 'governor') return `${s} 주지사`;
  return r.district === 0 ? `${s} 전체 선거구` : `${s} ${r.district}선거구`;
}

export const raceCode = (r: Race) =>
  r.chamber === 'house' ? districtCode(r.state, r.district!) : r.state;

export const CHAMBER_LABEL: Record<Chamber, string> = { senate: '상원', house: '하원', governor: '주지사' };

