// NYT 결과 원본 + 예측 스냅숏 + 선거 전 현황 → 사이트 데이터(ElectionData).
// 수집 스크립트(Node)와 공개 사이트(브라우저)가 함께 쓴다. 파일·네트워크에 손대지 않는 순수 함수만 둔다.
import {
  SOURCES, countyResults, incumbentsIn, matchMember, nameOf, notionalHolder, pad, parseResult, partyOf, photoUrl, pres2024,
} from './parse.mjs';

export const ELECTION_DAY = '2026-11-03';
/** 선거일 첫 투표소 개장 전 (미 동부 오전 5시). 이 시각 이후 평가는 예측 ↔ 결과 비교에서 뺀다 */
export const FREEZE_AT = '2026-11-03T10:00:00Z';

export const NYT_RESULTS = (office) =>
  `https://static01.nyt.com/elections-assets/pages/data/${ELECTION_DAY}/results-${office}.json`;

/** NYT 결과 JSON 안에 있는 카운티 피드 주소 (sen-county-data, gov-county-data) */
export const countyFeedUrl = (json, slug) =>
  JSON.stringify(json).match(new RegExp(`https://static01\\.nyt\\.com/elections-assets/pages/data/feeds/[^"\\\\]+/${slug}/[^"\\\\]+\\.json`))?.[0];

/** 카운티 피드의 선거 → 사이트 선거 ID */
export function countyRaceId(race, prefix) {
  const st = race.top_reporting_unit?.state_postal ?? race.nyt_id.slice(0, 2);
  return prefix === 'S' ? (/special/i.test(race.type) ? `S-${st}-special` : `S-${st}`) : `G-${st}`;
}

/** 카운티 피드 → { 선거 ID: 카운티별 결과 } */
export function countiesFromFeed(feed, prefix) {
  const out = {};
  for (const race of feed?.data ?? []) {
    const c = countyResults(race);
    if (Object.keys(c).length) out[countyRaceId(race, prefix)] = c;
  }
  return out;
}

/**
 * @param input.nytS / nytH / nytG  NYT results-senate/house/governor JSON
 * @param input.tables              예측 스냅숏의 tables
 * @param input.baseline, members, roster  scripts/data 의 선거 전 현황
 * @param input.fetchedAt           이번에 받은 시각
 * @param input.firstSeen           (선택) `${raceId}:${src}:${rating}:${label}` → 처음 반영 시각
 * @param input.ingestedDefault     (선택) firstSeen 에 없을 때 쓸 '처음 반영' 시각. 없으면 fetchedAt
 * @returns {{ data, warnings: string[] }}
 */
