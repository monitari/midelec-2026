# 2026 미국 중간선거 대시보드

지도를 중심으로 "어느 당이 얼마나 확보했고, 어디가 바뀌었으며, 예측과 얼마나 달랐는지"를 보는 선거 대시보드. Vite + React + TypeScript, 지도는 d3-geo.

```bash
npm install
npm run fetch:data   # 최신 개표·예측을 public/data/election-2026.json 으로
npm run dev
```

화면은 1분마다 `election-2026.json` 을 다시 확인하므로, 개표가 진행되는 동안 `npm run fetch:data` 만 다시 돌리면 된다.

## 구조

| 경로 | 역할 |
|---|---|
| `scripts/fetch-election.mjs` | 결과·예측·선거 전 현황을 합쳐 `public/data/election-2026.json` 생성 |
| `scripts/build-geo.mjs` | Census 경계 → `public/data/us-geo.json` |
| `scripts/data/baseline.json` | 선거 전 상원 의석·주지사, 경계가 바뀐 주 |
| `scripts/data/house-members.json` | 선거 전 하원 의원 (`build-members.mjs` 로 생성) |
| `src/lib/types.ts` | 데이터 모델 (현재 자리 상태 / 이번 선거 구도 / 기존 보유 정당을 따로 관리) |
| `src/lib/classify.ts` | 모드·색상 기준별 지도 분류, 유지/교체 판정, 예측 고정 시점 비교, 필터 |
| `src/lib/tally.ts` | 상단 의석 집계 (상원 비개선 의석, 선거 없는 주 포함) |
| `src/data/index.ts` | 데이터 어댑터 |

화면 상태는 주소 해시에 반영된다 (예: `#c=house&m=result&u=district&sel=H-NY-17`).

## 데이터 출처

| 구분 | 출처 | 비고 |
|---|---|---|
| 결과 | The New York Times 결과 페이지 JSON (AP 집계·승자 판정) | **공식 API가 아님.** 개인·개발용으로만 쓰고, 공개 서비스에는 AP Elections API 등 이용 계약된 공급원으로 교체해야 한다. |
| 예측 | Wikipedia 2026 선거 예측 표 (Cook, Inside Elections, Sabato, DDHQ, RCP, Fox) | 선거 직전 최종 평가만 있고 등급 변경 이력은 없다. 하원은 경합 목록에 없는 선거구를 "모든 기관 안정권"으로 간주한다(표 머리말 기준). |
| 경계 | Census 119대 지도(cb_2024, 1:500k) + 2026 TIGER/Line 120대 경계 | 재조정 주만 TIGER로 교체하고 1:500k 육지 윤곽으로 잘라 쓴다. |
| 선거 전 현황 | unitedstates/congress-legislators, 공개 정보 정리 | 현직 출마 여부는 결과 데이터의 투표용지 현직 표시를 따른다. |

### 2026년 새 경계

AL·CA·FL·LA·NC·OH·TN·TX·UT. 이 주들의 선거구는 같은 번호의 이전 선거구와 비교해 정당 교체를 판정하지 않는다(결과 공급원도 같은 기준). 대신 새 경계 기준 2024 대선 득표차를 참고로 보여준다.
미주리는 Census 2026 파일에 새 경계가 들어 있지만 법원이 2026년 사용을 막아 기존 경계로 치렀다(MO-05 결과로 확인). 그래서 TIGER로 교체하지 않는다.

### 원본 다시 만들기

```bash
# 경계 (재조정 주의 TIGER 파일만 넘긴다)
curl -LO https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip
for f in 01 06 12 22 37 39 47 48 49; do curl -LO https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_${f}_cd120.zip; done
npm run build:geo -- cb_2024_us_cd119_500k.zip tl_2026_*_cd120.zip

# 하원 현직
curl -LO https://unitedstates.github.io/congress-legislators/legislators-current.json
npm run build:members -- legislators-current.json

# 결과·예측 (원본을 캐시해 두고 재사용하려면 --cache <폴더>)
npm run fetch:data
```
