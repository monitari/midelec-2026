import { useMemo, useState, type ReactNode } from 'react';
import { fillRef, type Fill } from '../lib/colors';

export interface HemiSegment {
  key: string;
  label: string;
  value: number;
  fill: Fill;
}

interface Seat { x: number; y: number; angle: number }

const W = 400;
const CX = W / 2;
const CY = 204;
const R_OUT = 192;
const R_IN = 78;

/** 반원 의석 배치: 줄마다 반지름에 비례해 의석을 나누고, 왼쪽부터 각도 순으로 정렬 */
function layout(total: number) {
  const rows = Math.max(3, Math.ceil(Math.sqrt(total / 4)));
  const radii = Array.from({ length: rows }, (_, i) => R_IN + ((R_OUT - R_IN) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.round((total * r) / sum));
  counts[rows - 1] += total - counts.reduce((a, b) => a + b, 0);
  const seats: Seat[] = [];
  radii.forEach((r, i) => {
    const n = counts[i];
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (n - 1);
      seats.push({ x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle), angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || Math.hypot(a.x - CX, a.y - CY) - Math.hypot(b.x - CX, b.y - CY));
  const pitch = Math.min((Math.PI * sum) / total, (R_OUT - R_IN) / (rows - 1));
  return { seats, dot: pitch * 0.4 };
}

/**
 * 의석 반원. 왼쪽(민주)부터 구간 순서대로 칠한다. 같은 의석 수에서 구간이 바뀌면
 * 왼쪽부터 물결처럼 색이 바뀌고, 의석 수가 바뀌면(선거 종류 전환) 새로 펼쳐진다.
 */
export function Hemicycle({ segments, total, majority, children, ariaLabel }: {
  segments: HemiSegment[];
  total: number;
  majority?: { value: number; label: string };
  children?: ReactNode;
  ariaLabel: string;
}) {
  const { seats, dot } = useMemo(() => layout(total), [total]);
  // 바깥 줄 의석이 잘리지 않도록 점 크기만큼 여백을 둔 좌표계
  const pad = dot + 2;
  const vw = W + pad * 2;
  const vh = CY + dot + 2 + pad;
  const [hover, setHover] = useState<HemiSegment | null>(null);

  const owner: HemiSegment[] = [];
  for (const g of segments) for (let i = 0; i < g.value && owner.length < total; i++) owner.push(g);

  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (majority && majority.value < seats.length) {
    const a = (seats[majority.value - 1].angle + seats[majority.value].angle) / 2;
    tick = {
      x1: CX + (R_IN - 10) * Math.cos(a), y1: CY - (R_IN - 10) * Math.sin(a),
      x2: CX + (R_OUT + 10) * Math.cos(a), y2: CY - (R_OUT + 10) * Math.sin(a),
    };
  }

  return (
    <div className="hemi">
      <svg
        key={total}
        viewBox={`${-pad} ${-pad} ${vw} ${vh}`}
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setHover(null)}
      >
        {seats.map((s, i) => {
          const g = owner[i];
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={dot}
              fill={g ? fillRef(g.fill) : '#e5e8eb'}
              className={hover && g && hover.key !== g.key ? 'seat dim' : 'seat'}
              style={{ animationDelay: `${i * (700 / total)}ms`, transitionDelay: `${i * (500 / total)}ms` }}
              onPointerEnter={() => setHover(g ?? null)}
            />
          );
        })}
        {tick && <line className="hemi-tick" {...tick} />}
      </svg>
      {tick && majority && (
        <span className="hemi-majority" style={{ left: `${((tick.x2 + pad) / vw) * 100}%`, top: `${((tick.y2 + pad) / vh) * 100}%` }}>{majority.label}</span>
      )}
      <div className="hemi-center">
        {hover ? (
          <>
            <span>{hover.label}</span>
            <strong>{hover.value}</strong>
          </>
        ) : children}
      </div>
    </div>
  );
}
