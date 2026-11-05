# 2026 미국 중간선거 대시보드

지도를 중심으로 "어느 당이 얼마나 확보했고, 어디가 바뀌었으며, 예측과 얼마나 달랐는지"를 보는 선거 대시보드. Vite + React + TypeScript, 지도는 d3-geo.

```bash
npm install
npm run dev
```

**개표 결과는 보는 사람의 브라우저가 NYT 결과 JSON 을 직접 받아 화면에서 가공한다.** 사이트(배포본)에는 결과 데이터 사본이 없고, 5분마다(탭이 보일 때만) 새로 확인한다. 공급원이 형식을 바꾸거나 일부만 내려주면 저장 전 검사와 같은 기준으로 걸러 직전 화면을 유지한다.

오프라인 개발이나 화면 테스트는 로컬 사본으로 한다.

```bash
npm run fetch:data              # NYT 원본을 받아 검사 → public/data/election-2026.json, counties-2026.json (배포본에는 빠짐)
VITE_DATA=local npm run dev      # 로컬 사본으로 띄우기
npm run watch:data              # 5분마다 다시 받기
```

```bash
npm test             # 단위 테스트 (파서·저장 전 검사·정당 교체·예측 비교·다수당 판정·확대도 접기)
npm run test:e2e     # 실제로 눌러 보는 테스트 (설치된 Chrome 사용, 데스크톱·모바일)
npm run build
```

수집 스크립트와 화면은 같은 조립 코드(`scripts/lib/assemble.mjs`)와 같은 검사(선거 수, 상태 값, 승자 발표 수가 갑자기 줄었는지)를 쓴다.

## 배포 (GitHub Pages)

`main` 에 올리면 `.github/workflows/pages.yml` 이 테스트 → 빌드 → 배포한다. 저장소 설정의 Pages 소스는 **GitHub Actions**. 빌드는 상대 경로(`base: './'`)라 하위 경로(`/midelec-2026/`)에서도 동작한다.

## 구조

| 경로 | 역할 |
|---|---|
| `scripts/lib/assemble.mjs` | NYT 원본 + 예측 스냅숏 + 선거 전 현황 → 화면 데이터. 수집 스크립트와 브라우저가 함께 쓴다 |
| `src/data/index.ts` | 브라우저에서 NYT 원본을 받아 조립·검사 (`VITE_DATA=local` 이면 로컬 사본) |
| `scripts/fetch-election.mjs` | 같은 조립 코드로 로컬 사본 생성 (`--every <분>`, `--cache <폴더>`, `--refresh-forecasts`) |
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
| 결과 | The New York Times 결과 페이지 JSON (AP 집계·승자 판정) | **공식 API가 아니며 이 저장소·배포본에는 사본이 없다.** 보는 사람의 브라우저가 직접 받는다. 형식이 바뀌거나 막힐 수 있고, 상업적·대규모 서비스라면 AP Elections API 등 이용 계약된 공급원을 써야 한다. |
| 카운티 결과 | 같은 NYT 피드의 카운티 단위 | 알래스카는 주 하원 선거구 단위로 집계해 카운티 지도를 그리지 않는다. 코네티컷은 카운티 대신 계획 권역으로 그린다. |
| 예측 | Wikipedia 2026 선거 예측 표 (Cook, Inside Elections, Sabato, DDHQ, RCP, Fox) | 선거 직전 최종 평가만 있고 등급 변경 이력은 없다. 하원은 경합 목록에 없는 선거구를 "모든 기관 안정권"으로 간주한다(표 머리말 기준). |
| 경계 | Census 119대 지도(cb_2024, 1:500k) + 2026 TIGER/Line 120대 경계, 카운티는 Census cartographic 1:5m(cb_2024_us_county) | 재조정 주만 TIGER로 교체하고 1:500k 육지 윤곽으로 잘라 쓴다. |
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
curl -LO https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip
npm run build:counties -- cb_2024_us_county_5m.zip

# 현직 의원
curl -LO https://unitedstates.github.io/congress-legislators/legislators-current.json
npm run build:members -- legislators-current.json

# 예측 스냅숏을 다시 만들 때만 (선거 후 편집이 섞일 수 있음)
node scripts/fetch-election.mjs --refresh-forecasts
```

## 라이선스

**코드**는 [MIT](LICENSE). **데이터 파일**은 각자의 조건을 따른다.

| 파일 | 출처 | 조건 |
|---|---|---|
| `public/data/us-geo.json`, `us-counties.json` | U.S. Census Bureau | 퍼블릭 도메인 (미 정부 저작물) |
| `scripts/data/forecasts-final.json` | Wikipedia 2026 선거 예측 표 (각 기관 평가의 전사본) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — 출처 표시, 같은 조건으로 배포 |
| `scripts/data/house-members.json`, `congress-roster.json` | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | CC0 (퍼블릭 도메인) |
| `scripts/data/baseline.json` | 공개 정보를 정리 | MIT (코드와 같음) |
| 후보 사진 (외부 링크, 저장소에 없음) | [unitedstates/images](https://github.com/unitedstates/images) | 퍼블릭 도메인 |

**NYT 결과 데이터**는 저장소와 배포본에 넣지 않는다. 수집 스크립트나 사이트로 NYT 데이터를 받는 것은 각자 [NYT 이용 약관](https://help.nytimes.com/hc/en-us/articles/115014893428-Terms-of-Service)을 따를 책임이 있다.
