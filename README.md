# 2026 미국 중간선거 대시보드

지도를 중심으로 "어느 당이 얼마나 확보했고, 어디가 바뀌었으며, 예측과 얼마나 달랐는지"를 보는 선거 대시보드. Vite + React + TypeScript, 지도는 d3-geo.

```bash
npm install
npm run fetch:data   # 최신 개표 → public/data/election-2026.json, counties-2026.json
npm run dev
```

개표가 진행되는 동안에는 `npm run watch:data`(5분마다 다시 받기)를 켜 두면 화면이 1분 안에 따라 갱신된다. 수집이 15분 넘게 멈추면 상단 배지가 경고로 바뀐다.

```bash
npm test             # 단위 테스트 (파서·저장 전 검사·정당 교체·예측 비교·다수당 판정·확대도 접기)
npm run test:e2e     # 실제로 눌러 보는 테스트 (설치된 Chrome 사용, 데스크톱·모바일)
npm run build
```

수집 스크립트는 저장 전에 데이터를 검사한다(선거 수, 상태 값, 승자 발표 수가 갑자기 줄었는지). 이상하면 저장하지 않고 직전 파일을 그대로 둔다.

## 구조

| 경로 | 역할 |
|---|---|
| `scripts/fetch-election.mjs` | 결과·예측·선거 전 현황·후보 사진·카운티 결과를 합쳐 `public/data/*.json` 생성 (`--every <분>`, `--cache <폴더>`, `--refresh-forecasts`) |
| `scripts/lib/parse.mjs` | 원본(Wikipedia 위키텍스트, NYT JSON) 파싱 함수 — 테스트 대상 |
| `scripts/build-geo.mjs` · `build-counties.mjs` | Census 경계 → `public/data/us-geo.json` · `us-counties.json` |
| `scripts/build-members.mjs` | 현직 의원 → `house-members.json`, `congress-roster.json` |
| `scripts/data/forecasts-final.json` | **선거 직전 예측을 고정한 스냅숏.** 선거 후 Wikipedia 표가 바뀌어도 '예측 ↔ 결과'가 흔들리지 않게 이 파일만 쓴다 |
| `src/lib/classify.ts` | 모드·색상 기준별 지도 분류, 유지/교체 판정, 예측 고정 시점 비교, 2024 대선 대비 변화 |
| `src/lib/tally.ts` · `story.ts` | 의석 집계, 다수당 판정 시점, 한 줄 요약, 개표 흐름 |
| `tests/` · `e2e/` | vitest 단위 테스트 · Playwright 화면 테스트 |

화면 상태는 주소 해시에 반영된다 (예: `#c=house&m=result&u=district&sel=H-NY-17`). `/` 키로 검색.

## 데이터 출처

| 구분 | 출처 | 비고 |
|---|---|---|
| 결과 | The New York Times 결과 페이지 JSON (AP 집계·승자 판정) | **공식 API가 아님.** 개인·개발용으로만 쓰고, 공개 서비스에는 AP Elections API 등 이용 계약된 공급원으로 바꿔야 한다. 이 데이터로 만든 파일은 저장소에 넣지 않는다. |
| 카운티 결과 | 같은 NYT 피드의 카운티 단위 | 알래스카(주 하원 선거구 단위)와 코네티컷(카운티 대신 계획 권역)은 카운티 지도를 그리지 않는다. |
| 예측 | Wikipedia 2026 선거 예측 표 (Cook, Inside Elections, Sabato, DDHQ, RCP, Fox) | 선거 직전 최종 평가만 있고 등급 변경 이력은 없다. 하원은 경합 목록에 없는 선거구를 "모든 기관 안정권"으로 간주한다(표 머리말 기준). |
| 경계 | Census 119대 지도(cb_2024, 1:500k) + 2026 TIGER/Line 120대 경계, 카운티는 us-atlas(Census 1:10m) | 재조정 주만 TIGER로 교체하고 1:500k 육지 윤곽으로 잘라 쓴다. |
| 후보 사진 | [unitedstates/images](https://github.com/unitedstates/images) 연방 의회 공식 사진 | 미 정부 저작물(퍼블릭 도메인). 현직 연방 의원인 후보만 있고, 나머지는 이니셜. 같은 주·같은 성·같은 이름(애칭 포함)일 때만 연결한다. |
| 선거 전 현황 | unitedstates/congress-legislators, 공개 정보 정리 | 현직 출마 여부는 결과 데이터의 투표용지 현직 표시를 따른다. |

로고와 파비콘은 이 사이트용으로 새로 그렸다. 정당 공식 로고는 상표라 쓰지 않는다.

### 2026년 새 경계

AL·CA·FL·LA·NC·OH·TN·TX·UT. 이 주들의 선거구는 같은 번호의 이전 선거구와 비교해 정당 교체를 판정하지 않는다(결과 공급원도 같은 기준). 대신 새 경계 기준 2024 대선 득표차를 참고로 보여준다.
미주리는 Census 2026 파일에 새 경계가 들어 있지만 법원이 2026년 사용을 막아 기존 경계로 치렀다(MO-05 결과로 확인). 그래서 TIGER로 교체하지 않는다.

### 원본 다시 만들기

```bash
# 경계 (재조정 주의 TIGER 파일만 넘긴다)
curl -LO https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip
for f in 01 06 12 22 37 39 47 48 49; do curl -LO https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_${f}_cd120.zip; done
npm run build:geo -- cb_2024_us_cd119_500k.zip tl_2026_*_cd120.zip
npm run build:counties

# 현직 의원
curl -LO https://unitedstates.github.io/congress-legislators/legislators-current.json
npm run build:members -- legislators-current.json

# 예측 스냅숏을 다시 만들 때만 (선거 후 편집이 섞일 수 있음)
node scripts/fetch-election.mjs --refresh-forecasts
```
