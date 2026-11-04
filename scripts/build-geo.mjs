// Census 의회 선거구 경계 → public/data/us-geo.json (TopoJSON)
//
// Usage: node scripts/build-geo.mjs <cb_2024_us_cd119_500k.zip> [tl_2026_<fips>_cd120.zip ...]
//
//   - 기본: 119대 의회 지도(cartographic 1:500k, 해안선 반영)
//   - 2026년에 경계를 새로 그은 주: TIGER/Line 2026 120대 경계로 교체하고, 같은 주의 1:500k 육지 윤곽으로 잘라
//     물 위로 뻗은 부분을 없앤다. 넘겨준 TIGER 파일의 주만 교체한다.
// Layers: districts (id = GEOID, st = state FIPS), states (districts 를 합쳐 만들어 경계가 정확히 맞물린다)
import mapshaper from 'mapshaper';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const [base, ...tiger] = process.argv.slice(2);
if (!base) {
  console.error('Usage: node scripts/build-geo.mjs <cb_2024_us_cd119_500k.zip> [tl_2026_<fips>_cd120.zip ...]');
  process.exit(1);
}
const fips = tiger.map((f) => basename(f).match(/tl_\d{4}_(\d{2})_cd\d+/)?.[1]);
if (fips.some((f) => !f)) throw new Error('TIGER 파일 이름은 tl_<year>_<fips>_cd<session>.zip 형식이어야 합니다');
const replaced = `[${fips.map((f) => `'${f}'`).join(',')}]`;
const out = 'public/data/us-geo.json';
const SIMPLIFY = process.env.SIMPLIFY ?? '3%';
const tmp = mkdtempSync(join(tmpdir(), 'midelec-geo-'));
const merged = join(tmp, 'districts.json');
const q = (s) => `"${s}"`;

const cmds = [
  `-i ${[base, ...tiger].map(q).join(' ')} combine-files snap`,
  `-rename-layers old${fips.map((f) => `,n${f}`).join('')}`,
  // 50개 주 + DC (영토 제외)
  `-filter target=old "Number(STATEFP) <= 56"`,
  `-each target=old "id=GEOID, st=STATEFP"`,
];
if (fips.length) {
  const newLayers = fips.map((f) => `n${f}`).join(',');
  cmds.push(
    `-filter target=old "${replaced}.indexOf(st) >= 0" + name=land`,
    `-dissolve target=land st`,
    `-filter target=old "${replaced}.indexOf(st) < 0"`,
    `-merge-layers target=${newLayers} name=fresh force`,
    `-each target=fresh "id=GEOID, st=STATEFP"`,
    `-clip target=fresh land remove-slivers`,
    `-merge-layers target=old,fresh name=districts force`,
  );
} else {
  cmds.push(`-rename-layers districts target=old`);
}
cmds.push(
  `-filter-fields target=districts id,st`,
  `-o ${q(merged)} format=geojson target=districts`,
);
// 1단계: 선거구 합치기. 2단계: 합친 결과만 새로 읽어 단순화한다
// (같은 데이터셋에 남은 원본 경계까지 단순화 비율 계산에 들어가지 않도록)
await mapshaper.runCommands(cmds.join(' '));
await mapshaper.runCommands([
  `-i ${q(merged)} name=districts snap`,
  // 경계를 자를 때 생긴 틈·조각과 작은 호수 구멍을 정리
  `-clean min-gap-area=20km2`,
  `-filter-islands min-area=2km2 remove-empty`,
  `-simplify ${SIMPLIFY} weighted keep-shapes`,
  `-dissolve st + name=states`,
  `-o ${q(out)} format=topojson quantization=100000 target=districts,states`,
].join(' '));
rmSync(tmp, { recursive: true, force: true });
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} KB${fips.length ? ` (2026 경계: ${fips.join(', ')})` : ''}`);
