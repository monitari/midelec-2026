import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { geoPath } from 'd3-geo';
import type { Unit } from '../lib/types';
import type { Category } from '../lib/classify';
import { PALETTE, fillRef, type Fill } from '../lib/colors';
import { MAP_H, MAP_W, MAX_ZOOM, METROS, buildMetro, mainProjection, metroCovered, metroFrame, nearestInDirection, type GeoData, type MetroDef, type Region } from '../lib/geo';
import { Segmented, prefersReducedMotion } from './ui';

export interface Glyph {
  segments: { key: string; value: number; fill: Fill }[];
}

interface Props {
  geo: GeoData;
  unit: Unit;
  /** 지역 키 → 분류. 하원 주별 보기에서는 주를 중립색으로 칠하고 glyph 로 의석을 보여준다 */
  categoryOf: (key: string) => Category | null;
  dimmed: (key: string) => boolean;
  glyphs?: Record<string, Glyph>;
  selectedKey: string | null;
  /** 선택 지역이 속한 주 (선거구 보기에서 주 전체를 선택했을 때) */
  selectedState: string | null;
  onSelect: (key: string) => void;
  describe: (key: string) => ReactNode;
  showMetros: boolean;
  isMobile: boolean;
  /** 이 지역으로 지도를 옮긴다 (목록에서 고르거나 주 전체 보기를 눌렀을 때). nonce 가 바뀔 때마다 실행 */
  focus?: { key: string; nonce: number } | null;
  /** 지도 바로 아래 (범례·필터) */
  footer?: ReactNode;
}

const ms = (n: number) => (prefersReducedMotion() ? 0 : n);
const boundsPath = geoPath(mainProjection);

const NEUTRAL = PALETTE.neutral;
/** 작은 동부 주는 바깥에 의석 막대를 둔다 */
const CALLOUTS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD'];
const COLLAPSE_PX = 230;

/** 둘레 선이 있는 분류(새 경계 등)는 흰 경계선 위에 따로 그린다 */
function EdgeLayer({ shapes, categoryOf, dimmed }: { shapes: { key: string; d: string }[]; categoryOf: Props['categoryOf']; dimmed: Props['dimmed'] }) {
  return (
    <g pointerEvents="none">
      {shapes.map((r) => {
        const edge = categoryOf(r.key)?.fill.edge;
        return edge ? <path key={r.key} d={r.d} stroke={edge} className={dimmed(r.key) ? 'region-edge dim' : 'region-edge'} /> : null;
      })}
    </g>
  );
}

const RegionLayer = memo(function RegionLayer({
  regions, categoryOf, dimmed, neutral,
}: {
  regions: Region[];
  categoryOf: Props['categoryOf'];
  dimmed: Props['dimmed'];
  neutral?: boolean;
}) {
  return (
    <g>
      {regions.map((r) => {
        const c = neutral ? null : categoryOf(r.key);
        return (
          <path
            key={r.key}
            data-key={r.key}
            d={r.d}
            style={{ fill: c ? fillRef(c.fill) : NEUTRAL }}
            className={dimmed(r.key) ? 'region dim' : 'region'}
          />
        );
      })}
    </g>
  );
});

