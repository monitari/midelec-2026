import { useMemo, useRef } from 'react';
import type { Chamber, ElectionData } from '../lib/types';
import { CHAMBER_LABEL } from '../lib/classify';
import { PALETTE, PARTY_NAME } from '../lib/colors';
import { CHAMBERS, headline, racesOf } from '../lib/story';
import { summarize } from '../lib/tally';
import { RollingNumber, useIndicator } from './ui';

/** 데이터로 만든 한 줄 요약 */
export function Story({ data }: { data: ElectionData }) {
  const story = useMemo(() => headline(data), [data]);
  return (
    <div className="story-block">
      <h2 className="story">{story.title}</h2>
      <p className="story-sub">{story.sub}</p>
    </div>
  );
}

/** 상원·하원·주지사 전환 겸 한눈에 보기 (상단 막대에 들어가는 작은 타일) */
export function ChamberSwitch({ data, value, onChange, source }: {
  data: ElectionData;
  value: Chamber;
  onChange: (c: Chamber) => void;
  source: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ink = useIndicator(ref, '.chip-tile.on', [value]);
  const tiles = useMemo(
    () => CHAMBERS.map((c) => ({ c, s: summarize(data, c, racesOf(data, c), 'result', source) })),
    [data, source],
  );
  return (
    <div
      ref={ref}
      className="chamber-switch"
      role="tablist"
      aria-label="선거 종류"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const i = CHAMBERS.indexOf(value) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = CHAMBERS[(i + CHAMBERS.length) % CHAMBERS.length];
        onChange(next);
        ref.current?.querySelectorAll<HTMLButtonElement>('button')[CHAMBERS.indexOf(next)]?.focus();
      }}
    >
      {ink && <span className="switch-thumb" style={{ transform: `translateX(${ink.left}px)`, width: ink.width }} aria-hidden />}
      {tiles.map(({ c, s }) => {
        const ctl = s.control;
        const on = value === c;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`chip-tile${on ? ' on' : ''}`}
            onClick={() => onChange(c)}
            title={ctl?.decided ? `${PARTY_NAME[ctl.party]} 다수당 확정` : undefined}
          >
            <span className="chip-tile-head">
              <b>{CHAMBER_LABEL[c]}</b>
              {ctl?.decided && <i style={{ background: PALETTE[ctl.party] }} aria-label={`${PARTY_NAME[ctl.party]} 다수당`} />}
            </span>
            <span className="chip-tile-nums">
              <RollingNumber value={s.left.value} />
              <span className="sep">:</span>
              <RollingNumber value={s.right.value} />
            </span>
            <span className="chip-tile-bar" aria-hidden>
              {s.segments.filter((g) => g.value).map((g) => <i key={g.key} style={{ flexGrow: g.value, background: g.fill.color }} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 사이트 로고: 의석 반원을 민주·공화 두 색으로 나눈 독자 도안 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#191f28" />
      <path d="M6 21a10 10 0 0 1 10-10v4.5A5.5 5.5 0 0 0 10.5 21Z" fill={PALETTE.D} />
      <path d="M26 21a10 10 0 0 0-10-10v4.5a5.5 5.5 0 0 1 5.5 5.5Z" fill={PALETTE.R} />
      <circle cx="16" cy="21" r="2.2" fill="#fff" />
    </svg>
  );
}
