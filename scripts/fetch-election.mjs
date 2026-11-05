// 실제 선거 데이터 → public/data/election-2026.json, public/data/counties-2026.json (로컬 개발·점검용)
//
// 공개 사이트는 이 파일들을 쓰지 않고 보는 사람의 브라우저가 NYT 에서 직접 받는다(src/data/index.ts).
// 이 스크립트는 같은 조립 코드(scripts/lib/assemble.mjs)로 원본을 받아 검사하고, 로컬에 저장한다.
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
import { parsePredictions, validateData } from './lib/parse.mjs';
import { NYT_RESULTS, assembleElection, countiesFromFeed, countyFeedUrl } from './lib/assemble.mjs';

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
const UA = 'midelec-2026-dashboard/0.1 (personal election dashboard)';

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

async function run() {
  const fetchedAt = new Date().toISOString();
  const [nytS, nytH, nytG, tables] = await Promise.all([
    get(NYT_RESULTS('senate'), 'nyt-senate.json'),
    get(NYT_RESULTS('house'), 'nyt-house.json'),
    get(NYT_RESULTS('governor'), 'nyt-governor.json'),
    loadForecasts(),
  ]);

  // 같은 평가가 이전 실행에도 있었으면 처음 반영한 시각을 유지한다
  let prev = null;
  try { prev = existsSync(OUT) ? readJson(OUT) : null; } catch { /* 직전 파일이 깨졌으면 새로 시작 */ }
  const firstSeen = new Map();
  for (const r of prev?.races ?? []) {
    for (const [src, f] of Object.entries(r.forecasts)) {
      const e = f.history.at(-1);
      firstSeen.set(`${r.id}:${src}:${e.rating}:${e.label}`, e.ingestedAt);
    }
  }

  const { data, warnings } = assembleElection({ nytS, nytH, nytG, tables, baseline, members, roster, fetchedAt, firstSeen });

  // 상원·주지사 카운티별 결과 (피드를 못 찾으면 건너뛴다)
  const counties = {};
  for (const [json, slug, prefix] of [[nytS, 'sen-county-data', 'S'], [nytG, 'gov-county-data', 'G']]) {
    const url = countyFeedUrl(json, slug) ?? countyFeedUrl(nytH, slug);
    if (!url) { warnings.push(`${slug}: 피드 주소를 찾지 못함`); continue; }
    Object.assign(counties, countiesFromFeed(await get(url, `nyt-${slug}.json`), prefix));
  }

  // 이상하면 저장하지 않고 직전 파일을 그대로 둔다
  const problems = validateData(data, prev);
  if (problems.length) {
    throw new Error(['데이터 검사 실패 — 저장하지 않고 직전 파일을 유지합니다:', ...problems.slice(0, 10)].join('\n  '));
  }
  mkdirSync('public/data', { recursive: true });
  writeAtomic(OUT, JSON.stringify(data));
  writeAtomic(COUNTIES_OUT, JSON.stringify(counties));
  const by = (c) => data.races.filter((r) => r.chamber === c);
  const photos = data.races.flatMap((r) => r.result.candidates).filter((c) => c.photo).length;
  const called = data.races.filter((r) => r.result.status === 'called' || r.result.status === 'certified').length;
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
