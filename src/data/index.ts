// 데이터 어댑터. 보는 사람의 브라우저가 NYT 결과 JSON 을 직접 받아, 수집 스크립트와 같은 조립 코드
// (scripts/lib/assemble.mjs)로 화면 데이터를 만든다. 사이트에는 결과 데이터 사본을 두지 않는다.
// 예측 스냅숏·선거 전 현황처럼 우리가 만든(또는 공개 라이선스인) 자료만 함께 배포한다.
//
// VITE_DATA=local 로 실행하면 npm run fetch:data 가 만든 public/data/*.json 을 쓴다 (오프라인 개발용).
import type { CountyResults, ElectionData } from '../lib/types';
import { NYT_RESULTS, assembleElection as assembleJs, countiesFromFeed, countyFeedUrl } from '../../scripts/lib/assemble.mjs';
import { validateData } from '../../scripts/lib/parse.mjs';

// 공용 JS 모듈의 입력은 원본 JSON 그대로라 타입을 느슨하게 둔다 (결과는 validateData 로 검사)
const assembleElection = assembleJs as unknown as (input: Record<string, unknown>) => { data: unknown; warnings: string[] };

const BASE = import.meta.env.BASE_URL;
const LOCAL_ONLY = import.meta.env.VITE_DATA === 'local';

async function getJson<T>(url: string): Promise<T> {
  // no-cache: 매번 바뀌었는지 확인하되, 안 바뀌었으면 304 로 다시 받지 않는다
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

// 배포에 함께 들어가는 정적 자료 (첫 로딩 때 한 번)
let statics: Promise<{
  baseline: unknown; members: unknown; roster: unknown;
  forecasts: { savedAt: string; tables: unknown };
}> | null = null;
function loadStatics() {
  statics ??= Promise.all([
    import('../../scripts/data/baseline.json'),
    import('../../scripts/data/house-members.json'),
    import('../../scripts/data/congress-roster.json'),
    import('../../scripts/data/forecasts-final.json'),
  ]).then(([b, m, r, f]) => ({ baseline: b.default, members: m.default, roster: r.default, forecasts: f.default }));
  return statics;
}

/** 카운티 피드 주소 (결과 JSON 안에 들어 있다) */
const feeds: { S?: string; G?: string } = {};

async function loadLive(prev: ElectionData | null): Promise<ElectionData> {
  const [nytS, nytH, nytG, st] = await Promise.all([
    getJson<{ races: unknown[] }>(NYT_RESULTS('senate')),
    getJson<{ races: unknown[] }>(NYT_RESULTS('house')),
    getJson<{ races: unknown[] }>(NYT_RESULTS('governor')),
    loadStatics(),
  ]);
  feeds.S = countyFeedUrl(nytS, 'sen-county-data') ?? countyFeedUrl(nytH, 'sen-county-data');
  feeds.G = countyFeedUrl(nytG, 'gov-county-data') ?? countyFeedUrl(nytH, 'gov-county-data');
  const { data } = assembleElection({
    nytS, nytH, nytG,
    tables: st.forecasts.tables,
    baseline: st.baseline,
    members: st.members,
    roster: st.roster,
    fetchedAt: new Date().toISOString(),
    // '처음 반영' = 예측 스냅숏을 만든 시각
    ingestedDefault: st.forecasts.savedAt,
  });
  // 공급원 형식이 바뀌었거나 일부만 내려왔으면 화면을 바꾸지 않는다 (직전 화면 유지)
  const problems = validateData(data, prev);
  if (problems.length) throw new Error(`개표 데이터 형식이 예상과 달라요 (${problems[0]})`);
  return data as ElectionData;
}

async function loadLocal(): Promise<ElectionData> {
  try {
    return await getJson<ElectionData>(`${BASE}data/election-2026.json`);
  } catch {
    throw new Error('선거 데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}

export async function loadElectionData(prev: ElectionData | null = null): Promise<ElectionData> {
  if (LOCAL_ONLY) return loadLocal();
  try {
    return await loadLive(prev);
  } catch (e) {
    // 개발 중에는 수집 스크립트가 만든 로컬 파일로 이어서 볼 수 있다 (배포본에는 이 파일이 없다)
    if (import.meta.env.DEV) {
      try { return await loadLocal(); } catch { /* 아래에서 원래 오류를 알린다 */ }
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

const countyCache: Partial<Record<'S' | 'G', Promise<CountyResults>>> = {};

/** 상원(S)·주지사(G) 카운티별 결과. 카운티 지도를 처음 열 때 한 번 받는다 */
export function loadCountyResults(prefix: 'S' | 'G'): Promise<CountyResults> {
  countyCache[prefix] ??= (async () => {
    if (!LOCAL_ONLY && feeds[prefix]) {
      try {
        return countiesFromFeed(await getJson(feeds[prefix]!), prefix) as CountyResults;
      } catch { /* 로컬 파일로 */ }
    }
    return getJson<CountyResults>(`${BASE}data/counties-2026.json`).catch(() => ({}));
  })();
  countyCache[prefix]!.catch(() => { delete countyCache[prefix]; });
  return countyCache[prefix]!;
}
