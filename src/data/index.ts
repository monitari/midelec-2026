// 데이터 어댑터. scripts/fetch-election.mjs 가 결과(NYT·AP), 예측(Wikipedia 예측 표),
// 선거 전 현황을 합쳐 만든 JSON 을 불러온다. 다시 실행하면 새로고침 없이 최신 개표가 반영된다.
import type { ElectionData } from '../lib/types';

const MISSING = '선거 데이터 파일이 없어요. 터미널에서 npm run fetch:data 를 먼저 실행해 주세요.';

export async function loadElectionData(): Promise<ElectionData> {
  const res = await fetch('/data/election-2026.json', { cache: 'no-cache' });
  // 개발 서버는 없는 파일 요청에 index.html 을 돌려주므로 형식도 확인한다
  if (res.status === 404 || !res.headers.get('content-type')?.includes('json')) throw new Error(MISSING);
  if (!res.ok) throw new Error(`선거 데이터를 불러오지 못했어요 (${res.status})`);
  return res.json();
}
