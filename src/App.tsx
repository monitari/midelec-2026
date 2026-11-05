import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chamber, ElectionData, Mode, Race, Selection, Unit } from './lib/types';
import { loadElectionData } from './data';
import { loadGeo, type GeoData } from './lib/geo';
import {
  BASES, CHAMBER_LABEL, categoryOrder, classify, estimatedFlip, isDecided, marginPts, matchesFilters, outcome, outcomeText, raceTitle,
  type Basis, type Category, type ClassifyCtx, type FilterKey,
} from './lib/classify';
import { summarize } from './lib/tally';
import { fmtKst } from './lib/format';
import { STATES, stateName } from './lib/states';
import { SeatSummary } from './components/SeatSummary';
import { MapView, type Glyph } from './components/MapView';
import { Filters, Legend } from './components/Legend';
import { EmptyDetail, RaceDetail, StateDetail } from './components/DetailPanel';
import { KeyRaces, RaceTable, RecentCalls } from './components/RaceLists';
import { PatternDefs, Segmented, Select, Toggle } from './components/ui';
import { ChamberSwitch, Logo, Story } from './components/Overview';
import { SearchBox } from './components/SearchBox';
import { ShareButton, StatusBadge, ThemeToggle } from './components/Chrome';
import { CallTimeline } from './components/CallTimeline';
import { Flips } from './components/Flips';
import { timeline } from './lib/story';
import { BottomSheet } from './components/BottomSheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BootSkeleton, Toast } from './components/Feedback';

const MODES: { id: Mode; label: string }[] = [
  { id: 'result', label: '결과' },
  { id: 'forecast', label: '예측' },
  { id: 'baseline', label: '선거 전 현황' },
  { id: 'compare', label: '예측 ↔ 결과' },
];
const STATE_ABBRS = Object.values(STATES).map((s) => s.abbr).filter((a) => a !== 'DC');
const DEFAULT_BASIS: Record<Mode, Basis> = { result: 'party', forecast: 'rating', baseline: 'held', compare: 'delta' };

function readHash(data: ElectionData) {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const pick = <T extends string>(v: string | null, ok: readonly T[], fallback: T): T =>
    ok.includes(v as T) ? (v as T) : fallback;
  const mode = pick(p.get('m'), MODES.map((m) => m.id), 'result');
  const sel = p.get('sel');
  let selection: Selection = null;
  const selRace = sel ? data.races.find((r) => r.id === sel) : undefined;
  if (sel?.startsWith('state:')) selection = { type: 'state', state: sel.slice(6) };
  else if (selRace) selection = { type: 'race', id: selRace.id };
  return {
    chamber: selRace?.chamber ?? pick(p.get('c'), ['senate', 'house', 'governor'] as const, 'house'),
    mode,
    unit: selRace?.chamber === 'house' ? 'district' as const : pick(p.get('u'), ['state', 'district'] as const, 'district'),
    basis: BASES[mode].some((b) => b.id === p.get('b')) ? (p.get('b') as Basis) : undefined,
    source: pick(p.get('s'), data.forecastSources.map((s) => s.id), data.forecastSources[0].id),
    selection,
  };
}

function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** NYT 원본(하원 약 10MB)을 보는 사람마다 받으므로 너무 자주 받지 않는다. 바뀌지 않았으면 304 로 끝난다 */
const REFRESH_MS = 5 * 60_000;
/** 새로 발표된 결과의 NEW 표시를 유지하는 시간 */
const FRESH_MS = 5 * 60_000;


const decidedStatus = (r: Race) => r.result.status === 'called' || r.result.status === 'certified';

