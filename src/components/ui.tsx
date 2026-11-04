import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PALETTE, fillKey, fillRef, partyColor, type Fill } from '../lib/colors';
import type { Party } from '../lib/types';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 값이 바뀌면 이전 값에서 굴러가듯 올라가거나 내려가는 숫자 */
export function RollingNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || prefersReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

/** 선택된 탭 아래·뒤로 미끄러지는 표시자의 위치 (컨테이너 기준) */
export function useIndicator(container: RefObject<HTMLElement>, activeSelector: string, deps: unknown[]) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(activeSelector);
      setBox(on ? { left: on.offsetLeft, width: on.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

export interface Option<T extends string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', stretch = false, ariaLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  stretch?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, 'button.on', [value, options.length]);
  return (
    <div
      ref={ref}
      className={`seg seg-${size}${stretch ? ' seg-stretch' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        // 좌우 화살표로 다음·이전 탭 (비활성 탭은 건너뜀)
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const enabled = options.filter((o) => !o.disabled);
        const i = enabled.findIndex((o) => o.id === value) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = enabled[(i + enabled.length) % enabled.length];
        onChange(next.id);
        ref.current?.querySelectorAll<HTMLButtonElement>('button')[options.indexOf(next)]?.focus();
      }}
    >
      {box && <span className="seg-thumb" style={{ transform: `translateX(${box.left}px)`, width: box.width }} aria-hidden />}
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className={o.id === value ? 'on' : ''}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <label className="select">
      <span className="select-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {String(o.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{children}</span>
    </label>
  );
}

export function Swatch({ fill, size = 14 }: { fill: Fill; size?: number }) {
  return (
    <svg className="swatch" width={size} height={size} aria-hidden>
      <rect width={size} height={size} rx={4} style={{ fill: fillRef(fill) }} />
      {fill.edge && <rect x={0.75} y={0.75} width={size - 1.5} height={size - 1.5} rx={3.5} fill="none" stroke={fill.edge} strokeWidth={1.5} />}
    </svg>
  );
}

/** 문서 전체에서 공유하는 지도 무늬. 사용 중인 채움만 정의한다 */
export function PatternDefs({ fills }: { fills: Fill[] }) {
  const unique = new Map<string, Fill>();
  for (const f of fills) if (f.pattern) unique.set(fillKey(f), f);
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {[...unique].map(([id, f]) =>
          f.pattern === 'hatch' ? (
            <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
              <rect width={5} height={5} style={{ fill: f.color }} />
              <rect width={1.6} height={5} style={{ fill: f.mark ?? '#fff' }} opacity={f.mark ? 0.9 : 0.55} />
            </pattern>
          ) : (
            <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={4.5} height={4.5}>
              <rect width={4.5} height={4.5} style={{ fill: f.color }} />
              <circle cx={2.25} cy={2.25} r={0.95} style={{ fill: f.mark ?? '#fff' }} opacity={f.mark ? 0.95 : 0.7} />
            </pattern>
          ),
        )}
      </defs>
    </svg>
  );
}

/** 후보 얼굴. 공식 사진이 있으면 정당색 테두리를 두른 사진, 없거나 못 불러오면 정당색 이니셜 */
export function Avatar({ name, party, size = 32, photo }: { name: string; party: Party; size?: number; photo?: string }) {
  const [failed, setFailed] = useState(false);
  const color = party === 'O' ? PALETTE.pending : partyColor(party);
  if (photo && !failed) {
    return (
      <span className="avatar photo" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${color}` }} aria-hidden>
        <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  }
  const parts = name.replace(/\(.*\)/, '').trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  // '기타 n명'·'기명 투표'처럼 사람이 아닌 줄은 이니셜 대신 말줄임
  const initials = /^(기타|기명)/.test(name) ? '…'
    : parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : (parts[0]?.slice(0, 2) ?? '?');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: color }} aria-hidden>
      {initials.toUpperCase()}
    </span>
  );
}

export function PartyDot({ color }: { color: string }) {
  return <span className="party-dot" style={{ background: color }} aria-hidden />;
}