export function MapView(props: Props) {
  const { geo, unit, glyphs, selectedKey, selectedState, onSelect, describe, showMetros, isMobile } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [k, setK] = useState(1);
  // 이동량(지도 좌표). 확대도 접기에서 그 도시권이 화면 안에 있는지 판단하는 데만 쓰므로 거칠게 반올림해 둔다
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pxPerUnit, setPxPerUnit] = useState(1);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  // 넓은 화면에서는 도시권 네 곳을 모두 펼쳐 둔다
  const [enabledMetros, setEnabledMetros] = useState(() => new Set(METROS.filter((m) => m.defaultOn || window.innerWidth >= 1280).map((m) => m.id)));
  const [mobileMetro, setMobileMetro] = useState('nyc');
  // Ctrl 없이 휠을 굴리면 잠깐 안내를 띄운다 (페이지 스크롤은 그대로)
  const [wheelHint, setWheelHint] = useState(false);
  const wheelTimer = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    setWheelHint(true);
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => setWheelHint(false), 1200);
  };

  const regions = unit === 'district' ? geo.districts : geo.states;
  const byKey = useMemo(() => new Map(regions.map((r) => [r.key, r])), [regions]);
  const stateByKey = useMemo(() => new Map(geo.states.map((r) => [r.key, r])), [geo]);

  useEffect(() => {
    const svg = svgRef.current!;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[0, 0], [MAP_W, MAP_H]])
      // 페이지 스크롤을 빼앗지 않도록 휠 확대는 Ctrl/⌘ 와 함께
      .filter((e: Event) => (e.type === 'wheel' ? (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey : !(e as MouseEvent).button))
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        setK(Math.round(e.transform.k * 4) / 4);
        const x = Math.round(e.transform.x / 8) * 8;
        const y = Math.round(e.transform.y / 8) * 8;
        setPan((p) => (p.x === x && p.y === y ? p : { x, y }));
      });
    select(svg).call(z).on('dblclick.zoom', null);
    zoomRef.current = z;
    const ro = new ResizeObserver(() => setPxPerUnit(svg.clientWidth / MAP_W));
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // 선거 종류·지도 단위가 바뀌면 전국 보기로
  useEffect(() => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, [unit]);

  const zoomBy = (f: number) => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(ms(250)).call(zoomRef.current.scaleBy, f);
  const zoomTo = useCallback((box: [number, number, number, number], fill = 0.85, maxK = MAX_ZOOM) => {
    if (!svgRef.current || !zoomRef.current) return;
    const [x, y, w, h] = box;
    const kk = Math.max(1, Math.min(maxK, fill / Math.max(w / MAP_W, h / MAP_H)));
    const t = zoomIdentity.translate(MAP_W / 2, MAP_H / 2).scale(kk).translate(-(x + w / 2), -(y + h / 2));
    select(svgRef.current).transition().duration(ms(650)).call(zoomRef.current.transform, t);
  }, []);
  const reset = () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(ms(400)).call(zoomRef.current.transform, zoomIdentity);

  // 주는 꽉 차게, 선거구는 주변 맥락이 보이도록 절반 정도로
  useEffect(() => {
    if (!props.focus) return;
    const r = byKey.get(props.focus.key) ?? stateByKey.get(props.focus.key);
    if (!r) return;
    const [[x0, y0], [x1, y1]] = boundsPath.bounds(r.feature);
    const isDistrict = r.key.includes('-');
    zoomTo([x0, y0, x1 - x0, y1 - y0], isDistrict ? 0.35 : 0.8, isDistrict ? 10 : 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.nonce]);

  const metroFrames = useMemo(() => Object.fromEntries(METROS.map((m) => [m.id, metroFrame(m)])), []);
  const activeMetros = showMetros
    ? METROS.filter((m) => (isMobile ? m.id === mobileMetro : enabledMetros.has(m.id)))
    : [];
  const collapsed = new Set(activeMetros.filter((m) => metroCovered(metroFrames[m.id], { ...pan, k }, pxPerUnit, COLLAPSE_PX)).map((m) => m.id));

  const pick = (e: React.PointerEvent | React.MouseEvent) => (e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null;
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const key = pick(e);
    setHover(key ? { key, x: e.clientX, y: e.clientY } : null);
  };
  const onClick = (e: React.MouseEvent) => {
    const key = pick(e);
    if (key) onSelect(key);
  };

  // 키보드: 지도에 포커스가 있을 때 화살표로 지역 사이를 다니고 Enter 로 고른다
  const [kbKey, setKbKey] = useState<string | null>(null);
  const kbRegion = kbKey ? byKey.get(kbKey) : null;
  const toClient = (pt: [number, number]) => {
    const m = gRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return { x: m.a * pt[0] + m.c * pt[1] + m.e, y: m.b * pt[0] + m.d * pt[1] + m.f };
  };
  const startKb = () => {
    if (kbKey && byKey.has(kbKey)) return;
    // 고른 지역이 있으면 거기서, 없으면 지도 한가운데에서 가장 가까운 지역부터
    const center: [number, number] = [MAP_W / 2, MAP_H / 2];
    const start = (selectedKey ? byKey.get(selectedKey) : undefined)
      ?? regions.reduce((a, b) => (Math.hypot(b.anchor[0] - center[0], b.anchor[1] - center[1]) < Math.hypot(a.anchor[0] - center[0], a.anchor[1] - center[1]) ? b : a));
    setKbKey(start.key);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const;
    if (e.key in dirs && kbRegion) {
      e.preventDefault();
      const next = nearestInDirection(regions, kbRegion.anchor, dirs[e.key as keyof typeof dirs], kbRegion.key);
      if (next) setKbKey(next);
    } else if ((e.key === 'Enter' || e.key === ' ') && kbKey) {
      e.preventDefault();
      onSelect(kbKey);
    } else if (e.key === 'Escape') {
      (e.currentTarget as SVGSVGElement).blur();
    }
  };
  // 키보드로 고른 지역의 안내는 마우스 안내와 같은 말풍선을 쓴다
  const kbTip = kbRegion ? { key: kbRegion.key, ...toClient(kbRegion.anchor) } : null;

  const hoverRegion = hover ? byKey.get(hover.key) ?? stateByKey.get(hover.key) : kbRegion ?? null;
  const selectedRegion = selectedKey ? byKey.get(selectedKey) : null;
  const selectedStateRegion = selectedState ? stateByKey.get(selectedState) : null;
  const labelsOn = unit === 'district' && k >= 3;

  return (
    <div className="map">
      <div className="map-stage">
        <svg
          ref={svgRef}
          className="map-svg"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          role="application"
          aria-roledescription="지도"
          aria-label="미국 지도. 화살표로 지역 이동, Enter로 선택"
          tabIndex={0}
          onFocus={startKb}
          onBlur={() => setKbKey(null)}
          onKeyDown={onKeyDown}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
          onWheel={onWheel}
        >
          <g ref={gRef}>
            <RegionLayer regions={regions} categoryOf={props.categoryOf} dimmed={props.dimmed} neutral={!!glyphs} />
            {unit === 'district' && <path className="mesh-district" d={geo.districtMesh} />}
            {!glyphs && <EdgeLayer shapes={regions} categoryOf={props.categoryOf} dimmed={props.dimmed} />}
            <path className="mesh-state" d={geo.stateMesh} />

            {geo.relocated.map((r) => (
              <g key={r.key} className="relocated" pointerEvents="none">
                <rect x={r.box[0]} y={r.box[1]} width={r.box[2]} height={r.box[3]} rx={6} />
              </g>
            ))}

            {labelsOn && geo.districts.map((r) => (
              Math.sqrt(r.area) * k * pxPerUnit > 34 ? (
                <text key={r.key} className="district-label" x={r.anchor[0]} y={r.anchor[1]} fontSize={10 / k} pointerEvents="none">
                  {r.key}
                </text>
              ) : null
            ))}

            {glyphs && <StateGlyphs geo={geo} glyphs={glyphs} dimmed={props.dimmed} k={k} />}

            {activeMetros.filter((m) => !collapsed.has(m.id)).map((m) => {
              const [x, y, w, h] = metroFrames[m.id];
              return (
                <g key={m.id} className="metro-frame" onClick={(e) => { e.stopPropagation(); zoomTo(metroFrames[m.id]); }}>
                  <rect x={x} y={y} width={w} height={h} rx={1.5} />
                  <text x={x + w + 3 / k} y={y - 2 / k} fontSize={10 / k}>{m.name}</text>
                </g>
              );
            })}

            {selectedStateRegion && <path className="outline-state" d={selectedStateRegion.d} />}
            {hoverRegion && <path className="outline-hover" d={hoverRegion.d} />}
            {selectedRegion && <path className="outline-selected" d={selectedRegion.d} />}
          </g>
        </svg>

        <div className="zoom-ctrl">
          <button onClick={() => zoomBy(1.6)} aria-label="확대">+</button>
          <button onClick={() => zoomBy(1 / 1.6)} aria-label="축소">−</button>
          {k > 1 && <button className="zoom-reset" onClick={reset}>전국</button>}
        </div>
        {!isMobile && wheelHint && <div className="map-hint">Ctrl + 스크롤로 확대</div>}
        {/* 화면 낭독기에 키보드로 고른 지역을 알린다 */}
        <div className="sr-only" aria-live="polite">{kbKey ? describe(kbKey) : null}</div>
      </div>

      {props.footer}

      {showMetros && (
        <div className="metros">
          <div className="metros-head">
            <span className="metros-title">도시권 확대도</span>
            {isMobile ? (
              <Segmented
                size="sm"
                options={METROS.map((m) => ({ id: m.id, label: m.name.replace('권', '') }))}
                value={mobileMetro}
                onChange={setMobileMetro}
              />
            ) : (
              <div className="metro-toggles">
                {METROS.map((m) => (
                  <button
                    key={m.id}
                    className={`chip ${enabledMetros.has(m.id) ? 'on' : ''}`}
                    onClick={() => setEnabledMetros((s) => {
                      const n = new Set(s);
                      if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                      return n;
                    })}
                  >
                    {enabledMetros.has(m.id) ? '✓ ' : '+ '}{m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`metro-grid n${activeMetros.length}`}>
            {activeMetros.map((m) =>
              collapsed.has(m.id) ? (
                <div key={m.id} className="metro collapsed">
                  <span>{m.name}</span> 본 지도에서 보는 중
                </div>
              ) : (
                <MetroInset
                  key={m.id}
                  metro={m}
                  geo={geo}
                  categoryOf={props.categoryOf}
                  dimmed={props.dimmed}
                  selectedKey={selectedKey}
                  onSelect={onSelect}
                  onHover={(key, x, y) => setHover(key ? { key, x, y } : null)}
                  onFocusMain={() => zoomTo(metroFrames[m.id])}
                />
              ),
            )}
          </div>
        </div>
      )}

      {(hover ?? kbTip) && <div className="tooltip" style={{ left: (hover ?? kbTip)!.x, top: (hover ?? kbTip)!.y }}>{describe((hover ?? kbTip)!.key)}</div>}
    </div>
  );
}

function StateGlyphs({ geo, glyphs, dimmed, k }: { geo: GeoData; glyphs: Record<string, Glyph>; dimmed: Props['dimmed']; k: number }) {
  const W = 26;
  const H = 7;
  return (
    <g pointerEvents="none">
      {geo.states.map((r) => {
        const g = glyphs[r.key];
        if (!g) return null;
        const total = g.segments.reduce((s, x) => s + x.value, 0);
        const ci = CALLOUTS.indexOf(r.key);
        const out = ci >= 0;
        const [ax, ay] = r.anchor;
        const gx = out ? 912 : ax;
        const gy = out ? 128 + ci * 24 : ay;
        let x = 0;
        return (
          <g key={r.key} className={dimmed(r.key) ? 'glyph dim' : 'glyph'}>
            {out && <line className="callout" x1={ax} y1={ay} x2={gx - 4} y2={gy} />}
            <g transform={`translate(${gx},${gy}) scale(${1 / Math.sqrt(k)})`}>
              <g transform={out ? `translate(16, ${-H / 2})` : `translate(${-W / 2}, ${-H / 2})`}>
                <rect className="glyph-bg" x={-1.5} y={-1.5} width={W + 3} height={H + 3} rx={3} />
                {g.segments.map((s) => {
                  const w = (s.value / total) * W;
                  const el = s.value ? <rect key={s.key} x={x} y={0} width={w} height={H} style={{ fill: fillRef(s.fill) }} /> : null;
                  x += w;
                  return el;
                })}
              </g>
              {out && <text className="callout-label" x={0} y={3.5}>{r.key}</text>}
            </g>
          </g>
        );
      })}
    </g>
  );
}

const MetroInset = memo(function MetroInset({
  metro, geo, categoryOf, dimmed, selectedKey, onSelect, onHover, onFocusMain,
}: {
  metro: MetroDef;
  geo: GeoData;
  categoryOf: Props['categoryOf'];
  dimmed: Props['dimmed'];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null, x: number, y: number) => void;
  onFocusMain: () => void;
}) {
  const layer = useMemo(() => buildMetro(metro, geo), [metro, geo]);
  const selected = layer.shapes.find((s) => s.key === selectedKey);
  const pick = (e: React.SyntheticEvent) => (e.target as Element).closest('[data-key]')?.getAttribute('data-key') ?? null;
  return (
    <figure className="metro">
      <figcaption>
        <b>{metro.name}</b>
        <button className="icon-btn" onClick={onFocusMain} aria-label={`본 지도에서 ${metro.name} 보기`} title="본 지도에서 보기">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </figcaption>
      <svg
        viewBox={`0 0 ${layer.width} ${layer.height}`}
        role="img"
        aria-label={`${metro.name} 확대도`}
        onClick={(e) => { const k = pick(e); if (k) onSelect(k); }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse') onHover(pick(e), e.clientX, e.clientY); }}
        onPointerLeave={() => onHover(null, 0, 0)}
      >
        <rect width={layer.width} height={layer.height} className="metro-water" />
        {layer.shapes.map((s) => {
          const c = categoryOf(s.key);
          return (
            <path key={s.key} data-key={s.key} d={s.d} style={{ fill: c ? fillRef(c.fill) : NEUTRAL }}
              className={dimmed(s.key) ? 'region dim' : 'region'} />
          );
        })}
        <EdgeLayer shapes={layer.shapes} categoryOf={categoryOf} dimmed={dimmed} />
        <path className="metro-states" d={layer.stateMesh} />
        {selected && <path className="outline-selected" d={selected.d} />}
        {layer.shapes.map((s) => s.label && (
          <text key={s.key} className="metro-label" x={s.label[0]} y={s.label[1]} pointerEvents="none">
            {s.key}
          </text>
        ))}
      </svg>
    </figure>
  );
});