export default function App() {
  const [data, setData] = useState<ElectionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 직전 갱신 이후 새로 승자가 발표된 선거 */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ id: number; text: string; tone?: 'warn' } | null>(null);
  const prevRef = useRef<ElectionData | null>(null);
  useEffect(() => {
    if (!fresh.size) return;
    const t = window.setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => window.clearTimeout(t);
  }, [fresh]);

  useEffect(() => {
    let alive = true;
    let lastLoad = 0;
    const load = () => { lastLoad = Date.now(); return loadElectionData(prevRef.current).then(
      (d) => {
        if (!alive) return;
        setError(null);
        const prev = prevRef.current;
        if (prev?.meta.fetchedAt === d.meta.fetchedAt) return;
        prevRef.current = d;
        if (prev) {
          const was = new Map(prev.races.map((r) => [r.id, decidedStatus(r)]));
          const newly = d.races.filter((r) => decidedStatus(r) && !was.get(r.id));
          if (newly.length) {
            setFresh(new Set(newly.map((r) => r.id)));
            setToast({ id: Date.now(), text: `새로 승자 발표 ${newly.length}곳 · ${raceTitle(newly[0])}${newly.length > 1 ? ` 외 ${newly.length - 1}곳` : ''}` });
          }
        }
        setData(d);
      },
      (e: Error) => {
        if (!alive) return;
        setError(e.message);
        // 이미 화면이 있으면 마지막 데이터를 그대로 두고 알리기만 한다
        if (prevRef.current) setToast({ id: Date.now(), text: '새 데이터를 불러오지 못했어요. 마지막 데이터로 보여주는 중이에요.', tone: 'warn' });
      },
    ); };
    load();
    // 탭이 보일 때만 주기적으로 다시 받고, 오래 숨겨 뒀다 돌아오면 바로 받는다
    const t = window.setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden && Date.now() - lastLoad > REFRESH_MS) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  if (!data) return error ? <div className="boot">{error}</div> : <BootSkeleton />;
  return (
    <>
      <Dashboard data={data} fresh={fresh} />
      {toast && <Toast key={toast.id} tone={toast.tone} onDone={() => setToast(null)}>{toast.text}</Toast>}
    </>
  );
}

