// 원본 자료(Wikipedia 위키텍스트, NYT 결과 JSON)를 사이트 형식으로 바꾸는 순수 함수들. 테스트 대상.

export const STATE_NAMES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI',
  Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};

const INDEPENDENT_CODES = new Set(['IND', 'NPA', 'UNA', 'NP', 'NPP', 'NPD', 'UNR']);
export const partyOf = (code) => (code === 'DEM' ? 'D' : code === 'GOP' ? 'R' : INDEPENDENT_CODES.has(code) ? 'I' : 'O');
export const pad = (n) => String(n).padStart(2, '0');

// ── 예측: Wikipedia 예측 표 ─────────────────────────────────────

export const SOURCES = [
  { id: 'cook', match: /^Cook/, name: 'Cook Political Report', url: 'https://www.cookpolitical.com/ratings', scaleNote: 'Solid · Likely · Lean · Toss-up' },
  { id: 'ie', match: /^IE$/, name: 'Inside Elections', url: 'https://insideelections.com/ratings', scaleNote: 'Solid · Likely · Lean · Tilt · Toss-up' },
  { id: 'sabato', match: /^Sabato/, name: "Sabato's Crystal Ball", url: 'https://centerforpolitics.org/crystalball/', scaleNote: 'Safe · Likely · Leans · Toss-up' },
  { id: 'ddhq', match: /^DDHQ/, name: 'Decision Desk HQ', url: 'https://www.decisiondeskhq.com/', scaleNote: 'Safe · Likely · Lean · Toss-up (모델 기반)' },
  { id: 'rcp', match: /^RCP/, name: 'RealClearPolitics', url: 'https://www.realclearpolling.com/', scaleNote: 'Safe · Likely · Lean · Toss-up' },
  { id: 'fox', match: /^Fox/, name: 'Fox News Power Rankings', url: 'https://www.foxnews.com/politics', scaleNote: 'Solid · Likely · Lean · Toss-up' },
];
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12 };
const LEVEL = { safe: 'safe', solid: 'safe', likely: 'likely', lean: 'lean', leans: 'lean', tilt: 'lean', tossup: 'tossup', 'toss-up': 'tossup' };

/** 표 행을 셀로 나눈다. '|' 또는 '!' 로 시작하는 줄이 새 셀, '||'·'!!' 는 같은 줄의 셀 구분 */
export function cells(row) {
  const out = [];
  for (const line of row.split('\n')) {
    if (/^\s*[|!]/.test(line) && !/^\s*\|[-}+]/.test(line)) {
      out.push(...line.replace(/^\s*[|!]/, '').split(/\|\||!!/));
    } else if (out.length) out[out.length - 1] += `\n${line}`;
  }
  return out;
}

/**
 * 첫 번째 USRaceRating 표를 읽는다.
 * @returns {{ sources: string[], ratings: Record<string, Record<string, {rating, label, date, url}>> }}
 *   ratings 키: 상원·주지사는 주 약자(특별선거는 'OH-special'), 하원은 'NY-17'(주 전체 선거구는 '-00')
 */
export function parsePredictions(wikitext, chamber) {
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  const first = text.indexOf('USRaceRating');
  if (first < 0) return { sources: [], ratings: {} };
  const table = text.slice(text.lastIndexOf('{|', first), text.indexOf('\n|}', first));
  const rows = table.split(/\n\|-[^\n]*/);
  const headerEnd = rows.findIndex((r) => r.includes('USRaceRating'));
  const headerCells = cells(rows[headerEnd - 1]);
  const firstDated = headerCells.findIndex((c) => /\{\{[Ss]mall\|/.test(c));
  const columns = headerCells.slice(firstDated).filter((c) => /\{\{[Ss]mall\|/.test(c)).map((c) => {
    const label = (c.match(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/) ?? [])[1]?.replace(/'/g, '').trim() ?? '';
    const [mon, day, year] = (c.match(/\{\{[Ss]mall\|([^}]*)\}\}/)[1].replace(/<br\s*\/?>/g, ' ').match(/([A-Z][a-z]+)\.?\s+(\d+),?\s+(\d{4})/) ?? []).slice(1);
    const url = (c.match(/url\s*=\s*([^\s|}]+)/) ?? [])[1];
    return { label, date: mon ? `${year}-${pad(MONTHS[mon])}-${pad(day)}` : null, url };
  });
  const ratingsByKey = {};
  for (const row of rows.slice(headerEnd)) {
    const cs = cells(row);
    if (cs.length < firstDated + 1) continue;
    const head = cs[0];
    let key;
    if (chamber === 'house') {
      const m = head.match(/\{\{ushr\|([A-Z]{2})\|([^|}]+)/i);
      if (!m) continue;
      key = `${m[1].toUpperCase()}-${/^AL$/i.test(m[2]) ? '00' : pad(m[2])}`;
    } else {
      const m = head.match(/\[\[[^\]|]*\|([^\]]+)\]\]/) ?? head.match(/\[\[([^\]]+)\]\]/);
      const st = m && STATE_NAMES[m[1].replace(/\s*\(.*\)/, '').trim()];
      if (!st) continue;
      key = /special/i.test(head) ? `${st}-special` : st;
    }
    const ratings = {};
    columns.forEach((col, i) => {
      const src = SOURCES.find((s) => s.match.test(col.label));
      const m = (cs[firstDated + i] ?? '').match(/USRaceRating\|([^|}]+)(?:\|([^|}]+))?/);
      if (!src || !m) return;
      const level = LEVEL[m[1].trim().toLowerCase()];
      const side = m[2]?.trim().toUpperCase();
      if (!level || (level !== 'tossup' && side !== 'D' && side !== 'R')) return;
      ratings[src.id] = {
        rating: level === 'tossup' ? 'tossup' : `${level}${side}`,
        label: level === 'tossup' ? 'Toss-up' : `${m[1].trim()} ${side}`,
        date: col.date,
        url: col.url,
      };
    });
    ratingsByKey[key] = ratings;
  }
  return { sources: columns.map((c) => c.label), ratings: ratingsByKey };
}

