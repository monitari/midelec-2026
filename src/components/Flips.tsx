import { useMemo } from 'react';
import type { Race } from '../lib/types';
import { marginPts, outcome, priorParty, raceCode, raceTitle } from '../lib/classify';
import { PARTY_SHORT, partyColor } from '../lib/colors';
import { Avatar } from './ui';

/** 정당이 바뀐 자리. 격차가 작은 곳부터 */
export function Flips({ races, onSelect, selectedId }: { races: Race[]; onSelect: (id: string) => void; selectedId: string | null }) {
  const list = useMemo(
    () => races.filter((r) => outcome(r) === 'flip').sort((a, b) => marginPts(a) - marginPts(b)),
    [races],
  );
  if (!list.length) return <p className="empty">아직 정당이 바뀐 곳이 없어요.</p>;
  return (
    <div className="flips">
      {list.map((r) => {
        const from = priorParty(r)!;
        const to = r.result.winner!;
        return (
          <button key={r.id} className={`flip-card to-${to}${selectedId === r.id ? ' on' : ''}`} onClick={() => onSelect(r.id)}>
            <span className="flip-route" aria-label={`${PARTY_SHORT[from]}에서 ${PARTY_SHORT[to]}로`}>
              <i style={{ background: partyColor(from) }} />
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden><path d="M1 5h14M11 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <i style={{ background: partyColor(to) }} />
            </span>
            <span className="flip-code">{raceCode(r)}</span>
            <b className="flip-title">{raceTitle(r)}</b>
            <span className="flip-winner">
              <Avatar name={r.result.winnerName ?? ''} party={to} size={22} />
              {r.result.winnerName}
            </span>
            <span className="flip-margin">+{marginPts(r).toFixed(1)}%p</span>
          </button>
        );
      })}
    </div>
  );
}
