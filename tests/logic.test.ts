import { describe, expect, it } from 'vitest';
import type { ElectionData, Party, Race, Rating } from '../src/lib/types';
import { frozenForecast, outcome, swingOf, verdict } from '../src/lib/classify';
import { controlOf, holdovers, summarize } from '../src/lib/tally';
import { headline } from '../src/lib/story';

const FREEZE = '2026-11-03T10:00:00Z';

function race(over: Partial<Race> & { winner?: Party; votes?: [Party, number][]; calledAt?: string; rating?: Rating; ratedAt?: string } = {}): Race {
  const { winner, votes = [['D', 55], ['R', 45]], calledAt, rating, ratedAt, ...rest } = over;
  return {
    id: 'H-XX-01', chamber: 'house', state: 'XX', district: 1, kind: 'regular', seatStatus: 'occupied', heldBy: 'R',
    forecasts: rating ? { a: { url: '', history: [{ rating, label: rating, publishedAt: ratedAt ?? '2026-11-02T05:00:00Z', ingestedAt: '' }] } } : {},
    result: {
      status: winner ? 'called' : 'counting',
      expectedPct: 95,
      candidates: votes.map(([party, v]) => ({ name: party, party, partyCode: party, votes: v })),
      winner,
      calledAt,
      updatedAt: '',
    },
    ...rest,
  };
}

describe('정당 교체 판정', () => {
  it('기존 보유와 승자가 다르면 교체, 같으면 유지', () => {
    expect(outcome(race({ winner: 'D' }))).toBe('flip');
    expect(outcome(race({ winner: 'R' }))).toBe('hold');
  });
  it('승자 발표 전에는 선두가 있어도 미결정', () => {
    expect(outcome(race())).toBe('pending');
  });
  it('새 경계 선거구는 이전 번호와 비교하지 않는다', () => {
    expect(outcome(race({ winner: 'D', boundaryChanged: true, heldBy: null }))).toBe('unclassified');
  });
});

describe('예측 ↔ 결과', () => {
  it('고정 시점 이후 평가는 비교에서 뺀다', () => {
    const r = race({ winner: 'D', rating: 'leanR', ratedAt: '2026-11-04T00:00:00Z' });
    expect(frozenForecast(r, 'a', FREEZE)).toBeUndefined();
    expect(verdict(r, 'a', FREEZE)).toBe('unrated');
  });
  it('우세 반대쪽이 이기면 예상 밖, 경합은 경합지', () => {
    expect(verdict(race({ winner: 'D', rating: 'leanR' }), 'a', FREEZE)).toBe('upset');
    expect(verdict(race({ winner: 'D', rating: 'likelyD' }), 'a', FREEZE)).toBe('expected');
    expect(verdict(race({ winner: 'R', rating: 'tossup' }), 'a', FREEZE)).toBe('tossup');
  });
});

describe('2024 대선 대비 변화', () => {
  it('(이번 득표율차) − (2024 대선 득표율차)', () => {
    expect(swingOf(race({ winner: 'D', pres2024: -5 }))).toBeCloseTo(15); // 55−45=+10, 대선 −5 → +15
  });
  it('무투표·한쪽 후보 없음·개표 부족은 비교하지 않는다', () => {
    expect(swingOf(race({ winner: 'D', pres2024: 3, votes: [['D', 100], ['O', 5]] }))).toBeNull();
    expect(swingOf(race({ pres2024: 3, result: { ...race().result, expectedPct: 40 } }))).toBeNull();
  });
});

describe('상원 다수당 판정', () => {
  // 비개선 의석 민주 48 + 무소속(민주 협력) 1, 공화 48. 선거 3곳.
  const senateSeats: Record<string, [Party, Party]> = {};
  for (let i = 0; i < 24; i++) senateSeats[`D${i}`] = ['D', 'D'];
  for (let i = 0; i < 24; i++) senateSeats[`R${i}`] = ['R', 'R'];
  senateSeats.VT = ['I', 'D'];
  senateSeats.AA = ['R', 'D'];
  const data = { senateSeats, senateCaucus: { VT: 'D' }, governors: {}, houseBefore: { D: 0, R: 0, I: 0, O: 0, vacant: 0 }, meta: { forecastFreezeAt: FREEZE } } as unknown as ElectionData;
  const up = (state: string, held: Party, winner?: Party, at?: string) =>
    race({ id: `S-${state}`, chamber: 'senate', state, heldBy: held, winner, calledAt: at });

  it('비개선 의석 = 전체 구성 − 이번 선거 대상', () => {
    const races = [up('AA', 'R'), up('VT', 'D'), up('D0', 'D')];
    expect(holdovers(data, 'senate', races)).toMatchObject({ D: 48, R: 48, I: 1 });
  });

  it('과반을 넘긴 선거의 발표 시각이 확정 시각', () => {
    const races = [
      up('AA', 'R', 'D', '2026-11-04T02:00:00Z'),
      up('VT', 'D', 'D', '2026-11-04T01:00:00Z'),
      up('D0', 'D', 'D', '2026-11-04T03:00:00Z'),
    ];
    const c = controlOf(data, 'senate', races, holdovers(data, 'senate', races));
    // 48 + 무소속 1 = 49 → 01시 50 → 02시 51(확정)
    expect(c).toMatchObject({ decided: true, party: 'D', at: '2026-11-04T02:00:00Z', seats: 51 });
  });

  it('아직 아무도 과반이 아니면 남은 의석 수', () => {
    const races = [up('AA', 'R'), up('VT', 'D'), up('D0', 'D')];
    expect(controlOf(data, 'senate', races, holdovers(data, 'senate', races))).toEqual({ decided: false, need: { D: 2, R: 2 } });
  });

  it('요약의 정당 교체 수', () => {
    const races = [up('AA', 'R', 'D', '2026-11-04T02:00:00Z'), up('VT', 'D', 'D', '2026-11-04T01:00:00Z'), up('D0', 'D')];
    expect(summarize(data, 'senate', races, 'result', 'a').chips[0].label).toBe('정당 교체 1');
  });
});

describe('한 줄 요약', () => {
  it('두 원을 같은 정당이 가지면 조사까지 맞춘다', () => {
    const data = {
      senateSeats: { A: ['R', 'R'] }, senateCaucus: {}, governors: {}, houseBefore: { D: 0, R: 0, I: 0, O: 0, vacant: 0 },
      meta: { forecastFreezeAt: FREEZE },
      races: [],
    } as unknown as ElectionData;
    // 상원: 비개선 공화 2석 → 50석에 못 미쳐 미확정, 하원: 선거 없음 → 미확정
    expect(headline(data).title).toBe('아직 다수당이 정해지지 않았어요');
  });
});
