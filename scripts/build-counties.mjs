// us-atlas(Census 1:10m 카운티, 퍼블릭 도메인) → public/data/us-counties.json
// 카운티 지도는 상원·주지사 상세에서 주 하나를 그릴 때만 불러온다.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('us-atlas/counties-10m.json'), 'utf8'));
// 카운티 경계만 남긴다 (주·전국 외곽은 사이트의 다른 지도에 있음)
delete topo.objects.nation;
delete topo.objects.states;
const out = 'public/data/us-counties.json';
writeFileSync(out, JSON.stringify(topo));
console.log(`${out}: ${topo.objects.counties.geometries.length} counties, ${(statSync(out).size / 1024).toFixed(0)} KB`);
