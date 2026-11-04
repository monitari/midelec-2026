import type { Summary } from '../lib/tally';
import { PALETTE } from '../lib/colors';
import { Hemicycle } from './Hemicycle';
import { RollingNumber } from './ui';

export function SeatSummary({ s, chamberLabel, compact = false }: { s: Summary; chamberLabel: string; compact?: boolean }) {
  const parts = s.segments.filter((g) => g.value);
  // 지역을 고른 동안에는 상세에 자리를 내주고 한 줄로 줄어든다
  if (compact) {
    return (
      <div className="summary compact" aria-label={`${chamberLabel} ${s.left.label} ${s.left.value}, ${s.right.label} ${s.right.value}`}>
        <div className="compact-row">
          <span><i style={{ background: PALETTE.D }} />{s.left.label} <b><RollingNumber value={s.left.value} /></b></span>
          {s.center && <span className="compact-mid">{s.center.label} {s.center.value}</span>}
          <span><b><RollingNumber value={s.right.value} /></b> {s.right.label}<i style={{ background: PALETTE.R }} /></span>
        </div>
        <div className="compact-bar">
          {parts.map((g) => <i key={g.key} style={{ flexGrow: g.value, background: g.fill.color }} title={`${g.label} ${g.value}`} />)}
          {s.majority && <span className="compact-tick" style={{ left: `${(s.majority.value / s.total) * 100}%` }} />}
        </div>
      </div>
    );
  }
  return (
    <div className="summary">
      <div className="summary-main">
        <div className="summary-side">
          <span className="summary-label"><i style={{ background: PALETTE.D }} />{s.left.label}</span>
          <strong className="summary-num"><RollingNumber value={s.left.value} /></strong>
          {s.left.sub && <span className="summary-sub">{s.left.sub}</span>}
        </div>
        <Hemicycle
          segments={s.segments}
          total={s.total}
          majority={s.majority}
          ariaLabel={`${chamberLabel} ${parts.map((g) => `${g.label} ${g.value}`).join(', ')}`}
        >
          {s.center && (
            <>
              <span>{s.center.label}</span>
              <strong><RollingNumber value={s.center.value} /></strong>
            </>
          )}
        </Hemicycle>
        <div className="summary-side r">
          <span className="summary-label">{s.right.label}<i style={{ background: PALETTE.R }} /></span>
          <strong className="summary-num"><RollingNumber value={s.right.value} /></strong>
          {s.right.sub && <span className="summary-sub">{s.right.sub}</span>}
        </div>
      </div>

      <div className="summary-legend" aria-hidden>
        {parts.map((g) => (
          <span key={g.key} className="summary-key"><i style={{ background: g.fill.color }} />{g.label}</span>
        ))}
      </div>

      {s.chips.length > 0 && (
        <div className="summary-chips">
          {s.chips.map((c) => (
            <span key={c.label} className={`pill ${c.tone ? `pill-${c.tone}` : ''}`}>{c.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
