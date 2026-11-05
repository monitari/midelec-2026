// Census 카운티 경계(cartographic 1:5m) → public/data/us-counties.json (TopoJSON)
// 코네티컷은 2022년부터 카운티 대신 계획 권역(09110 …)을 쓰므로 최신 Census 파일이어야 결과와 맞는다.
// 카운티 지도는 상원·주지사 상세에서 주 하나를 그릴 때만 불러온다.
// Usage: node scripts/build-counties.mjs <cb_2024_us_county_5m.zip>
import mapshaper from 'mapshaper';
import { statSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-counties.mjs <cb_2024_us_county_5m.zip>');
  process.exit(1);
}
const out = 'public/data/us-counties.json';
await mapshaper.runCommands([
  `-i "${src}" name=counties`,
  // 50개 주 + DC (영토 제외)
  `-filter "Number(STATEFP) <= 56"`,
  `-each "id=GEOID, name=NAME"`,
  `-filter-fields id,name`,
  `-simplify 12% weighted keep-shapes`,
  `-o "${out}" format=topojson id-field=id quantization=100000`,
].join(' '));
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} KB`);
