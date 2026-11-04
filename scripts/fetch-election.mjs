// 실제 선거 데이터 → public/data/election-2026.json
//
//   결과  The New York Times 개표 데이터 (AP 집계·판정)
//   예측  Wikipedia 예측 표 (Cook, Inside Elections, Sabato 등 기관별 최종 평가 전사본)
//   선거 전 현황  scripts/data/baseline.json, scripts/data/house-members.json
//
// Usage: node scripts/fetch-election.mjs [--cache <dir>]
//   --cache: 내려받은 원본을 저장하고, 이미 있으면 다시 받지 않는다 (재실행·디버깅용)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const cacheDir = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : null;
const OUT = 'public/data/election-2026.json';
const ELECTION_DAY = '2026-11-03';
const FREEZE_AT = '2026-11-03T10:00:00Z'; // 선거일 첫 투표소 개장 전 (미 동부 오전 5시)
const UA = 'midelec-2026-dashboard/0.1 (personal election dashboard)';

const NYT = (office) => `https://static01.nyt.com/elections-assets/pages/data/${ELECTION_DAY}/results-${office}.json`;
const WIKI = (page) => `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`;

async function get(url, name) {
  const file = cacheDir && join(cacheDir, name);
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  if (file) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, text);
  }
  return JSON.parse(text);
}

const baseline = JSON.parse(readFileSync('scripts/data/baseline.json', 'utf8'));
const members = JSON.parse(readFileSync('scripts/data/house-members.json', 'utf8'));
const REDISTRICTED = new Set(baseline.redistrictedStates);

const STATE_NAMES = {
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
const partyOf = (code) => (code === 'DEM' ? 'D' : code === 'GOP' ? 'R' : INDEPENDENT_CODES.has(code) ? 'I' : 'O');
const pad = (n) => String(n).padStart(2, '0');

// ── 예측: Wikipedia 예측 표 ─────────────────────────────────────

const SOURCES = [
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
function cells(row) {
  const out = [];
  for (const line of row.split('\n')) {
    if (/^\s*[|!]/.test(line) && !/^\s*\|[-}+]/.test(line)) {
      out.push(...line.replace(/^\s*[|!]/, '').split(/\|\||!!/));
    } else if (out.length) out[out.length - 1] += `\n${line}`;
  }
  return out;
}

function parsePredictions(wikitext, chamber) {
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  const first = text.indexOf('USRaceRating');
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
  const out = new Map(); // raceKey → { sourceId → {rating,label,date,url} }
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
      const cell = cs[firstDated + i] ?? '';
      const m = cell.match(/USRaceRating\|([^|}]+)(?:\|([^|}]+))?/);
      if (!src || !m) return;
      const level = LEVEL[m[1].trim().toLowerCase()];
      const side = m[2]?.trim().toUpperCase();
      if (!level || (level !== 'tossup' && side !== 'D' && side !== 'R')) return;
      const rating = level === 'tossup' ? 'tossup' : `${level}${side}`;
      const word = m[1].trim();
      ratings[src.id] = { rating, label: level === 'tossup' ? 'Toss-up' : `${word} ${side}`, date: col.date, url: col.url };
    });
    out.set(key, ratings);
  }
  return { ratings: out, sources: columns.map((c) => c.label) };
}

// ── 결과: NYT ─────────────────────────────────────────────

function nameOf(meta) {
  if (!meta) return '기타';
  if (meta.nyt_id === 'total_writeins') return '기명 투표(write-in)';
  return [meta.first_name, meta.last_name].filter(Boolean).join(' ');
}

function parseResult(r) {
  const tru = r.top_reporting_unit;
  const meta = r.candidate_metadata;
  const all = tru.candidates
    .map((c) => ({ name: nameOf(meta[c.nyt_id]), partyCode: meta[c.nyt_id]?.party?.nyt_id ?? 'OTH', votes: c.votes?.total ?? 0, incumbent: meta[c.nyt_id]?.incumbent || undefined }))
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
    uncontested: r.uncontested || undefined,
    rankedChoice: r.tabulation_method === 'ranked-choice' || undefined,
    updatedAt: tru.provider_updated_at ?? r.updated_at,
    url: r.url,
  };
}

