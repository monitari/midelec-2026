import { useEffect, useMemo, useState } from 'react';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { CountyResults, Party, Race } from '../lib/types';
import { PALETTE } from '../lib/colors';
import { ABBR_TO_FIPS } from '../lib/states';

type County = Feature<Geometry, { name: string }> & { id: string };

// 카운티 경계(약 800KB)와 결과는 상원·주지사 상세를 처음 열 때 한 번만 받는다
let loading: Promise<{ counties: County[]; results: CountyResults }> | null = null;
function loadCounties() {
  loading ??= Promise.all([
    fetch('/data/us-counties.json').then((r) => r.json() as Promise<Topology>),
    fetch('/data/counties-2026.json', { cache: 'no-cache' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : {}) as Promise<CountyResults>),
  ]).then(([topo, results]) => ({
    counties: (feature(topo, topo.objects.counties) as FeatureCollection<Geometry, { name: string }>).features as County[],
    results,
  }));
  loading.catch(() => { loading = null; });
  return loading;
}

const W = 320;
const SHADES: Record<'D' | 'R', string[]> = {
  D: [PALETTE.Dlight, PALETTE.Dmid, PALETTE.D, PALETTE.Dstrong],
  R: [PALETTE.Rlight, PALETTE.Rmid, PALETTE.R, PALETTE.Rstrong],
};

function shade(c: [Party, number][], total: number) {
  if (!c[0]?.[1] || !total) return PALETTE.neutral;
  const [p, v] = c[0];
  if (p !== 'D' && p !== 'R') return PALETTE.I;
  const m = ((v - (c[1]?.[1] ?? 0)) / total) * 100;
  return SHADES[p][m >= 30 ? 3 : m >= 15 ? 2 : m >= 5 ? 1 : 0];
}

/** 상원·주지사 선거의 카운티별 1위 정당 (진할수록 격차가 큼) */
export function CountyMap({ race }: { race: Race }) {
  const [data, setData] = useState<{ counties: County[]; results: CountyResults } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { loadCounties().then(setData, () => setFailed(true)); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const prefix = ABBR_TO_FIPS[race.state];
    const shapes = data.counties.filter((f) => String(f.id).startsWith(prefix));
    const res = data.results[race.id] ?? {};
    const matched = shapes.filter((f) => res[f.id]).length;
    // 카운티가 아닌 단위로 집계하는 주(알래스카), 경계 체계가 바뀐 주(코네티컷)는 그리지 않는다
    if (!shapes.length || matched < shapes.length / 2) return { empty: true as const };
    const fc: FeatureCollection = { type: 'FeatureCollection', features: shapes };
    const proj = geoAlbersUsa().fitWidth(W, fc);
    const path = geoPath(proj);
    const [[, y0], [, y1]] = path.bounds(fc);
    return {
      empty: false as const,
      height: Math.ceil(y1 - y0) + 2,
      top: y0 - 1,
      items: shapes.map((f) => ({ id: f.id, name: f.properties.name, d: path(f) ?? '', r: res[f.id] })),
    };
  }, [data, race.id, race.state]);

  if (failed) return null;
  if (!view) return <div className="county-map loading" aria-busy="true" />;
  if (view.empty) return <p className="empty">이 주는 카운티 단위 결과가 없어요.</p>;

  const hovered = view.items.find((i) => i.id === hover);
  return (
    <figure className="county-map">
      <svg viewBox={`0 ${view.top} ${W} ${view.height}`} role="img" aria-label="카운티별 1위 정당 지도" onPointerLeave={() => setHover(null)}>
        {view.items.map((i) => (
          <path
            key={i.id}
            d={i.d}
            style={{ fill: i.r ? shade(i.r.c, i.r.t) : PALETTE.neutral }}
            className={hover === i.id ? 'county on' : 'county'}
            onPointerEnter={() => setHover(i.id)}
          />
        ))}
      </svg>
      <figcaption>
        {hovered?.r ? (
          <span>
            <b>{hovered.name}</b>
            {hovered.r.c.map(([p, v]) => ` · ${p === 'D' ? '민주' : p === 'R' ? '공화' : '기타'} ${((v / (hovered.r!.t || 1)) * 100).toFixed(1)}%`).join('')}
            {hovered.r.e != null && ` · 개표 ${hovered.r.e.toFixed(0)}%`}
          </span>
        ) : (
          <span className="county-legend">
            {SHADES.D.slice().reverse().map((c) => <i key={c} style={{ background: c }} />)}
            <em>격차</em>
            {SHADES.R.map((c) => <i key={c} style={{ background: c }} />)}
            <small>카운티 1위 정당 · 진할수록 큰 격차</small>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
