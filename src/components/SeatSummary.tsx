import type { Control, Summary } from '../lib/tally';
import { PARTY_NAME } from '../lib/colors';
import { fmtKst } from '../lib/format';
import { RollingNumber } from './ui';

function ControlBanner({ c, chamberLabel }: { c: Control; chamberLabel: string }) {
  if (!c.decided) {
    return (
      <div className="control-banner tone-pending">
        <strong>{chamberLabel} 다수당 미확정</strong>
        <span>과반까지 민주 {c.need.D}석 · 공화 {c.need.R}석 남음</span>
      </div>
    );
  }
  return (
    <div className={`control-banner tone-${c.party}`}>
      <strong>{PARTY_NAME[c.party]} {chamberLabel} 다수당 확정</strong>
      <span>{c.seats}석째: {c.clincher} · {fmtKst(c.at)} 승자 발표</span>
    </div>
  );
}

export function SeatSummary({ s, chamberLabel }: { s: Summary; chamberLabel: string }) {
  // 구성이 바뀌면(모드 전환 등) 막대를 왼쪽부터 다시 펼치고, 같은 구성에서 값만 바뀌면 너비가 부드럽게 변한다
  const signature = s.segments.map((g) => g.key).join('|');
  return (
    <div className="summary">
      {s.control && <ControlBanner c={s.control} chamberLabel={chamberLabel} />}
      <div className="summary-head">
        <div className="summary-side d">
          <span className="summary-label">{s.left.label}</span>
          <strong className="summary-num"><RollingNumber value={s.left.value} /></strong>
          {s.left.sub && <span className="summary-sub">{s.left.sub}</span>}
        </div>
        {s.center && (
          <div className="summary-center">
            <span className="summary-label">{s.center.label}</span>
            <strong><RollingNumber value={s.center.value} /></strong>
          </div>
        )}
        <div className="summary-side r">
          <span className="summary-label">{s.right.label}</span>
          <strong className="summary-num"><RollingNumber value={s.right.value} /></strong>
          {s.right.sub && <span className="summary-sub">{s.right.sub}</span>}
        </div>
      </div>

      <div className="seatbar-wrap">
        <div className="seatbar" key={signature} role="img"
          aria-label={s.segments.filter((g) => g.value).map((g) => `${g.label} ${g.value}`).join(', ')}>
          {s.segments.map((g) => (
            <i key={g.key} style={{ width: `${(g.value / s.total) * 100}%`, background: g.fill.color }} title={`${g.label} ${g.value}`} />
          ))}
        </div>
        {s.majority && (
          <div className="majority" style={{ left: `${(s.majority.value / s.total) * 100}%` }}>
            <span>{s.majority.label}</span>
          </div>
        )}
      </div>

      <div className="summary-legend">
        {s.segments.filter((g) => g.value).map((g) => (
          <span key={g.key} className="summary-key">
            <i style={{ background: g.fill.color }} />
            {g.label} <b>{g.value}</b>
          </span>
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
