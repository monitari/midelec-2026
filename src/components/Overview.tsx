import { useMemo } from 'react';
import type { Chamber, ElectionData } from '../lib/types';
import { CHAMBER_LABEL } from '../lib/classify';
import { PALETTE, PARTY_NAME } from '../lib/colors';
import { CHAMBERS, headline, racesOf } from '../lib/story';
import { summarize } from '../lib/tally';
import { RollingNumber } from './ui';

/** 한 줄 요약 + 선거 종류 타일. 타일이 곧 상원·하원·주지사 탭이다 */
export function Overview({ data, value, onChange, source }: {
  data: ElectionData;
  value: Chamber;
  onChange: (c: Chamber) => void;
  source: string;
}) {
  const story = useMemo(() => headline(data), [data]);
  const tiles = useMemo(
    () => CHAMBERS.map((c) => ({ c, s: summarize(data, c, racesOf(data, c), 'result', source) })),
    [data, source],
  );
  return (
    <section className="overview">
      <div className="story-block">
        <h2 className="story">{story.title}</h2>
        <p className="story-sub">{story.sub}</p>
      </div>
      <div className="tiles" role="tablist" aria-label="선거 종류">
        {tiles.map(({ c, s }) => {
          const ctl = s.control;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={value === c}
              className={`tile${value === c ? ' on' : ''}${ctl?.decided ? ` won-${ctl.party}` : ''}`}
              onClick={() => onChange(c)}
            >
              <span className="tile-head">
                <b>{CHAMBER_LABEL[c]}</b>
                <span className="tile-status">
                  {ctl?.decided ? <><i style={{ background: PALETTE[ctl.party] }} />{PARTY_NAME[ctl.party]} 다수당</>
                    : ctl ? '다수당 미확정' : `${s.total}개 주`}
                </span>
              </span>
              <span className="tile-nums">
                <span><i style={{ background: PALETTE.D }} /><RollingNumber value={s.left.value} /></span>
                {s.center && s.center.value > 0 && <span className="tile-mid">미결정 {s.center.value}</span>}
                <span><RollingNumber value={s.right.value} /><i style={{ background: PALETTE.R }} /></span>
              </span>
              <span className="tile-bar" aria-hidden>
                {s.segments.filter((g) => g.value).map((g) => (
                  <i key={g.key} style={{ flexGrow: g.value, background: g.fill.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