const incumbentsIn = (r) => Object.values(r.candidate_metadata).filter((c) => c.incumbent);
const pres2024 = (r) => {
  const h = r.top_reporting_unit.historical_comparison_race_data ?? {};
  const k = Object.keys(h).find((x) => x.includes('-P-2024'));
  return k && typeof h[k].margin === 'number' ? Math.round(h[k].margin * 10) / 10 : undefined;
};

// ── 조립 ─────────────────────────────────────────────

const fetchedAt = new Date().toISOString();
const [nytS, nytH, nytG, wS, wH, wG] = await Promise.all([
  get(NYT('senate'), 'nyt-senate.json'),
  get(NYT('house'), 'nyt-house.json'),
  get(NYT('governor'), 'nyt-governor.json'),
  get(WIKI('2026 United States Senate elections'), 'wiki-senate.json'),
  get(WIKI('2026 United States House of Representatives election ratings'), 'wiki-house-ratings.json'),
  get(WIKI('2026 United States gubernatorial elections'), 'wiki-governor.json'),
]);
const pred = {
  senate: parsePredictions(wS.parse.wikitext, 'senate'),
  house: parsePredictions(wH.parse.wikitext, 'house'),
  governor: parsePredictions(wG.parse.wikitext, 'governor'),
};
const sourceDates = {};

// 같은 평가가 이전 실행에도 있었으면 처음 반영한 시각을 유지한다
const firstSeen = new Map();
if (existsSync(OUT)) {
  try {
    for (const r of JSON.parse(readFileSync(OUT, 'utf8')).races) {
      for (const [src, f] of Object.entries(r.forecasts)) {
        const e = f.history.at(-1);
        firstSeen.set(`${r.id}:${src}:${e.rating}:${e.label}`, e.ingestedAt);
      }
    }
  } catch { /* 이전 파일이 깨졌으면 새로 시작 */ }
}

function forecastsFor(raceId, chamber, key, favored) {
  const p = pred[chamber];
  const found = p.ratings.get(key);
  const out = {};
  for (const src of SOURCES) {
    const f = found?.[src.id];
    // 하원 경합 목록에 없는 선거구 = 모든 기관이 안정권으로 본 곳. 선거 전 우세 정당 쪽 안정권으로 표시한다.
    const inTable = p.sources.some((label) => src.match.test(label));
    if (!f && !(chamber === 'house' && !found && inTable && favored)) continue;
    const entry = f ?? { rating: `safe${favored}`, label: `Safe/Solid ${favored}`, date: null, implied: true };
    const colDate = f?.date ?? sourceDates[`${chamber}:${src.id}`];
    if (f?.date) sourceDates[`${chamber}:${src.id}`] = f.date;
    out[src.id] = {
      history: [{
        rating: entry.rating,
        label: entry.label,
        publishedAt: `${colDate ?? ELECTION_DAY}T00:00:00-05:00`,
        ingestedAt: firstSeen.get(`${raceId}:${src.id}:${entry.rating}:${entry.label}`) ?? fetchedAt,
        ...(entry.implied ? { implied: true } : {}),
      }],
      url: f?.url ?? src.url,
    };
  }
  return out;
}

// 열 날짜를 먼저 모아 둔다 (안정권 간주 항목에도 같은 기준일을 쓰기 위해)
for (const [chamber, p] of Object.entries(pred)) {
  for (const ratings of p.ratings.values()) for (const [id, f] of Object.entries(ratings)) if (f.date) sourceDates[`${chamber}:${id}`] = f.date;
}

const races = [];
const warnings = [];

