import { useEffect, useMemo, useRef, useState } from 'react';
import type { Race } from '../lib/types';
import { CHAMBER_LABEL, isDecided, outcomeText, raceCode, raceTitle } from '../lib/classify';
import { PALETTE, partyColor } from '../lib/colors';
import { stateName } from '../lib/states';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

/** 주·선거구·후보 이름으로 선거를 찾아 바로 이동. '/' 키로 포커스 */
export function SearchBox({ races, onPick }: { races: Race[]; onPick: (r: Race) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const index = useMemo(() => races.map((r) => ({
    r,
    text: norm([
      raceTitle(r), raceCode(r), stateName(r.state), r.state, CHAMBER_LABEL[r.chamber], r.description ?? '',
      r.incumbent?.name ?? '', ...r.result.candidates.map((c) => c.name),
    ].join(' ')),
  })), [races]);

  const hits = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    return index
      .filter((x) => x.text.includes(n))
      // 코드·제목이 정확히 시작하면 앞으로
      .sort((a, b) => Number(!norm(raceCode(a.r)).startsWith(n)) - Number(!norm(raceCode(b.r)).startsWith(n)))
      .slice(0, 8)
      .map((x) => x.r);
  }, [q, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (r: Race) => {
    onPick(r);
    setQ('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search-box" role="combobox" aria-expanded={open && hits.length > 0} aria-haspopup="listbox">
      <svg className="search-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        type="search"
        placeholder="주, 선거구, 후보 검색"
        aria-label="선거 검색"
        aria-autocomplete="list"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && hits[active]) pick(hits[active]);
          else if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
        }}
      />
      <kbd aria-hidden>/</kbd>
      {open && hits.length > 0 && (
        <ul className="search-list" role="listbox">
          {hits.map((r, i) => {
            const lead = r.result.candidates[0];
            return (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  className={i === active ? 'on' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                >
                  <span className="search-code">{raceCode(r)}</span>
                  <span className="search-main">
                    <b>{raceTitle(r)}</b>
                    <small>{CHAMBER_LABEL[r.chamber]} · {outcomeText(r)}</small>
                  </span>
                  {lead && <i style={{ background: isDecided(r) ? partyColor(r.result.winner!) : PALETTE.pending }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
