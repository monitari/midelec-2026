import { useLayoutEffect, useRef, useState } from 'react';
import { PALETTE, PARTY_NAME } from '../lib/colors';
import type { Timeline } from '../lib/story';
import { fmtKst, fmtTime } from '../lib/format';

const PAD = { top: 16, right: 64, bottom: 26, left: 34 };
const HEIGHT = 220;
const HOUR = 3600e3;
const dayHour = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric' });
/** 하루를 넘기면 날짜를 붙인다 (11/5 오전 3시) */
function tickLabel(t: number, multiDay: boolean) {
  if (!multiDay) return fmtTime(new Date(t).toISOString());
  const p = Object.fromEntries(dayHour.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day} ${p.dayPeriod ?? ''} ${p.hour}시`.replace(/\s+/g, ' ');
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const valueAt = (tl: Timeline, t: number) => {
  let p = tl.points[0];
  for (const q of tl.points) {
    if (q.t > t) break;
    p = q;
  }
  return p;
};

/** 개표 밤 동안 승자 발표가 쌓이며 확보 의석이 늘어난 흐름 (계단선 2개, 과반선, 확정 시점) */
export function CallTimeline({ tl, title }: { tl: Timeline; title: string }) {
  const [ref, width] = useWidth();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const last = tl.points.at(-1)!;
  const values = tl.points.flatMap((p) => [p.d, p.r]);
  const top = Math.max(...values, tl.need?.D ?? 0) ;
  const yMax = Math.ceil((top * 1.08) / 10) * 10;
  const yMin = Math.max(0, Math.floor((Math.min(...values) * 0.9) / 10) * 10);
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - tl.start) / (tl.end - tl.start || 1)) * iw;
  const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const step = (key: 'd' | 'r') => tl.points.map((p, i) => {
    const px = x(p.t).toFixed(1);
    const py = y(p[key]).toFixed(1);
    return i === 0 ? `M${px},${py}` : `H${px}V${py}`;
  }).join('');

  // 한국시간 3시간 간격 눈금
  // 눈금 간격은 폭에 맞춰 (라벨 하나에 약 72px). 한국시간 정각 단위(UTC+9 라 몇 시간 단위든 정각이 맞는다)
  const span = tl.end - tl.start;
  const stepH = [1, 2, 3, 6, 12, 24].find((h) => span / (h * HOUR) <= Math.max(2, iw / 72)) ?? 24;
  const multiDay = span > 20 * HOUR;
  const ticks: number[] = [];
  for (let t = Math.ceil((tl.start + 9 * HOUR) / (stepH * HOUR)) * stepH * HOUR - 9 * HOUR; t <= tl.end; t += stepH * HOUR) ticks.push(t);
  const yTicks = [yMin, Math.round((yMin + yMax) / 2 / 10) * 10, yMax];

  const clinch = tl.control?.decided ? tl.control : null;
  const hover = hoverT != null ? valueAt(tl, hoverT) : null;

  return (
    <figure className="timeline">
      <figcaption>
        <b>{title}</b>
        <span className="tl-legend">
          <span><i style={{ background: PALETTE.D }} />민주{tl.caucusIncluded ? ' (협력 무소속 포함)' : ''}</span>
          <span><i style={{ background: PALETTE.R }} />공화</span>
        </span>
      </figcaption>
      <div ref={ref} className="tl-plot">
        {width > 0 && (
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width="100%"
            height={HEIGHT}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}: 현재 민주 ${last.d}, 공화 ${last.r}${clinch ? `, ${fmtKst(clinch.at)} ${PARTY_NAME[clinch.party]} 다수당 확정` : ''}`}
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const px = Math.min(Math.max(((e.clientX - box.left) / box.width) * width, PAD.left), PAD.left + iw);
              setHoverT(tl.start + ((px - PAD.left) / iw) * (tl.end - tl.start));
            }}
            onPointerLeave={() => setHoverT(null)}
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line className="tl-grid" x1={PAD.left} x2={PAD.left + iw} y1={y(v)} y2={y(v)} />
                <text className="tl-axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">{v}</text>
              </g>
            ))}
            {ticks.map((t) => (
              <text key={t} className="tl-axis" x={x(t)} y={HEIGHT - 6} textAnchor="middle">{tickLabel(t, multiDay)}</text>
            ))}
            {tl.need && (
              <g>
                <line className="tl-need" x1={PAD.left} x2={PAD.left + iw} y1={y(tl.need.D)} y2={y(tl.need.D)} />
                <text className="tl-axis tl-need-label" x={PAD.left + 4} y={y(tl.need.D) - 6}>과반 {tl.need.D}</text>
              </g>
            )}
            <path className="tl-line" d={step('r')} stroke={PALETTE.R} pathLength={1} />
            <path className="tl-line" d={step('d')} stroke={PALETTE.D} pathLength={1} />
            {clinch && (
              <g className="tl-clinch">
                <line x1={x(Date.parse(clinch.at))} x2={x(Date.parse(clinch.at))} y1={PAD.top} y2={PAD.top + ih} />
                <circle cx={x(Date.parse(clinch.at))} cy={y(clinch.seats)} r={5} fill={PALETTE[clinch.party]} />
                {/* 선이 지나지 않는 아래쪽에, 오른쪽 끝에 가까우면 왼쪽으로 */}
                <text
                  x={x(Date.parse(clinch.at)) + (x(Date.parse(clinch.at)) > PAD.left + iw * 0.6 ? -8 : 8)}
                  y={PAD.top + ih - 8}
                  textAnchor={x(Date.parse(clinch.at)) > PAD.left + iw * 0.6 ? 'end' : 'start'}
                >
                  {PARTY_NAME[clinch.party]} 다수당 확정 · {fmtTime(clinch.at)}
                </text>
              </g>
            )}
            <circle className="tl-end" cx={x(last.t)} cy={y(last.d)} r={4.5} fill={PALETTE.D} />
            <circle className="tl-end" cx={x(last.t)} cy={y(last.r)} r={4.5} fill={PALETTE.R} />
            <text className="tl-end-label" x={x(last.t) + 9} y={y(last.d) + 4}>{last.d}</text>
            <text className="tl-end-label" x={x(last.t) + 9} y={y(last.r) + 4}>{last.r}</text>
            {hover && hoverT != null && (
              <g pointerEvents="none">
                <line className="tl-cross" x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + ih} />
                <circle cx={x(hoverT)} cy={y(hover.d)} r={4} fill={PALETTE.D} className="tl-end" />
                <circle cx={x(hoverT)} cy={y(hover.r)} r={4} fill={PALETTE.R} className="tl-end" />
              </g>
            )}
          </svg>
        )}
        {hover && hoverT != null && (
          <div className="tl-tip" style={{ left: Math.min(x(hoverT) + 10, width - 150) }}>
            <b>{fmtTime(new Date(hoverT).toISOString())}</b>
            <span><i style={{ background: PALETTE.D }} />민주 {hover.d}</span>
            <span><i style={{ background: PALETTE.R }} />공화 {hover.r}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