// ── 결과: NYT ─────────────────────────────────────────────

export function nameOf(meta) {
  if (!meta) return '기타';
  if (meta.nyt_id === 'total_writeins') return '기명 투표(write-in)';
  return [meta.first_name, meta.last_name].filter(Boolean).join(' ');
}

/** @param photoOf (meta) => 사진 주소 | undefined */
export function parseResult(r, photoOf = () => undefined) {
  const tru = r.top_reporting_unit;
  const meta = r.candidate_metadata;
  const all = tru.candidates
    .map((c) => ({
      name: nameOf(meta[c.nyt_id]),
      partyCode: meta[c.nyt_id]?.party?.nyt_id ?? 'OTH',
      votes: c.votes?.total ?? 0,
      incumbent: meta[c.nyt_id]?.incumbent || undefined,
      photo: photoOf(meta[c.nyt_id]),
    }))
    .map((c) => ({ ...c, party: partyOf(c.partyCode) }))
    .sort((a, b) => b.votes - a.votes);
  // 상위 3명 + 나머지는 '기타'로 합산
  const top = all.slice(0, 3);
  const rest = all.slice(3);
  if (rest.length) top.push({ name: `기타 ${rest.length}명`, party: 'O', partyCode: 'OTH', votes: rest.reduce((s, c) => s + c.votes, 0) });

  const wonId = r.outcome?.won?.[0];
  const called = r.race_call_status === 'called' && wonId;
  const status = r.certified && called ? 'certified'
    : called ? 'called'
      : r.race_call_status === 'runoff' ? 'runoff'
        : (tru.total_votes ?? 0) > 0 ? 'counting' : 'pending';
  return {
    status,
    expectedPct: tru.eevp ?? null,
    candidates: top,
    winner: called ? partyOf(meta[wonId]?.party?.nyt_id) : undefined,
    winnerName: called ? nameOf(meta[wonId]) : undefined,
    calledAt: called ? r.outcome.winner_accepted_at?.[0] : undefined,
    calledBy: called ? (r.outcome.called_by ?? []).map((x) => x.toUpperCase()).join(', ') : undefined,
    runoff: status === 'runoff' ? (r.outcome.advanced_to_runoff ?? []).map((id) => nameOf(meta[id])) : undefined,
    runoffAt: status === 'runoff' ? r.outcome.runoff_accepted_at?.[0] : undefined,
    rounds: Array.isArray(r.rounds) && r.rounds.length ? r.rounds : undefined,
    uncontested: r.uncontested || undefined,
    rankedChoice: r.tabulation_method === 'ranked-choice' || undefined,
    updatedAt: tru.provider_updated_at ?? r.updated_at,
    url: r.url,
  };
}

export const incumbentsIn = (r) => Object.values(r.candidate_metadata).filter((c) => c.incumbent);

/** 현재(이번 선거) 경계 기준 2024 대선 득표율 차 (민주 − 공화, %p) */
export function pres2024(r) {
  const h = r.top_reporting_unit.historical_comparison_race_data ?? {};
  const k = Object.keys(h).find((x) => x.includes('-P-2024'));
  return k && typeof h[k].margin === 'number' ? Math.round(h[k].margin * 10) / 10 : undefined;
}

