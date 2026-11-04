export type Party = 'D' | 'R' | 'I' | 'O';
export type Chamber = 'senate' | 'house' | 'governor';
export type Mode = 'result' | 'forecast' | 'baseline' | 'compare';
export type Unit = 'state' | 'district';

/** 개표 전 → 개표 중 → 승자 발표 → 공식 인증. 결선(runoff)은 승자 없이 상위 후보가 결선에 진출한 상태. 선두는 승자가 아니다. */
export type CallStatus = 'pending' | 'counting' | 'runoff' | 'called' | 'certified';

/** 사이트 공통 7단계 표시 체계. 출처의 원래 등급은 ForecastEntry.label 에 보존한다. */
export type Rating = 'safeD' | 'likelyD' | 'leanD' | 'tossup' | 'leanR' | 'likelyR' | 'safeR';

export interface Candidate {
  name: string;
  party: Party;
  /** 공급원 원래 정당 코드 (DEM, GOP, LIB, IND …) */
  partyCode: string;
  votes: number;
  incumbent?: boolean;
  /** 현직 연방 의원 공식 사진 (퍼블릭 도메인). 없으면 이니셜 */
  photo?: string;
}

export interface RaceResult {
  status: CallStatus;
  /** 예상 총투표 대비 개표율(%). 무투표 당선 등으로 집계가 없으면 null */
  expectedPct: number | null;
  /** 득표순 정렬 */
  candidates: Candidate[];
  /** called / certified 일 때만 존재 */
  winner?: Party;
  winnerName?: string;
  calledAt?: string;
  calledBy?: string;
  /** 결선 진출자와 진출 발표 시각 */
  runoff?: string[];
  runoffAt?: string;
  uncontested?: boolean;
  rankedChoice?: boolean;
  updatedAt: string;
  /** 공급원 원문 페이지 */
  url?: string;
}

export interface ForecastEntry {
  rating: Rating;
  /** 출처 원문 등급 (예: "Lean R", "Tilt D") */
  label: string;
  /** 평가 기준일 */
  publishedAt: string;
  /** 사이트 반영 시각 */
  ingestedAt: string;
  /** 경합 목록에 없어 안정권으로 간주한 경우 */
  implied?: boolean;
}

export interface RaceForecast {
  /** 시간순(오래된 것 → 최신) */
  history: ForecastEntry[];
  url: string;
}

export interface Incumbent {
  name: string;
  party: Party;
  /** false = 불출마(또는 경선 탈락)로 열린 선거 */
  running: boolean;
}

export interface Race {
  id: string;
  chamber: Chamber;
  state: string;
  /** 하원 전용. 0 = 주 전체 단일 선거구(at-large) */
  district?: number;
  kind: 'regular' | 'special';
  /** 비고 (선거구 위치 설명 등) */
  description?: string;
  /** 현재 자리 상태: 재직자 있음 / 실제 공석. 은퇴 발표만으로는 공석이 아니다. */
  seatStatus: 'occupied' | 'vacant';
  incumbent?: Incumbent;
  /** 선거 전 보유 정당 (공석이면 마지막 보유 정당). 경계가 바뀐 선거구는 null — 같은 번호의 이전 선거구와 비교하지 않는다 */
  heldBy: Party | null;
  /** 이번 선거에서 경계가 바뀐 선거구 */
  boundaryChanged?: boolean;
  /** 현재(이번 선거) 경계 기준 2024 대선 득표율 차(민주 − 공화, %p) */
  pres2024?: number;
  /** sourceId → 평가 이력. 키가 없으면 해당 출처의 예측 없음 */
  forecasts: Record<string, RaceForecast>;
  result: RaceResult;
}

export interface ForecastSource {
  id: string;
  name: string;
  url: string;
  /** 출처 고유 등급 체계 설명 */
  scaleNote: string;
}

export interface ElectionData {
  meta: {
    isSample: boolean;
    /** 공급원 데이터의 마지막 갱신 시각 */
    generatedAt: string;
    /** 사이트가 데이터를 가져온 시각 */
    fetchedAt: string;
    electionDay: string;
    /** 예측 ↔ 결과 비교에 쓰는 고정 시점. 이 시각 이후 발표된 평가는 비교에서 제외 */
    forecastFreezeAt: string;
    resultSource: { name: string; url: string; note: string };
    forecastSource: { name: string; url: string; note: string };
    boundary: { name: string; version: string; url: string; note: string };
    rosterSource: { name: string; url: string };
    photoSource?: { name: string; url: string };
  };
  forecastSources: ForecastSource[];
  races: Race[];
  /** 선거 전 상원 의석 구성 (주별 2석) */
  senateSeats: Record<string, [Party, Party]>;
  /** 무소속 상원의원의 의회 내 연대 */
  senateCaucus: Record<string, 'D' | 'R'>;
  /** 선거 전 주지사 */
  governors: Record<string, { name: string; party: Party }>;
  /** 선거 전 하원 구성 */
  houseBefore: Record<Party | 'vacant', number>;
  /** 이번 선거 적용 경계가 바뀐 주 */
  redistrictedStates: string[];
}

export type Selection =
  | { type: 'race'; id: string }
  | { type: 'state'; state: string }
  | null;

/** 카운티별 결과: raceId → 카운티 FIPS(5자리) → 예상 개표율, 총 득표, 상위 두 후보 [정당, 득표] */
export type CountyResults = Record<string, Record<string, { e: number | null; t: number; c: [Party, number][] }>>;
