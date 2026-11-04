import { useMemo, useState } from 'react';
import type { Race } from '../lib/types';
import {
  currentForecast, frozenForecast, isDecided, marginPts, outcome, outcomeText, raceCode, raceTitle, voteShares,
} from '../lib/classify';
import { PALETTE, PARTY_SHORT, RATING_COLOR, partyColor } from '../lib/colors';
import { RATING_LABEL, isCompetitive } from '../lib/ratings';
import { fmtTime } from '../lib/format';
import { stateName } from '../lib/states';
import { PartyDot } from './ui';

interface Props {
  races: Race[];
  source: string;
  freezeAt: string;
  onSelect: (id: string) => void;
  selectedId: string | null;
  /** 직전 갱신 이후 새로 승자가 발표된 선거 */
  fresh?: Set<string>;
}

const tone = (r: Race) => (isDecided(r) ? r.result.winner! : 'pending');

function MiniBar({ race }: { race: Race }) {
  const s = voteShares(race);
  const d = s.find((c) => c.party === 'D')?.pct ?? 0;
  const rr = s.find((c) => c.party !== 'D' && c.party !== 'O')?.pct ?? 0;
  const rParty = s.find((c) => c.party !== 'D' && c.party !== 'O')?.party ?? 'R';
  return (
    <div className="minibar">
      <div className="minibar-nums">
        <span style={{ color: PALETTE.D }}>{d.toFixed(1)}</span>
        <span style={{ color: partyColor(rParty) }}>{rr.toFixed(1)}</span>
      </div>
      <div className="minibar-track">
        <i style={{ width: `${d}%`, background: PALETTE.D }} />
        <i style={{ width: `${rr}%`, background: partyColor(rParty), marginLeft: 'auto' }} />
      </div>
    </div>
  );
}

export function KeyRaces({ races, source, freezeAt, onSelect, selectedId }: Props) {
  const list = useMemo(() => races
    .filter((r) => isCompetitive(frozenForecast(r, source, freezeAt)?.rating))
    .sort((a, b) => {
      const ta = frozenForecast(a, source, freezeAt)?.rating === 'tossup' ? 0 : 1;
      const tb = frozenForecast(b, source, freezeAt)?.rating === 'tossup' ? 0 : 1;
      return ta - tb || marginPts(a) - marginPts(b);
    })
    .slice(0, 16), [races, source, freezeAt]);
  if (!list.length) return <p className="empty">조건에 맞는 승부처가 없어요.</p>;
  return (
    <div className="hscroll">
      {list.map((r) => {
        const f = frozenForecast(r, source, freezeAt)!;
        return (
          <button key={r.id} className={`kcard${selectedId === r.id ? ' on' : ''}`} onClick={() => onSelect(r.id)}>
            <div className="kcard-top">
              <span className="kcard-code">{raceCode(r)}</span>
              <span className="rating-dot" style={{ background: RATING_COLOR[f.rating] }} title={RATING_LABEL[f.rating]} />
              <span className="muted">{RATING_LABEL[f.rating]}</span>
            </div>
            <b className="kcard-title">{raceTitle(r)}</b>
            <MiniBar race={r} />
            <span className={`kcard-out tone-${tone(r)}`}>
              {outcome(r) === 'flip' && <span className="flip-mark">교체</span>}
              {outcomeText(r)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RecentCalls({ races, onSelect, fresh }: Props) {
  const list = useMemo(() => races
    .filter((r) => r.result.calledAt)
    .sort((a, b) => Date.parse(b.result.calledAt!) - Date.parse(a.result.calledAt!))
    .slice(0, 8), [races]);
  if (!list.length) return <p className="empty">아직 발표된 결과가 없어요.</p>;
  return (
    <ul className="rows">
      {list.map((r) => (
        <li key={r.id} className={fresh?.has(r.id) ? 'fresh' : undefined}>
          <button onClick={() => onSelect(r.id)}>
            <span className="row-time">{fresh?.has(r.id) ? <span className="new-tag">NEW</span> : fmtTime(r.result.calledAt!)}</span>
            <span className="row-main">
              <b>{raceTitle(r)}</b>
              <span className={`tone-${tone(r)}`}>{outcomeText(r)}</span>
            </span>
            {outcome(r) === 'flip' && <span className="flip-mark">교체</span>}
            <span className="chev">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type SortKey = 'name' | 'margin' | 'reporting';

export function RaceTable({ races, source, onSelect, selectedId, fresh }: Props) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [limit, setLimit] = useState(30);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? races.filter((r) =>
          [raceTitle(r), raceCode(r), stateName(r.state), r.incumbent?.name ?? '', ...r.result.candidates.map((c) => c.name)]
            .some((s) => s.toLowerCase().includes(needle)))
      : races;
    return [...filtered].sort((a, b) =>
      sort === 'margin' ? marginPts(a) - marginPts(b)
        : sort === 'reporting' ? (a.result.expectedPct ?? 100) - (b.result.expectedPct ?? 100)
          : raceCode(a).localeCompare(raceCode(b)));
  }, [races, q, sort]);

  return (
    <div className="table-wrap">
      <div className="table-tools">
        <input className="search" placeholder="주, 선거구, 후보 이름 검색" value={q} onChange={(e) => { setQ(e.target.value); setLimit(30); }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="정렬">
          <option value="name">이름순</option>
          <option value="margin">접전순</option>
          <option value="reporting">개표율 낮은 순</option>
        </select>
        <span className="muted">{rows.length}개</span>
      </div>
      <div className="table-scroll">
        <table className="races">
          <thead>
            <tr>
              <th>지역</th>
              <th>기존</th>
              <th>예측</th>
              <th>결과</th>
              <th className="num">격차</th>
              <th className="num">개표</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const f = currentForecast(r, source);
              return (
                <tr key={r.id} className={[selectedId === r.id ? 'on' : '', fresh?.has(r.id) ? 'fresh' : ''].join(' ').trim() || undefined} onClick={() => onSelect(r.id)}>
                  <td>
                    <b>{raceCode(r)}</b>{fresh?.has(r.id) && <span className="new-tag">NEW</span>}
                    <small>{raceTitle(r)}</small>
                  </td>
                  <td>
                    {r.heldBy ? <><PartyDot color={partyColor(r.heldBy)} />{PARTY_SHORT[r.heldBy]}</> : <span className="muted">새 경계</span>}
                    {!r.incumbent?.running && <small>{r.incumbent || r.seatStatus === 'vacant' ? '열린 선거' : '현직 없음'}</small>}
                  </td>
                  <td>{f ? <span className="rating-text"><i style={{ background: RATING_COLOR[f.rating] }} />{RATING_LABEL[f.rating]}</span> : <span className="muted">없음</span>}</td>
                  <td className={`tone-${tone(r)}`}>
                    {outcome(r) === 'flip' && <span className="flip-mark">교체</span>}
                    {outcomeText(r)}
                  </td>
                  <td className="num">{r.result.uncontested ? '무투표' : marginPts(r).toFixed(1)}</td>
                  <td className="num">{r.result.expectedPct == null ? '–' : `${r.result.expectedPct.toFixed(0)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="more" onClick={() => setLimit((l) => l + 50)}>더 보기 ({rows.length - limit}개 남음)</button>
      )}
    </div>
  );
}
