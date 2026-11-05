// 실제 선거 데이터 → public/data/election-2026.json, public/data/counties-2026.json
//
//   결과  The New York Times 개표 데이터 (AP 집계·판정), 상원·주지사는 카운티별 결과도
//   예측  scripts/data/forecasts-final.json (선거 직전 평가를 고정한 스냅숏, 원본은 Wikipedia 예측 표)
//   선거 전 현황  scripts/data/baseline.json, house-members.json, congress-roster.json(후보 사진)
//
// Usage: node scripts/fetch-election.mjs [--cache <dir>] [--every <분>] [--refresh-forecasts]
//   --cache              내려받은 원본을 저장하고, 이미 있으면 다시 받지 않는다 (재실행·디버깅용)
//   --every              그 간격(분)으로 계속 다시 받는다 (개표 중 켜 두기)
//   --refresh-forecasts  예측 스냅숏을 Wikipedia 에서 새로 만든다. 선거 후 편집이 섞일 수 있으니 주의
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOURCES, countyResults, incumbentsIn, matchMember, nameOf, pad, parsePredictions, parseResult, partyOf, photoUrl, pres2024, validateData,
} from './lib/parse.mjs';

/** 임시 파일에 쓴 뒤 바꿔치기 — 쓰는 도중 화면이 반쯤 쓴 파일을 읽지 않도록 */
function writeAtomic(file, text) {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const cacheDir = opt('--cache');
const everyMin = Number(opt('--every')) || 0;
const refreshForecasts = args.includes('--refresh-forecasts');

const OUT = 'public/data/election-2026.json';
const COUNTIES_OUT = 'public/data/counties-2026.json';
const SNAPSHOT = 'scripts/data/forecasts-final.json';
const ELECTION_DAY = '2026-11-03';
const FREEZE_AT = '2026-11-03T10:00:00Z'; // 선거일 첫 투표소 개장 전 (미 동부 오전 5시)
const UA = 'midelec-2026-dashboard/0.1 (personal election dashboard)';

const NYT = (office) => `https://static01.nyt.com/elections-assets/pages/data/${ELECTION_DAY}/results-${office}.json`;
const WIKI = (page) => `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
const WIKI_PAGES = {
  senate: '2026 United States Senate elections',
  house: '2026 United States House of Representatives election ratings',
  governor: '2026 United States gubernatorial elections',
};

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

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const baseline = readJson('scripts/data/baseline.json');
const members = readJson('scripts/data/house-members.json');
const roster = existsSync('scripts/data/congress-roster.json') ? readJson('scripts/data/congress-roster.json') : [];
const REDISTRICTED = new Set(baseline.redistrictedStates);

/** 예측은 한 번 고정해 두고 다시 쓴다. 선거 뒤 Wikipedia 표가 바뀌어도 '예측 ↔ 결과'가 흔들리지 않도록 */
async function loadForecasts() {
  if (existsSync(SNAPSHOT) && !refreshForecasts) return readJson(SNAPSHOT).tables;
  const tables = {};
  for (const [chamber, page] of Object.entries(WIKI_PAGES)) {
    tables[chamber] = parsePredictions((await get(WIKI(page), `wiki-${chamber}.json`)).parse.wikitext, chamber);
  }
  writeFileSync(SNAPSHOT, JSON.stringify({
    savedAt: new Date().toISOString(),
    note: '각 기관의 선거 직전 최종 평가(Wikipedia 예측 표 전사본, CC BY-SA). --refresh-forecasts 로만 다시 만든다.',
    tables,
  }, null, 1));
  console.log(`${SNAPSHOT}: 예측 스냅숏 저장`);
  return tables;
}

/** NYT 결과 JSON 안에 있는 카운티 피드 주소 */
const countyFeedUrl = (json, slug) =>
  JSON.stringify(json).match(new RegExp(`https://static01\\.nyt\\.com/elections-assets/pages/data/feeds/[^"\\\\]+/${slug}/[^"\\\\]+\\.json`))?.[0];

async function run() {
  const fetchedAt = new Date().toISOString();
  const [nytS, nytH, nytG, tables] = await Promise.all([
    get(NYT('senate'), 'nyt-senate.json'),
    get(NYT('house'), 'nyt-house.json'),
    get(NYT('governor'), 'nyt-governor.json'),
    loadForecasts(),
  ]);

  // 같은 평가가 이전 실행에도 있었으면 처음 반영한 시각을 유지한다
  const firstSeen = new Map();
  if (existsSync(OUT)) {
    try {
      for (const r of readJson(OUT).races) {
        for (const [src, f] of Object.entries(r.forecasts)) {
          const e = f.history.at(-1);
          firstSeen.set(`${r.id}:${src}:${e.rating}:${e.label}`, e.ingestedAt);
        }
      }
    } catch { /* 이전 파일이 깨졌으면 새로 시작 */ }
  }

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
          ingestedAt: firstSeen.get(`${raceId}:${src.id}:${entry.rating}:${entry.label}`) ?? fetchedAt,
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
  const warnings = [];

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
      pres2024: p24,
      forecasts: forecastsFor(`H-${key}`, 'house', key, favored),
      result,
    });
  }

  // 상원·주지사 카운티별 결과 (피드를 못 찾으면 건너뛴다)
  const counties = {};
  for (const [json, slug, prefix] of [[nytS, 'sen-county-data', 'S'], [nytG, 'gov-county-data', 'G']]) {
    const url = countyFeedUrl(json, slug) ?? countyFeedUrl(nytH, slug);
    if (!url) { warnings.push(`${slug}: 피드 주소를 찾지 못함`); continue; }
    const feed = await get(url, `nyt-${slug}.json`);
    for (const race of feed.data ?? []) {
      const st = race.top_reporting_unit?.state_postal ?? race.nyt_id.slice(0, 2);
      const id = prefix === 'S' ? (/special/i.test(race.type) ? `S-${st}-special` : `S-${st}`) : `G-${st}`;
      const c = countyResults(race);
      if (Object.keys(c).length) counties[id] = c;
    }
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

  // 이상하면 저장하지 않고 직전 파일을 그대로 둔다
  let prev = null;
  try { prev = existsSync(OUT) ? readJson(OUT) : null; } catch { /* 직전 파일이 깨졌으면 비교 없이 */ }
  const problems = validateData(data, prev);
  if (problems.length) {
    throw new Error(['데이터 검사 실패 — 저장하지 않고 직전 파일을 유지합니다:', ...problems.slice(0, 10)].join('\n  '));
  }
  mkdirSync('public/data', { recursive: true });
  writeAtomic(OUT, JSON.stringify(data));
  writeAtomic(COUNTIES_OUT, JSON.stringify(counties));
  const by = (c) => races.filter((r) => r.chamber === c);
  const photos = races.flatMap((r) => r.result.candidates).filter((c) => c.photo).length;
  const called = races.filter((r) => r.result.status === 'called' || r.result.status === 'certified').length;
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${OUT}: 상원 ${by('senate').length} · 하원 ${by('house').length} · 주지사 ${by('governor').length} · 승자 발표 ${called} · 사진 ${photos}명 · 카운티 지도 ${Object.keys(counties).length}곳`);
  for (const w of warnings) console.warn('⚠', w);
}

if (everyMin > 0) {
  // 개표 중 켜 두는 모드: 실패해도 멈추지 않고 다음 주기에 다시 시도
  const loop = async () => {
    try { await run(); } catch (e) { console.error('수집 실패:', e.message); }
    setTimeout(loop, everyMin * 60e3);
  };
  console.log(`${everyMin}분마다 다시 받습니다. 끝내려면 Ctrl+C`);
  loop();
} else {
  try {
    await run();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