/** 카운티별 결과 (상위 두 후보 정당·득표, 예상 개표율). 카운티 단위가 아닌 주(알래스카 등)는 비어 있다 */
export function countyResults(race) {
  const meta = race.candidate_metadata;
  const out = {};
  for (const u of race.reporting_units ?? []) {
    if (u.level !== 'county' || !u.fips_state || !u.fips_county) continue;
    const top = [...(u.candidates ?? [])].sort((a, b) => (b.votes?.total ?? 0) - (a.votes?.total ?? 0)).slice(0, 2);
    out[u.fips_state + u.fips_county] = {
      e: u.eevp ?? null,
      t: u.total_votes ?? 0,
      c: top.map((c) => [partyOf(meta[c.nyt_id]?.party?.nyt_id), c.votes?.total ?? 0]),
    };
  }
  return out;
}

// ── 후보 사진: 현직 연방 의원 공식 사진(미 정부 저작물, 퍼블릭 도메인) ─────

export const normalizeName = (s) => (s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim();

/** 이름이 같은 사람으로 볼 수 있는지: 같거나, 한쪽이 다른 쪽으로 시작(3자 이상, Jon/Jonathan) */
const sameFirst = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.length >= 3 && l.startsWith(s);
};

/**
 * 같은 주의 현직 의원 중 성이 같고 이름(또는 애칭)도 같은 사람. 성만 같으면 다른 사람일 수 있으니 붙이지 않는다
 * (예: 오하이오의 Sherrod Brown 후보와 Shontel Brown 의원).
 * @param roster [{ b: bioguide, first, last, nick, state }]
 */
export function matchMember(meta, state, roster) {
  if (!meta?.last_name) return undefined;
  const last = normalizeName(meta.last_name);
  const first = normalizeName(meta.first_name).split(' ')[0];
  return roster.find((m) => m.state === state && normalizeName(m.last) === last
    && [m.first, m.nick].some((n) => sameFirst(normalizeName(n).split(' ')[0], first)))?.b;
}

export const photoUrl = (bioguide) => `https://unitedstates.github.io/images/congress/225x275/${bioguide}.jpg`;

/**
 * 새 경계 선거구의 '추정' 보유 정당. 같은 번호의 이전 선거구와 비교하지 않기 위한 대안이며, 공식 정당 교체 수에는 넣지 않는다.
 *   1) 이 선거구에 출마한 현직이 한 정당뿐이면 그 정당 (현직의 지역구가 옮겨 온 것으로 본다)
 *   2) 아니면 새 경계 기준 2024 대선 승자
 * @returns {{ party: 'D'|'R'|'I', basis: 'incumbent'|'pres2024' } | undefined}
 */
export function notionalHolder(incumbentParties, pres2024Margin) {
  const parties = [...new Set(incumbentParties.filter((p) => p === 'D' || p === 'R' || p === 'I'))];
  if (parties.length === 1) return { party: parties[0], basis: 'incumbent' };
  if (pres2024Margin == null || pres2024Margin === 0) return undefined;
  return { party: pres2024Margin > 0 ? 'D' : 'R', basis: 'pres2024' };
}

// ── 저장 전 검사 ─────────────────────────────────────────────

export const EXPECTED_RACES = { senate: 35, house: 435, governor: 36 };
const STATUSES = new Set(['pending', 'counting', 'runoff', 'called', 'certified']);
const decided = (r) => r.result.status === 'called' || r.result.status === 'certified';

/**
 * 새로 만든 데이터가 화면에 내보내도 될 만한지. 문제 목록을 돌려주고, 비어 있으면 통과.
 * 공급원 형식이 바뀌거나 일부만 내려왔을 때 깨진 파일로 덮어쓰지 않기 위한 것.
 * @param prev 직전에 저장한 데이터 (있으면 승자 발표 수가 크게 줄었는지도 본다)
 */
export function validateData(data, prev) {
  const problems = [];
  const races = data?.races ?? [];
  for (const [chamber, n] of Object.entries(EXPECTED_RACES)) {
    const got = races.filter((r) => r.chamber === chamber).length;
    if (got !== n) problems.push(`${chamber} 선거 수 ${got} (기대 ${n})`);
  }
  const ids = new Set();
  for (const r of races) {
    if (ids.has(r.id)) problems.push(`${r.id} 중복`);
    ids.add(r.id);
    const res = r.result;
    if (!res || !STATUSES.has(res.status)) { problems.push(`${r.id} 상태 값 이상: ${res?.status}`); continue; }
    if (!Array.isArray(res.candidates) || !res.candidates.length) problems.push(`${r.id} 후보 없음`);
    else if (res.candidates.some((c) => !Number.isFinite(c.votes) || c.votes < 0)) problems.push(`${r.id} 득표 값 이상`);
    if (decided(r) && !res.winner) problems.push(`${r.id} 승자 발표인데 승자 없음`);
  }
  // 승자 발표는 거의 되돌려지지 않는다. 한꺼번에 많이 줄면 피드가 일부만 내려온 것으로 본다
  if (prev?.races) {
    const before = prev.races.filter(decided).length;
    const now = races.filter(decided).length;
    if (before - now > 5) problems.push(`승자 발표가 ${before} → ${now} 로 줄었음`);
  }
  return problems;
}