for (const r of nytS.races) {
  const st = r.top_reporting_unit.state_postal;
  const kind = /special/i.test(r.type) ? 'special' : 'regular';
  const base = baseline.senateUp.find((s) => s.state === st && s.kind === kind);
  if (!base) { warnings.push(`상원 ${st} ${kind}: 선거 전 현황 없음`); continue; }
  const inc = incumbentsIn(r)[0];
  const result = parseResult(r);
  if (result.winner && r.outcome.gained === (result.winner === base.party)) warnings.push(`상원 ${st}: 기존 보유(${base.party})와 결과 데이터의 교체 여부가 다름`);
  races.push({
    id: kind === 'special' ? `S-${st}-special` : `S-${st}`,
    chamber: 'senate', state: st, kind, seatStatus: 'occupied',
    incumbent: { name: inc ? nameOf(inc) : base.name, party: base.party, running: !!inc },
    heldBy: base.party,
    pres2024: pres2024(r),
    forecasts: forecastsFor(kind === 'special' ? `S-${st}-special` : `S-${st}`, 'senate', kind === 'special' ? `${st}-special` : st),
    result,
  });
}

for (const r of nytG.races) {
  const st = r.top_reporting_unit.state_postal;
  const gov = baseline.governors[st];
  const inc = incumbentsIn(r)[0];
  const result = parseResult(r);
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
  const result = parseResult(r);
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
    generatedAt: latest,
    fetchedAt,
    electionDay: ELECTION_DAY,
    forecastFreezeAt: FREEZE_AT,
    resultSource: {
      name: 'The New York Times 개표 데이터 (AP 집계·승자 판정)',
      url: `https://www.nytimes.com/interactive/${ELECTION_DAY.replace(/-/g, '/')}/us/elections/results-house.html`,
      note: 'NYT 결과 페이지가 쓰는 공개 JSON. 공식 API가 아니므로 개인·개발용으로만 쓰고, 공개 서비스에는 AP Elections API 등 이용 계약된 공급원으로 바꿔야 합니다.',
    },
    forecastSource: {
      name: 'Wikipedia 2026 선거 예측 표',
      url: 'https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_election_ratings',
      note: '각 기관의 선거 직전 최종 평가를 Wikipedia가 옮겨 적은 표(CC BY-SA). 기관 원문과 표기가 다를 수 있고, 이전 등급 이력은 포함하지 않습니다. 하원은 경합 목록에 없는 선거구를 안정권으로 간주합니다.',
    },
    boundary: {
      name: 'U.S. Census Bureau 의회 선거구 — 119대 지도(1:500k) + 2026 TIGER/Line 120대 경계(재조정 주)',
      version: 'cb_2024_us_cd119 + tl_2026_cd120',
      url: 'https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.html',
      note: `${baseline.redistrictedStates.join('·')}는 2026년 새 경계를 적용했습니다. 이 선거구들은 이전 번호와 비교해 정당 교체를 판정하지 않습니다. 미주리는 새 지도가 법원에서 막혀 기존 경계로 치렀습니다.`,
    },
    rosterSource: { name: 'unitedstates/congress-legislators', url: 'https://github.com/unitedstates/congress-legislators' },
  },
  forecastSources: SOURCES.map(({ id, name, url, scaleNote }) => ({ id, name, url, scaleNote })),
  races,
  senateSeats: baseline.senateSeats,
  senateCaucus: baseline.senateCaucus,
  governors: baseline.governors,
  houseBefore,
  redistrictedStates: baseline.redistrictedStates,
};

mkdirSync('public/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(data));
const by = (c) => races.filter((r) => r.chamber === c);
const rated = (c) => by(c).filter((r) => Object.keys(r.forecasts).length).length;
console.log(`${OUT}: 상원 ${by('senate').length} · 하원 ${by('house').length} · 주지사 ${by('governor').length}`);
console.log(`예측 열: 상원 [${pred.senate.sources.join(', ')}] / 하원 [${pred.house.sources.join(', ')}] / 주지사 [${pred.governor.sources.join(', ')}]`);
console.log(`예측 있는 선거: 상원 ${rated('senate')} · 하원 ${rated('house')} (표에 직접 ${pred.house.ratings.size}) · 주지사 ${rated('governor')}`);
for (const w of warnings) console.warn('⚠', w);