function Dashboard({ data, fresh }: { data: ElectionData; fresh: Set<string> }) {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [geoError, setGeoError] = useState(false);
  useEffect(() => { loadGeo().then(setGeo, () => setGeoError(true)); }, []);

  const [init] = useState(() => readHash(data));
  const [chamber, setChamber] = useState<Chamber>(init.chamber);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [houseUnit, setHouseUnit] = useState<Unit>(init.unit);
  const [basisByMode, setBasisByMode] = useState<Record<Mode, Basis>>(() => ({
    ...DEFAULT_BASIS, ...(init.basis ? { [init.mode]: init.basis } : {}),
  }));
  const [source, setSource] = useState(init.source);
  const [includeLeader, setIncludeLeader] = useState(false);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(init.selection);
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const mapCardRef = useRef<HTMLDivElement>(null);

  const unit: Unit = chamber === 'house' ? houseUnit : 'state';
  const basis = basisByMode[mode];

  // 보고 있는 화면을 링크로 공유할 수 있게 주소에 반영
  useEffect(() => {
    const p = new URLSearchParams({ c: chamber, m: mode });
    if (chamber === 'house') p.set('u', houseUnit);
    if (basis !== DEFAULT_BASIS[mode]) p.set('b', basis);
    if (source !== data.forecastSources[0].id) p.set('s', source);
    if (selection) p.set('sel', selection.type === 'race' ? selection.id : `state:${selection.state}`);
    history.replaceState(null, '', `#${p}`);
  }, [chamber, mode, houseUnit, basis, source, selection, data]);
  const freezeAt = data.meta.forecastFreezeAt;
  const ctx: ClassifyCtx = useMemo(() => ({ basis, source, freezeAt, includeLeader }), [basis, source, freezeAt, includeLeader]);

  // ── 선거 단위 색인 ──
  const races = useMemo(() => data.races.filter((r) => r.chamber === chamber), [data, chamber]);
  const raceById = useMemo(() => new Map(data.races.map((r) => [r.id, r])), [data]);
  const racesByState = useMemo(() => {
    const m = new Map<string, Race[]>();
    for (const r of races) m.set(r.state, [...(m.get(r.state) ?? []), r]);
    for (const list of m.values()) list.sort((a, b) => (a.kind === b.kind ? (a.district ?? 0) - (b.district ?? 0) : a.kind === 'regular' ? -1 : 1));
    return m;
  }, [races]);
  const districtKey = (r: Race) => `${r.state}-${String(r.district).padStart(2, '0')}`;
  const raceByDistrict = useMemo(() => new Map(races.filter((r) => r.chamber === 'house').map((r) => [districtKey(r), r])), [races]);

  // ── 분류 ──
  const raceCat = useMemo(() => new Map(races.map((r) => [r.id, classify(r, ctx)])), [races, ctx]);
  const noneCat = useMemo(() => classify(undefined, ctx), [ctx]);
  const racesOfRegion = useCallback((key: string): Race[] => {
    if (unit === 'district') {
      const r = raceByDistrict.get(key);
      return r ? [r] : [];
    }
    return racesByState.get(key) ?? [];
  }, [unit, raceByDistrict, racesByState]);

  const categoryOf = useCallback((key: string): Category => {
    const r = racesOfRegion(key)[0];
    return r ? raceCat.get(r.id)! : noneCat;
  }, [racesOfRegion, raceCat, noneCat]);

  const passes = useCallback((r: Race) =>
    matchesFilters(r, filters, source, freezeAt) && (!focus || raceCat.get(r.id)!.key === focus),
  [filters, source, freezeAt, focus, raceCat]);

  const dimmed = useCallback((key: string) => {
    if (!filters.size && !focus) return false;
    const rs = racesOfRegion(key);
    if (!rs.length) return !(focus === 'none' && !filters.size);
    return !rs.some(passes);
  }, [filters, focus, racesOfRegion, passes]);

  // 하원 주별 보기: 주 전체를 한 색으로 칠하지 않고 의석 막대로 요약
  const glyphs = useMemo(() => {
    if (!(chamber === 'house' && unit === 'state')) return undefined;
    const order = categoryOrder(basis);
    const out: Record<string, Glyph> = {};
    for (const [st, list] of racesByState) {
      const counts = new Map<string, { value: number; cat: Category }>();
      for (const r of list) {
        const c = raceCat.get(r.id)!;
        counts.set(c.key, { value: (counts.get(c.key)?.value ?? 0) + 1, cat: c });
      }
      out[st] = {
        segments: [...counts].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
          .map(([key, v]) => ({ key, value: v.value, fill: v.cat.fill })),
      };
    }
    return out;
  }, [chamber, unit, basis, racesByState, raceCat]);

  // ── 범례 ──
  const legend = useMemo(() => {
    const counts = new Map<string, { cat: Category; count: number }>();
    const add = (c: Category) => counts.set(c.key, { cat: c, count: (counts.get(c.key)?.count ?? 0) + 1 });
    if (chamber === 'house') races.forEach((r) => add(raceCat.get(r.id)!));
    else STATE_ABBRS.forEach((st) => add(categoryOf(st)));
    const order = categoryOrder(basis);
    return [...counts.values()]
      .sort((a, b) => order.indexOf(a.cat.key) - order.indexOf(b.cat.key))
      .map(({ cat, count }) => ({ ...cat, count }));
  }, [chamber, races, raceCat, categoryOf, basis]);

  const summary = useMemo(() => summarize(data, chamber, races, mode, source), [data, chamber, races, mode, source]);
  const listRaces = useMemo(() => races.filter((r) => matchesFilters(r, filters, source, freezeAt)), [races, filters, source, freezeAt]);

  // ── 선택 ──
  const selectedRace = selection?.type === 'race' ? raceById.get(selection.id) : undefined;
  const selectedKey = selectedRace
    ? selectedRace.chamber === 'house' ? (unit === 'district' ? districtKey(selectedRace) : null) : selectedRace.state
    : selection?.type === 'state' && unit === 'state' ? selection.state : null;
  const selectedState = selectedRace?.chamber === 'house' && unit === 'state'
    ? selectedRace.state
    : selection?.type === 'state' && unit === 'district' ? selection.state : null;

  const onMapSelect = useCallback((key: string) => {
    if (unit === 'district') {
      const r = raceByDistrict.get(key);
      if (r) setSelection({ type: 'race', id: r.id });
      return;
    }
    const list = racesByState.get(key);
    if (chamber !== 'house' && list?.length) setSelection({ type: 'race', id: list[0].id });
    else if (key !== 'DC') setSelection({ type: 'state', state: key });
  }, [unit, chamber, raceByDistrict, racesByState]);

  // 목록·상세에서 고른 지역은 지도도 그쪽으로 옮긴다 (지도에서 직접 누른 경우는 그대로 둔다)
  const [mapFocus, setMapFocus] = useState<{ key: string; nonce: number } | null>(null);
  const focusOn = useCallback((key: string) => setMapFocus((f) => ({ key, nonce: (f?.nonce ?? 0) + 1 })), []);
  const regionKeyOf = useCallback((r: Race) => (r.chamber === 'house' && unit === 'district' ? districtKey(r) : r.state), [unit]);

  const selectFromList = useCallback((id: string) => {
    setSelection({ type: 'race', id });
    const r = raceById.get(id);
    if (r) focusOn(regionKeyOf(r));
    if (!isMobile) mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isMobile, raceById, focusOn, regionKeyOf]);

  const selectFromDetail = useCallback((sel: NonNullable<Selection>) => {
    setSelection(sel);
    if (sel.type === 'state') focusOn(sel.state);
    else {
      const r = raceById.get(sel.id);
      if (r) focusOn(regionKeyOf(r));
    }
  }, [raceById, focusOn, regionKeyOf]);

  const describe = useCallback((key: string) => {
    if (chamber === 'house' && unit === 'state') {
      const list = racesByState.get(key) ?? [];
      const c = { D: 0, R: 0, I: 0, O: 0, u: 0 };
      list.forEach((r) => (isDecided(r) ? c[r.result.winner!]++ : c.u++));
      return (
        <>
          <b>{stateName(key)}</b>
          <span>{list.length ? `민주 ${c.D} · 공화 ${c.R}${c.I ? ` · 무소속 ${c.I}` : ''} · 미결정 ${c.u}` : '하원 선거구 없음'}</span>
        </>
      );
    }
    const r = racesOfRegion(key)[0];
    if (!r) return <><b>{key.startsWith('DC') ? '워싱턴 D.C.' : stateName(key)}</b><span>이번 선거 없음</span></>;
    const cat = categoryOf(key);
    return (
      <>
        <b>{unit === 'district' ? `${key} · ${raceTitle(r)}` : raceTitle(r)}</b>
        <span>{outcomeText(r)}</span>
        <span className="tt-cat">{cat.label}</span>
      </>
    );
  }, [chamber, unit, racesByState, racesOfRegion, categoryOf]);

  // 검색: 다른 선거 종류면 바꾸고, 하원은 선거구 지도로 열어 그곳으로 이동
  const pickRace = (r: Race) => {
    if (r.chamber !== chamber) {
      setChamber(r.chamber);
      setFocus(null);
    }
    if (r.chamber === 'house') setHouseUnit('district');
    setSelection({ type: 'race', id: r.id });
    focusOn(r.chamber === 'house' ? districtKey(r) : r.state);
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 선거 종류·모드가 바뀌면 범례 강조와 선택을 정리
  const changeChamber = (c: Chamber) => {
    setChamber(c);
    setFocus(null);
    setFilters((f) => { const n = new Set(f); n.delete('boundary'); return c === 'house' ? f : n; });
    setSelection((s) => (s?.type === 'state' && c !== 'house' ? s : null));
  };
  const changeMode = (m: Mode) => { setMode(m); setFocus(null); };

  // 모바일 하단 패널 열림 시 Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelection(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 아직 승자가 안 나온 곳 중 격차가 가장 작은 곳 (모두 끝났으면 가장 근소했던 곳)
  const closest = useMemo(() => {
    const pending = races.filter((r) => !isDecided(r) && r.result.status !== 'runoff' && r.result.candidates[1]?.votes);
    return (pending.length ? pending : races.filter((r) => !r.result.uncontested))
      .sort((a, b) => marginPts(a) - marginPts(b)).slice(0, 5);
  }, [races]);

  const detail = selectedRace ? (
    <RaceDetail
      race={selectedRace}
      data={data} mode={mode} source={source}
      onSelect={selectFromDetail}
    />
  ) : selection?.type === 'state' ? (
    <StateDetail
      state={selection.state} chamber={chamber} races={racesByState.get(selection.state) ?? []}
      data={data} mode={mode} source={source} onSelect={selectFromDetail}
    />
  ) : null;
  const picksPanel = <EmptyDetail hint={`지도에서 ${unit === 'district' ? '선거구' : '주'}를 눌러보세요`} picks={closest} onPick={selectFromList} />;

  const detailKey = selection ? (selection.type === 'race' ? selection.id : `state:${selection.state}`) : 'none';
  const animatedDetail = <div className="detail-swap" key={detailKey}>{detail}</div>;

  const showTimeline = mode === 'result' || mode === 'compare';
  const tl = useMemo(() => timeline(data, chamber), [data, chamber]);

  const showLeaderToggle = mode === 'result' && (basis === 'party' || basis === 'margin');
  const allFills = useMemo(() => [...legend.map((c) => c.fill), ...summary.segments.map((s) => s.fill)], [legend, summary]);

  return (
    <div className="app">
      <PatternDefs fills={allFills} />
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setSelection(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <Logo />
            <span>
              <h1>2026 미국 중간선거</h1>
              <small>{fmtKst(data.meta.generatedAt)} 업데이트</small>
            </span>
          </a>
          <ChamberSwitch data={data} value={chamber} onChange={changeChamber} source={source} />
          <div className="topbar-tools">
            <SearchBox races={data.races} onPick={pickRace} />
            <StatusBadge meta={data.meta} />
            <ShareButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="wrap">
        {isMobile && <Story data={data} />}

        <div className="toolbar" ref={mapCardRef}>
          <Segmented options={MODES} value={mode} onChange={changeMode} ariaLabel="보는 정보" />
          <div className="controls">
            <Segmented
              size="sm"
              ariaLabel="지도 단위"
              options={[
                { id: 'state', label: '주별' },
                { id: 'district', label: '선거구별', disabled: chamber !== 'house', title: chamber !== 'house' ? '하원에서만 볼 수 있어요' : undefined },
              ]}
              value={unit}
              onChange={(u) => { setHouseUnit(u); }}
            />
            {BASES[mode].length > 1 && (
              <Select
                label="색상"
                options={BASES[mode]}
                value={basis}
                onChange={(b) => { setBasisByMode((s) => ({ ...s, [mode]: b })); setFocus(null); }}
              />
            )}
            {mode !== 'baseline' && (
              <Select
                label="예측"
                options={data.forecastSources.map((s) => ({ id: s.id, label: s.name }))}
                value={source}
                onChange={(s) => { setSource(s); setFocus(null); }}
              />
            )}
            {showLeaderToggle && <Toggle checked={includeLeader} onChange={setIncludeLeader}>현재 선두 포함</Toggle>}
          </div>
        </div>

        {/* 지도가 주인공: 넓게 쓰고, 오른쪽 사이드바가 요약 → 상세로 바뀐다 */}
        <div className="stage">
          <section className="map-card">
            <ErrorBoundary name="지도" resetKey={`${data.meta.fetchedAt}|${chamber}|${mode}|${unit}`}>
            {geo ? (
              <MapView
                geo={geo}
                unit={unit}
                categoryOf={categoryOf}
                dimmed={dimmed}
                glyphs={glyphs}
                selectedKey={selectedKey}
                selectedState={selectedState}
                onSelect={onMapSelect}
                describe={describe}
                showMetros={unit === 'district'}
                isMobile={isMobile}
                focus={mapFocus}
                footer={
                  <div className="map-foot">
                    <Legend items={legend} focus={focus} onFocus={setFocus} />
                    <Filters value={filters} onChange={setFilters} isHouse={chamber === 'house'} />
                  </div>
                }
              />
            ) : (
              <div className="map-loading">{geoError ? '지도 경계 자료를 불러오지 못했어요.' : ''}</div>
            )}
            </ErrorBoundary>
          </section>

          <aside className="side">
            <ErrorBoundary name="요약과 상세" resetKey={`${data.meta.fetchedAt}|${chamber}|${mode}|${detailKey}`}>
            {!isMobile && !selection && <div className="side-card story-card"><Story data={data} /></div>}
            <div className="side-card">
              <SeatSummary s={summary} chamberLabel={CHAMBER_LABEL[chamber]} compact={!isMobile && !!selection} />
            </div>
            {!isMobile && selection ? (
              <div className="side-card side-detail">{animatedDetail}</div>
            ) : (
              <>
                {showTimeline && <div className="side-card"><CallTimeline tl={tl} title="개표 흐름" /></div>}
                <div className="side-card side-detail">{picksPanel}</div>
              </>
            )}
            </ErrorBoundary>
          </aside>
        </div>

        {(mode === 'result' || mode === 'compare') && (
          <section className="card">
            <div className="card-head">
              <h2>주인이 바뀐 곳</h2>
              <span className="count">{listRaces.filter((r) => outcome(r) === 'flip').length}</span>
              {listRaces.some(estimatedFlip) && <span className="muted">새 경계 추정 교체 {listRaces.filter(estimatedFlip).length}곳 별도</span>}
            </div>
            <ErrorBoundary name="주인이 바뀐 곳" resetKey={data.meta.fetchedAt}><Flips races={listRaces} onSelect={selectFromList} selectedId={selectedRace?.id ?? null} /></ErrorBoundary>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>주요 승부처</h2>
            <span className="pill">{data.forecastSources.find((s) => s.id === source)!.name}</span>
          </div>
          <ErrorBoundary name="주요 승부처" resetKey={data.meta.fetchedAt}><KeyRaces races={listRaces} source={source} freezeAt={freezeAt} onSelect={selectFromList} selectedId={selectedRace?.id ?? null} /></ErrorBoundary>
        </section>

        <div className="split">
          <section className="card">
            <div className="card-head"><h2>최근 결과 발표</h2></div>
            <ErrorBoundary name="최근 결과" resetKey={data.meta.fetchedAt}><RecentCalls races={listRaces} source={source} freezeAt={freezeAt} onSelect={selectFromList} selectedId={selectedRace?.id ?? null} fresh={fresh} /></ErrorBoundary>
          </section>
          <section className="card">
            <div className="card-head"><h2>전체 선거</h2></div>
            <ErrorBoundary name="전체 선거 목록" resetKey={data.meta.fetchedAt}><RaceTable races={listRaces} source={source} freezeAt={freezeAt} onSelect={selectFromList} selectedId={selectedRace?.id ?? null} fresh={fresh} /></ErrorBoundary>
          </section>
        </div>

        <details className="foot">
          <summary>데이터 출처와 기준</summary>
          <ul>
            <li><b>결과</b> <a href={data.meta.resultSource.url} target="_blank" rel="noreferrer">{data.meta.resultSource.name}</a>. 승자는 판정 주체가 발표한 경우에만 정당색으로 칠해요. {data.meta.resultSource.note}</li>
            <li><b>예측</b> {data.forecastSources.map((s) => s.name).join(', ')} · <a href={data.meta.forecastSource.url} target="_blank" rel="noreferrer">{data.meta.forecastSource.name}</a>. {data.meta.forecastSource.note} 예측 ↔ 결과는 {fmtKst(freezeAt)} 이전 평가만 비교해요.</li>
            <li><b>지도</b> <a href={data.meta.boundary.url} target="_blank" rel="noreferrer">{data.meta.boundary.name}</a>. {data.meta.boundary.note}</li>
            <li><b>선거 전 현황</b> 하원 현직 <a href={data.meta.rosterSource.url} target="_blank" rel="noreferrer">{data.meta.rosterSource.name}</a> · 현직 출마 여부는 실제 투표용지 기준.</li>
            <li><b>수집</b> {fmtKst(data.meta.fetchedAt)} · 1분마다 새 데이터를 확인해요.</li>
          </ul>
        </details>
      </main>

      {/* 모바일: 지도를 가리지 않는 하단 패널. 다른 지역을 눌러도 계속 열려 있다 */}
      {isMobile && selection && (
        <BottomSheet onClose={() => setSelection(null)}>
          <ErrorBoundary name="상세" resetKey={detailKey}>{animatedDetail}</ErrorBoundary>
        </BottomSheet>
      )}
    </div>
  );
}
