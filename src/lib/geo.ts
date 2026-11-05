import { geoAlbersUsa, geoArea, geoBounds, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { STATES } from './states';

export const MAP_W = 975;
export const MAP_H = 610;

type Shape = Feature<Polygon | MultiPolygon, { id: string; st: string }>;

export interface Region {
  /** 하원: 'NY-17', 주: 'NY' */
  key: string;
  state: string;
  feature: Shape;
  d: string;
  /** 라벨 기준점 (가장 큰 조각의 중심) */
  anchor: [number, number];
  /** 투영 면적 (px²) */
  area: number;
  /** 경위도 경계 [[w, s], [e, n]] */
  lonLat: [[number, number], [number, number]];
}

export interface GeoData {
  states: Region[];
  districts: Region[];
  stateMesh: string;
  districtMesh: string;
  /** 위치·축척을 옮겨 그린 알래스카·하와이 */
  relocated: { key: string; box: [number, number, number, number] }[];
}

export const mainProjection: GeoProjection = geoAlbersUsa().scale(1300).translate([MAP_W / 2, MAP_H / 2]);

function largestPart(f: Shape): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const g: Polygon = { type: 'Polygon', coordinates: coords };
    const a = geoArea(g);
    if (a > bestArea) [best, bestArea] = [g, a];
  }
  return { type: 'Feature', properties: {}, geometry: best! };
}

export async function loadGeo(): Promise<GeoData> {
  const topo = (await (await fetch('/data/us-geo.json')).json()) as Topology<{
    districts: GeometryCollection<{ id: string; st: string }>;
    states: GeometryCollection<{ st: string }>;
  }>;
  const path = geoPath(mainProjection);

  const toRegion = (f: Shape, key: string, state: string): Region => {
    const part = largestPart(f);
    const [x, y] = path.centroid(part);
    return { key, state, feature: f, d: path(f) ?? '', anchor: [x, y], area: path.area(f), lonLat: geoBounds(f) };
  };

  const districtFc = feature(topo, topo.objects.districts) as FeatureCollection<Polygon | MultiPolygon, { id: string; st: string }>;
  const districts = districtFc.features.map((f) => {
    const st = STATES[f.properties.st].abbr;
    return toRegion(f, `${st}-${f.properties.id.slice(2)}`, st);
  });
  const stateFc = feature(topo, topo.objects.states) as FeatureCollection<Polygon | MultiPolygon, { id: string; st: string }>;
  const states = stateFc.features.map((f) => {
    const st = STATES[f.properties.st].abbr;
    return toRegion(f, st, st);
  });

  const stateMesh = path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? '';
  // 주 경계는 stateMesh 가 그리므로 같은 주 안의 선거구 경계만
  const st = (g: { properties?: unknown }) => (g.properties as { st: string }).st;
  const districtMesh = path(mesh(topo, topo.objects.districts, (a, b) => a !== b && st(a) === st(b))) ?? '';

  const relocated = (['AK', 'HI'] as const).map((key) => {
    const r = states.find((s) => s.key === key)!;
    const [[x0, y0], [x1, y1]] = path.bounds(r.feature);
    const pad = 8;
    return {
      key,
      box: [Math.max(2, x0 - pad), y0 - pad - 10, x1 - Math.max(2, x0 - pad) + pad, y1 - y0 + pad * 2 + 10] as [number, number, number, number],
    };
  });

  return { states, districts, stateMesh, districtMesh, relocated };
}

// ── 도시권 확대도 ─────────────────────────────────────────────

export interface MetroDef {
  id: string;
  name: string;
  /** [[w, s], [e, n]] */
  bbox: [[number, number], [number, number]];
  defaultOn: boolean;
}

export const METROS: MetroDef[] = [
  { id: 'nyc', name: '뉴욕권', bbox: [[-74.42, 40.47], [-73.55, 41.02]], defaultOn: true },
  { id: 'la', name: 'LA권', bbox: [[-118.72, 33.68], [-117.62, 34.32]], defaultOn: true },
  { id: 'chi', name: '시카고권', bbox: [[-88.2, 41.62], [-87.5, 42.12]], defaultOn: false },
  { id: 'sf', name: '샌프란시스코권', bbox: [[-122.65, 37.25], [-121.75, 38.05]], defaultOn: false },
];

export const bboxFeature = (b: MetroDef['bbox']): Feature<Polygon> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    // 시계 방향(d3-geo 외곽 링 규칙)
    coordinates: [[[b[0][0], b[0][1]], [b[0][0], b[1][1]], [b[1][0], b[1][1]], [b[1][0], b[0][1]], [b[0][0], b[0][1]]]],
  },
});

/** 본 지도에서 확대도 범위 사각형 [x, y, w, h] */
export function metroFrame(m: MetroDef): [number, number, number, number] {
  const [[x0, y0], [x1, y1]] = geoPath(mainProjection).bounds(bboxFeature(m.bbox));
  return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * 본 지도에서 이 도시권이 이미 충분히 크게 보이는지 (그러면 확대도를 접는다).
 * 화면 안에 보이는지도 함께 본다 — 배율만 보면 화면 밖 도시권까지 접혀, 틀이 가장 작은 시카고권만 남았다.
 * @param view 본 지도의 이동·배율 (지도 좌표)
 */
export function metroCovered(
  [x, y, w, h]: [number, number, number, number],
  view: { x: number; y: number; k: number },
  pxPerUnit: number,
  minPx: number,
) {
  const sx = view.x + x * view.k;
  const sy = view.y + y * view.k;
  const visible = sx < MAP_W && sx + w * view.k > 0 && sy < MAP_H && sy + h * view.k > 0;
  return visible && w * view.k * pxPerUnit > minPx;
}

export interface MetroLayer {
  width: number;
  height: number;
  shapes: { key: string; d: string; label?: [number, number] }[];
  stateMesh: string;
}

const intersects = (a: Region['lonLat'], b: MetroDef['bbox']) =>
  a[0][0] <= b[1][0] && a[1][0] >= b[0][0] && a[0][1] <= b[1][1] && a[1][1] >= b[0][1];

export function buildMetro(m: MetroDef, geo: GeoData, width = 360): MetroLayer {
  const box = bboxFeature(m.bbox);
  const proj = geoMercator().fitWidth(width, box);
  const path = geoPath(proj);
  const [[, by0], [, by1]] = path.bounds(box);
  const height = Math.round(by1 - by0);
  proj.translate([proj.translate()[0], proj.translate()[1] - by0]);
  const shapes = geo.districts
    .filter((r) => intersects(r.lonLat, m.bbox))
    .map((r) => {
      const d = path(r.feature) ?? '';
      const [[x0, y0], [x1, y1]] = path.bounds(r.feature);
      // 확대도 안에 보이는 부분의 중심에 번호를 둔다
      const vx0 = Math.max(0, x0), vy0 = Math.max(0, y0), vx1 = Math.min(width, x1), vy1 = Math.min(height, y1);
      let label: [number, number] | undefined;
      if (vx1 - vx0 > 14 && vy1 - vy0 > 10) {
        const c = path.centroid(largestPart(r.feature));
        label = c[0] > vx0 && c[0] < vx1 && c[1] > vy0 && c[1] < vy1 ? c : [(vx0 + vx1) / 2, (vy0 + vy1) / 2];
      }
      return { key: r.key, d, label };
    });
  const states = geo.states.filter((r) => intersects(r.lonLat, m.bbox)).map((r) => r.feature);
  const stateMesh = states.map((f) => path(f) ?? '').join('');
  return { width, height, shapes, stateMesh };
}
