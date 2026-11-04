import { describe, expect, it } from 'vitest';
// @ts-expect-error 스크립트용 JS 모듈 (타입 선언 없음)
import { countyResults, matchMember, parsePredictions, parseResult } from '../scripts/lib/parse.mjs';

const WIKI = `
{| class="wikitable"
|-
! State !! PVI !! Senator !! Last election
! [[Cook Political Report|Cook]]<br />{{small|Nov 2,<br />2026}}<ref>{{cite web |url=https://cook.example/senate |title=x}}</ref>
! [[Inside Elections|IE]]<br />{{Small|Oct. 29,<br />2026}}
|-
! [[2026 United States Senate election in Georgia|Georgia]]
| {{Shading PVI|R|1}}
| {{sortname|Jon|Ossoff}}
| 50.6% D
<!--Cook--> | {{USRaceRating|Likely|D}}
<!--IE-->   | {{USRaceRating|Tilt|D}}
|-
! [[2026 United States Senate special election in Ohio|Ohio]] (special)
| x || y || z
| {{USRaceRating|Tossup}}
|
|-
! [[2026 United States Senate election in Maine|Maine]]
| a || b || c
| {{USRaceRating|Lean|I}}
| {{USRaceRating|Solid|R|flip}}
|}
`;

describe('parsePredictions', () => {
  const { sources, ratings } = parsePredictions(WIKI, 'senate');

  it('읽은 출처 열과 날짜·주소', () => {
    expect(sources).toEqual(['Cook', 'IE']);
    expect(ratings.GA.cook).toEqual({ rating: 'likelyD', label: 'Likely D', date: '2026-11-02', url: 'https://cook.example/senate' });
  });

  it('Tilt 는 사이트 표시로는 경합 우세, 원문 표기는 보존', () => {
    expect(ratings.GA.ie).toMatchObject({ rating: 'leanD', label: 'Tilt D', date: '2026-10-29' });
  });

  it('특별선거는 별도 키, 빈 칸은 예측 없음', () => {
    expect(ratings['OH-special'].cook).toMatchObject({ rating: 'tossup', label: 'Toss-up' });
    expect(ratings['OH-special'].ie).toBeUndefined();
  });

  it('민주·공화가 아닌 쪽 평가는 버리고, flip 표시는 무시', () => {
    expect(ratings.ME.cook).toBeUndefined();
    expect(ratings.ME.ie).toMatchObject({ rating: 'safeR', label: 'Solid R' });
  });

  it('하원은 선거구 번호, 주 전체 선거구는 00', () => {
    const house = parsePredictions(`
{|
|-
! District !! PVI !! Rep !! Last
! [[Cook Political Report|Cook]]<br>{{small|Nov. 2,<br>2026}}
|-
!{{ushr|NY|17|X}}
| a || b || c
|{{USRaceRating|Tossup}}
|-
!{{ushr|AK|AL|X}}
| a || b || c
|{{USRaceRating|Lean|R}}
|}`, 'house');
    expect(Object.keys(house.ratings)).toEqual(['NY-17', 'AK-00']);
  });
});

describe('parseResult', () => {
  const race = (status: string, extra = {}) => ({
    race_call_status: status,
    certified: false,
    tabulation_method: 'single-round',
    uncontested: false,
    candidate_metadata: {
      a: { nyt_id: 'a', first_name: 'Ann', last_name: 'Lee', party: { nyt_id: 'DEM' }, incumbent: true },
      b: { nyt_id: 'b', first_name: 'Bob', last_name: 'Kim', party: { nyt_id: 'GOP' } },
    },
    outcome: { won: status === 'called' ? ['b'] : [], called_by: ['ap'], winner_accepted_at: ['2026-11-04T03:00:00Z'], advanced_to_runoff: [] },
    top_reporting_unit: {
      eevp: 95, total_votes: 100, provider_updated_at: '2026-11-04T04:00:00Z',
      candidates: [{ nyt_id: 'a', votes: { total: 60 } }, { nyt_id: 'b', votes: { total: 40 } }],
    },
    ...extra,
  });

  it('선두와 승자를 구분한다', () => {
    const counting = parseResult(race('too_early'));
    expect(counting.status).toBe('counting');
    expect(counting.winner).toBeUndefined();
    expect(counting.candidates[0]).toMatchObject({ name: 'Ann Lee', party: 'D', incumbent: true });
  });

  it('판정된 승자는 득표 1위가 아니어도 판정을 따른다', () => {
    const called = parseResult(race('called'));
    expect(called).toMatchObject({ status: 'called', winner: 'R', winnerName: 'Bob Kim', calledBy: 'AP' });
  });
});

describe('matchMember (후보 사진 연결)', () => {
  const roster = [
    { b: 'B001', first: 'Shontel', last: 'Brown', state: 'OH' },
    { b: 'L001', first: 'Michael', last: 'Lawler', nick: 'Mike', state: 'NY' },
    { b: 'B002', first: 'Nanette', last: 'Barragán', state: 'CA' },
  ];
  it('성과 이름 첫 글자만 같은 다른 사람은 붙이지 않는다', () => {
    expect(matchMember({ first_name: 'Sherrod', last_name: 'Brown' }, 'OH', roster)).toBeUndefined();
  });
  it('애칭·악센트 차이는 같은 사람으로 본다', () => {
    expect(matchMember({ first_name: 'Mike', last_name: 'Lawler' }, 'NY', roster)).toBe('L001');
    expect(matchMember({ first_name: 'Nanette', last_name: 'Barragan' }, 'CA', roster)).toBe('B002');
  });
  it('다른 주의 동명이인은 붙이지 않는다', () => {
    expect(matchMember({ first_name: 'Mike', last_name: 'Lawler' }, 'NJ', roster)).toBeUndefined();
  });
});

describe('countyResults', () => {
  it('카운티 단위만, 상위 두 후보', () => {
    const out = countyResults({
      candidate_metadata: { a: { party: { nyt_id: 'DEM' } }, b: { party: { nyt_id: 'GOP' } }, c: { party: { nyt_id: 'LIB' } } },
      reporting_units: [
        { level: 'state', fips_state: '13' },
        { level: 'county', fips_state: '13', fips_county: '001', eevp: 99, total_votes: 10,
          candidates: [{ nyt_id: 'c', votes: { total: 1 } }, { nyt_id: 'b', votes: { total: 6 } }, { nyt_id: 'a', votes: { total: 3 } }] },
      ],
    });
    expect(out).toEqual({ 13001: { e: 99, t: 10, c: [['R', 6], ['D', 3]] } });
  });
});