export function assembleElection({ nytS, nytH, nytG, tables, baseline, members, roster = [], fetchedAt, firstSeen, ingestedDefault }) {
  const REDISTRICTED = new Set(baseline.redistrictedStates);
  const warnings = [];

  // 출처별 기준일 (안정권 간주 항목에도 같은 날짜를 쓰기 위해)
  const sourceDates = {};
  for (const [chamber, t] of Object.entries(tables)) {
    for (const ratings of Object.values(t.ratings)) for (const [id, f] of Object.entries(ratings)) if (f.date) sourceDates[`${chamber}:${id}`] = f.date;
  }

  function forecastsFor(raceId, chamber, key, favored) {
    const t = tables[chamber];
    const found = t.ratings[key];
    const out = {};
    for (const src of SOURCES) {
      const f = found?.[src.id];
      // 하원 경합 목록에 없는 선거구 = 모든 기관이 안정권으로 본 곳. 선거 전 우세 정당 쪽 안정권으로 표시한다.
      const inTable = t.sources.some((label) => src.match.test(label));
      if (!f && !(chamber === 'house' && !found && inTable && favored)) continue;
      const entry = f ?? { rating: `safe${favored}`, label: `Safe/Solid ${favored}`, date: null, implied: true };
      out[src.id] = {
        history: [{
          rating: entry.rating,
          label: entry.label,
          publishedAt: `${entry.date ?? sourceDates[`${chamber}:${src.id}`] ?? ELECTION_DAY}T00:00:00-05:00`,
          ingestedAt: firstSeen?.get(`${raceId}:${src.id}:${entry.rating}:${entry.label}`) ?? ingestedDefault ?? fetchedAt,
          ...(entry.implied ? { implied: true } : {}),
        }],
        url: f?.url ?? src.url,
      };
    }
    return out;
  }

  const photoIn = (state) => (meta) => {
    const b = matchMember(meta, state, roster);
    return b ? photoUrl(b) : undefined;
  };

  const races = [];

  for (const r of nytS.races) {
    const st = r.top_reporting_unit.state_postal;
    const kind = /special/i.test(r.type) ? 'special' : 'regular';
    const base = baseline.senateUp.find((s) => s.state === st && s.kind === kind);
    if (!base) { warnings.push(`상원 ${st} ${kind}: 선거 전 현황 없음`); continue; }
    const inc = incumbentsIn(r)[0];
    const result = parseResult(r, photoIn(st));
    if (result.winner && r.outcome.gained === (result.winner === base.party)) warnings.push(`상원 ${st}: 기존 보유(${base.party})와 결과 데이터의 교체 여부가 다름`);
    const id = kind === 'special' ? `S-${st}-special` : `S-${st}`;
    races.push({
      id, chamber: 'senate', state: st, kind, seatStatus: 'occupied',
      incumbent: { name: inc ? nameOf(inc) : base.name, party: base.party, running: !!inc },
      heldBy: base.party,
      pres2024: pres2024(r),
      forecasts: forecastsFor(id, 'senate', kind === 'special' ? `${st}-special` : st),
      result,
    });
  }

  for (const r of nytG.races) {
    const st = r.top_reporting_unit.state_postal;
    const gov = baseline.governors[st];
    const inc = incumbentsIn(r)[0];
    const result = parseResult(r, photoIn(st));
    if (result.winner && r.outcome.gained != null && r.outcome.gained === (result.winner === gov.party)) warnings.push(`주지사 ${st}: 기존 보유(${gov.party})와 결과 데이터의 교체 여부가 다름`);
    races.push({
      id: `G-${st}`, chamber: 'governor', state: st, kind: 'regular', seatStatus: 'occupied',
      incumbent: { name: inc ? nameOf(inc) : gov.name, party: gov.party, running: !!inc },
      heldBy: gov.party,
      pres2024: pres2024(r),
      forecasts: forecastsFor(`G-${st}`, 'governor', st),
      result,
    });
  }

  const houseCount = {};
  for (const r of nytH.races) houseCount[r.top_reporting_unit.state_postal] = (houseCount[r.top_reporting_unit.state_postal] ?? 0) + 1;
  for (const r of nytH.races) {
    const st = r.top_reporting_unit.state_postal;
    if (st === 'US') continue;
    const district = houseCount[st] === 1 ? 0 : Number(r.seat_number);
    const key = `${st}-${pad(district)}`;
    const member = members[key];
    const changed = REDISTRICTED.has(st);
    const incs = incumbentsIn(r);
    const result = parseResult(r, photoIn(st));
    const heldBy = changed ? null : member?.party ?? baseline.vacantLastParty[key] ?? null;
    let incumbent;
    if (changed) {
      // 새 경계: 같은 번호의 이전 의원이 아니라 이 선거구에 출마한 현직을 보여준다
      if (incs[0]) incumbent = { name: nameOf(incs[0]), party: partyOf(incs[0].party?.nyt_id), running: true };
    } else if (member) {
      const last = member.name.split(' ').at(-1).toLowerCase();
      const running = incs.some((c) => member.name.toLowerCase().includes((c.last_name ?? '').toLowerCase()) || (c.last_name ?? '').toLowerCase() === last);
      incumbent = { name: member.name, party: member.party, running };
    }
    if (!changed && result.winner && heldBy && r.outcome.gained != null && r.outcome.gained === (result.winner === heldBy)) {
      warnings.push(`하원 ${key}: 기존 보유(${heldBy})와 결과 데이터의 교체 여부가 다름`);
    }
    const p24 = pres2024(r);
    const favored = changed ? (p24 == null ? null : p24 >= 0 ? 'D' : 'R') : heldBy === 'D' ? 'D' : heldBy ? 'R' : null;
    races.push({
      id: `H-${key}`, chamber: 'house', state: st, district, kind: 'regular',
      description: r.seat_description ?? undefined,
      seatStatus: member || changed ? 'occupied' : 'vacant',
      incumbent,
      heldBy,
      boundaryChanged: changed || undefined,
      notional: changed ? notionalHolder(incs.map((c) => partyOf(c.party?.nyt_id)), p24) : undefined,
      pres2024: p24,
      forecasts: forecastsFor(`H-${key}`, 'house', key, favored),
      result,
    });
  }

  const houseBefore = { D: 0, R: 0, I: 0, O: 0, vacant: 435 - Object.keys(members).length };
  for (const m of Object.values(members)) houseBefore[m.party]++;

  const latest = races.map((r) => r.result.updatedAt).filter(Boolean).sort().at(-1);
  const data = {
    meta: {
      isSample: false,
      generatedAt: latest ?? fetchedAt,
      fetchedAt,
      electionDay: ELECTION_DAY,
      forecastFreezeAt: FREEZE_AT,
      resultSource: {
        name: 'The New York Times 개표 데이터 (AP 집계·승자 판정)',
        url: `https://www.nytimes.com/interactive/${ELECTION_DAY.replace(/-/g, '/')}/us/elections/results-house.html`,
        note: 'NYT 결과 페이지가 쓰는 공개 JSON을 보는 사람의 브라우저가 직접 받아 화면에서 가공합니다. 이 사이트는 결과 데이터 사본을 두지 않으며, 공식 API가 아니므로 바뀌거나 막힐 수 있습니다.',
      },
      forecastSource: {
        name: 'Wikipedia 2026 선거 예측 표',
        url: 'https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_election_ratings',
        note: '각 기관의 선거 직전 최종 평가를 Wikipedia가 옮겨 적은 표(CC BY-SA)를 선거 직후 고정해 씁니다. 기관 원문과 표기가 다를 수 있고, 이전 등급 이력은 없습니다. 하원은 경합 목록에 없는 선거구를 안정권으로 간주합니다.',
      },
      boundary: {
        name: 'U.S. Census Bureau 의회 선거구 — 119대 지도(1:500k) + 2026 TIGER/Line 120대 경계(재조정 주)',
        version: 'cb_2024_us_cd119 + tl_2026_cd120',
        url: 'https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.html',
        note: `${baseline.redistrictedStates.join('·')}는 2026년 새 경계를 적용했습니다. 이 선거구들은 이전 번호와 비교해 정당 교체를 판정하지 않습니다. 미주리는 새 지도가 법원에서 막혀 기존 경계로 치렀습니다.`,
      },
      rosterSource: { name: 'unitedstates/congress-legislators', url: 'https://github.com/unitedstates/congress-legislators' },
      photoSource: { name: '연방 의회 공식 사진 (퍼블릭 도메인)', url: 'https://github.com/unitedstates/images' },
    },
    forecastSources: SOURCES.map(({ id, name, url, scaleNote }) => ({ id, name, url, scaleNote })),
    races,
    senateSeats: baseline.senateSeats,
    senateCaucus: baseline.senateCaucus,
    governors: baseline.governors,
    houseBefore,
    redistrictedStates: baseline.redistrictedStates,
  };
  return { data, warnings };
}
