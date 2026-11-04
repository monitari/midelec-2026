import type { ReactNode } from 'react';
import type { Chamber, ElectionData, Mode, Race } from '../lib/types';
import {
  CHAMBER_LABEL, STATUS_LABEL, currentForecast, swingOf, frozenForecast, isDecided, leaderParty, marginPts, outcome,
  outcomeText, previousForecast, priorParty, raceCode, raceTitle, verdict, voteShares,
} from '../lib/classify';
import { PALETTE, PARTY_NAME, PARTY_SHORT, RATING_COLOR, partyColor } from '../lib/colors';
import { RATING_LABEL } from '../lib/ratings';
import { fmtDay, fmtEt, fmtKst, fmtNum, fmtPct } from '../lib/format';
import { stateName } from '../lib/states';
import { Avatar, PartyDot } from './ui';
import { CountyMap } from './CountyMap';

interface Common {
  data: ElectionData;
  mode: Mode;
  source: string;
  onSelect: (sel: { type: 'race'; id: string } | { type: 'state'; state: string }) => void;
}

// ── 경주 상세 ─────────────────────────────────────────────

export function RaceDetail({ race, ...c }: Common & { race: Race }) {
  const counties = race.chamber !== 'house' && (
    <Section key="cm" title="카운티별 결과"><CountyMap race={race} /></Section>
  );
  const sections: Record<Mode, ReactNode[]> = {
    result: [<Result key="r" race={race} />, counties, <Forecast key="f" race={race} {...c} />, <Baseline key="b" race={race} {...c} />],
    forecast: [<Forecast key="f" race={race} {...c} />, <Baseline key="b" race={race} {...c} />, <Result key="r" race={race} />],
    baseline: [<Baseline key="b" race={race} {...c} />, <Forecast key="f" race={race} {...c} />, <Result key="r" race={race} />],
    compare: [<Compare key="c" race={race} {...c} />, <Result key="r" race={race} />, counties, <Forecast key="f" race={race} {...c} />, <Baseline key="b" race={race} {...c} />],
  };
  return (
    <div className="detail">
      <header className="detail-head">
        <div className="detail-eyebrow">
          {raceCode(race)} · {CHAMBER_LABEL[race.chamber]}
          {race.chamber === 'house' && (
            <button className="link" onClick={() => c.onSelect({ type: 'state', state: race.state })}>
              {stateName(race.state)} 전체 보기
            </button>
          )}
        </div>
        <h2>{raceTitle(race)}</h2>
        {race.description && <p className="detail-desc">{race.description}</p>}
        <div className="badges">
          <span className="badge-pill">{race.kind === 'special' ? '특별선거' : '정규선거'}</span>
          {race.heldBy ? (
            <span className="badge-pill"><PartyDot color={partyColor(race.heldBy)} />기존 {PARTY_SHORT[race.heldBy]}</span>
          ) : (
            <span className="badge-pill">새 경계 · 기존 보유 없음</span>
          )}
          {race.seatStatus === 'vacant' ? (
            <span className="badge-pill warn">실제 공석</span>
          ) : race.incumbent?.running ? (
            <span className="badge-pill">현직 출마</span>
          ) : (
            <span className="badge-pill">{race.boundaryChanged && !race.incumbent ? '출마한 현직 없음' : '현직 불출마 · 열린 선거'}</span>
          )}
          {race.result.rankedChoice && <span className="badge-pill">순위선택투표</span>}
          {race.boundaryChanged && <span className="badge-pill warn">경계 변경</span>}
        </div>
      </header>
      {sections[c.mode]}
      <Sources race={race} {...c} />
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="dsec">
      <div className="dsec-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const STEPS = ['pending', 'counting', 'called', 'certified'] as const;
const STEP_OF = { pending: 0, counting: 1, runoff: 1, called: 2, certified: 3 } as const;

function Result({ race }: { race: Race }) {
  const res = race.result;
  const decided = isDecided(race);
  const o = outcome(race);
  const shares = voteShares(race);
  const lead = leaderParty(race);
  const gap = shares.length > 1 ? shares[0].votes - shares[1].votes : 0;
  const stepIdx = STEP_OF[res.status];
  const tone = decided ? res.winner! : 'pending';
  return (
    <Section title="결과" aside={res.expectedPct != null && <span className="dsec-meta">개표 {res.expectedPct.toFixed(0)}%</span>}>
      <ol className="stepper" aria-label="결과 단계">
        {STEPS.map((s, i) => (
          <li key={s} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}>{STATUS_LABEL[s]}</li>
        ))}
      </ol>

      <div className={`verdict tone-${tone}`}>
        {res.status === 'runoff' ? (
          <>
            <strong>결선 투표 예정</strong>
            <span>과반 득표자가 없어 {res.runoff?.length ? res.runoff.join(' · ') : '상위 후보'}가 결선에서 다시 맞붙어요.</span>
            {res.runoffAt && <span>결선 진출 발표 {fmtKst(res.runoffAt)} · 결선 일정은 주 선거당국 발표 기준</span>}
          </>
        ) : decided ? (
          <>
            <strong>{o === 'flip' ? `${PARTY_NAME[res.winner!]} 획득` : outcomeText(race)}</strong>
            {res.winnerName && <span>{res.winnerName} 당선{res.uncontested ? ' (무투표)' : ''}</span>}
            {o === 'flip' && <span>{PARTY_SHORT[priorParty(race)!]} → {PARTY_SHORT[res.winner!]} 정당 교체</span>}
            {o === 'unclassified' && <span>새 경계 · 교체 판정 없음</span>}
          </>
        ) : (
          <>
            <strong>{lead ? `${PARTY_SHORT[lead]} 후보 현재 선두` : '개표 전'}</strong>
            <span>승자 발표 전{res.rankedChoice ? ' · 과반 미달 시 순위선택 집계' : ''}</span>
          </>
        )}
      </div>

      {res.uncontested && <p className="empty">무투표 당선으로 득표를 집계하지 않았어요.</p>}
      <ul className="cands">
        {shares.map((c, i) => (
          <li key={c.name + i} className={decided && i === 0 ? 'win' : ''}>
            <div className="cand-row">
              <Avatar name={c.name} party={c.party} size={34} photo={c.photo} />
              <span className="cand-name">
                {c.name}
                {c.incumbent && <em>현직</em>}
                {decided && i === 0 && <em className="win-tag">당선</em>}
              </span>
              <span className="cand-pct">{fmtPct(c.pct)}</span>
            </div>
            <div className="cand-bar">
              <i style={{ width: `${c.pct}%`, background: c.party === 'O' ? PALETTE.pending : partyColor(c.party), opacity: decided || i > 0 ? 1 : 0.55 }} />
            </div>
            <div className="cand-votes">{fmtNum(c.votes)}표 · {c.party === 'O' ? c.partyCode : PARTY_SHORT[c.party]}</div>
          </li>
        ))}
      </ul>
      <p className="dnote">
        {res.uncontested ? '무투표' : <>격차 {marginPts(race).toFixed(1)}%p ({fmtNum(gap)}표)</>}
        {swingOf(race) != null && <> · 2024 대선 대비 {swingOf(race)! >= 0 ? '민주' : '공화'} 쪽 {Math.abs(swingOf(race)!).toFixed(1)}%p</>}
        {res.calledAt && <> · 승자 발표 {fmtKst(res.calledAt)}</>}
      </p>
    </Section>
  );
}

function RatingChip({ rating, label }: { rating: keyof typeof RATING_LABEL; label?: string }) {
  return (
    <span className="rating-chip" style={{ ['--c' as string]: RATING_COLOR[rating] }}>
      <i />{RATING_LABEL[rating]}{label && <small>{label}</small>}
    </span>
  );
}

function Forecast({ race, data, source }: Common & { race: Race }) {
  const src = data.forecastSources.find((s) => s.id === source)!;
  const cur = currentForecast(race, source);
  const prev = previousForecast(race, source);
  const others = data.forecastSources.filter((s) => s.id !== source);
  return (
    <Section title="예측" aside={<span className="dsec-meta">{src.name}</span>}>
      {cur ? (
        <>
          <div className="fc-main">
            <RatingChip rating={cur.rating} label={`원문 "${cur.label}"`} />
          </div>
          {cur.implied && <p className="dnote" style={{ marginTop: 0, marginBottom: 10 }}>경합 목록 외 · 안정권으로 간주</p>}
          <dl className="kv">
            <dt>평가 기준일</dt><dd>{fmtDay(cur.publishedAt)}</dd>
            <dt>처음 반영</dt><dd>{fmtKst(cur.ingestedAt)}</dd>
            {prev && (
              <>
                <dt>이전 등급</dt>
                <dd>{RATING_LABEL[prev.rating]} <small>({prev.label}, {fmtDay(prev.publishedAt)})</small></dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p className="empty">이 출처는 이 선거를 평가하지 않았어요 (예측 없음).</p>
      )}
      <ul className="fc-others">
        {others.map((s) => {
          const f = currentForecast(race, s.id);
          return (
            <li key={s.id}>
              <span>{s.name}</span>
              {f ? <RatingChip rating={f.rating} label={f.label} /> : <span className="muted">예측 없음</span>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Compare({ race, data, source }: Common & { race: Race }) {
  const f = frozenForecast(race, source, data.meta.forecastFreezeAt);
  const v = verdict(race, source, data.meta.forecastFreezeAt);
  const text = {
    expected: '예상대로',
    tossup: '경합지 승부',
    upset: '예상 밖 결과',
    unrated: '선거 전 예측 없음',
    pending: '결과 대기',
  }[v];
  return (
    <Section title="예측 ↔ 결과" aside={<span className={`pill ${v === 'upset' ? 'pill-neutral' : ''}`}>{text}</span>}>
      <div className="compare">
        <div>
          <span className="muted">선거 직전 마지막 평가</span>
          {f ? <RatingChip rating={f.rating} label={f.label} /> : <b>없음</b>}
          {f && <small className="muted">{fmtDay(f.publishedAt)} 발표</small>}
        </div>
        <span className="compare-arrow">→</span>
        <div>
          <span className="muted">실제 결과</span>
          <b>{isDecided(race) ? outcomeText(race) : '미발표'}</b>
        </div>
      </div>
    </Section>
  );
}

function Baseline({ race, data }: Common & { race: Race }) {
  const inc = race.incumbent;
  return (
    <Section title="선거 전 현황">
      <dl className="kv">
        <dt>현재 자리</dt>
        <dd>{race.seatStatus === 'vacant' ? '실제 공석' : '재직자 있음'}</dd>
        <dt>현직</dt>
        <dd>
          {inc ? <><PartyDot color={partyColor(inc.party)} />{inc.name} ({PARTY_SHORT[inc.party]})</> : '없음'}
        </dd>
        <dt>이번 구도</dt>
        <dd>{race.seatStatus === 'vacant' ? '공석 선거' : inc?.running ? '현직 출마' : race.boundaryChanged && !inc ? '새 경계 · 출마한 현직 없음' : '현직 불출마로 열린 선거'}</dd>
        <dt>기존 보유</dt>
        <dd>{race.heldBy ? PARTY_NAME[race.heldBy] : '없음 (새 경계)'}</dd>
        {race.pres2024 != null && (
          <>
            <dt>2024 대선</dt>
            <dd>
              {race.pres2024 >= 0 ? '해리스' : '트럼프'} +{Math.abs(race.pres2024).toFixed(1)}%p
              {race.boundaryChanged && <small> (새 경계 기준)</small>}
            </dd>
          </>
        )}
        {race.chamber === 'senate' && (
          <>
            <dt>주 상원 2석</dt>
            <dd>{data.senateSeats[race.state].map((p, i) => <span key={i} className="seat-dot" style={{ background: partyColor(p) }} />)}</dd>
          </>
        )}
      </dl>
      {race.boundaryChanged && (
        <div className="notice">
          <b>새 경계 선거구</b>
          같은 번호의 이전 선거구와 지역이 달라 정당 교체를 판정하지 않아요.
        </div>
      )}
    </Section>
  );
}

function Sources({ race, data, source }: Common & { race: Race }) {
  const src = data.forecastSources.find((s) => s.id === source)!;
  return (
    <section className="dsec sources">
      <h3>출처 · 갱신</h3>
      <ul>
        <li>
          결과 <a href={race.result.url ?? data.meta.resultSource.url} target="_blank" rel="noreferrer">{data.meta.resultSource.name}</a>
          <span>{fmtKst(race.result.updatedAt)} 업데이트</span>
        </li>
        {race.result.calledAt && (
          <li>
            승자 판정 {race.result.calledBy}
            <span>{fmtKst(race.result.calledAt)} · 미 동부 {fmtEt(race.result.calledAt)}</span>
          </li>
        )}
        <li>
          예측 <a href={race.forecasts[source]?.url ?? src.url} target="_blank" rel="noreferrer">{src.name} 원문</a>
          <span>{src.scaleNote}</span>
        </li>
        {race.chamber === 'house' && (
          <li>
            경계 <a href={data.meta.boundary.url} target="_blank" rel="noreferrer">{data.meta.boundary.version}</a>
          </li>
        )}
      </ul>
    </section>
  );
}

// ── 주 상세 (선거 없는 주, 하원 주별 요약) ─────────────────────

export function StateDetail({
  state, chamber, races, ...c
}: Common & { state: string; chamber: Chamber; races: Race[] }) {
  const name = stateName(state);
  if (chamber !== 'house') {
    return (
      <div className="detail">
        <header className="detail-head">
          <div className="detail-eyebrow">{state} · {CHAMBER_LABEL[chamber]}</div>
          <h2>{name}</h2>
          <div className="badges"><span className="badge-pill">이번 선거 없음</span></div>
        </header>
        <Section title="현재 보유">
          {chamber === 'senate' ? (
            <dl className="kv">
              <dt>상원 2석</dt>
              <dd>
                {c.data.senateSeats[state].map((p, i) => (
                  <span key={i} className="seat-inline"><PartyDot color={partyColor(p)} />{PARTY_SHORT[p]}</span>
                ))}
              </dd>
            </dl>
          ) : (
            <dl className="kv">
              <dt>주지사</dt>
              <dd><PartyDot color={partyColor(c.data.governors[state].party)} />{c.data.governors[state].name} ({PARTY_SHORT[c.data.governors[state].party]})</dd>
            </dl>
          )}
        </Section>
      </div>
    );
  }

  const count = { D: 0, R: 0, I: 0, O: 0, undecided: 0 };
  const before = { D: 0, R: 0, I: 0, O: 0 };
  let flips = 0;
  for (const r of races) {
    if (r.heldBy) before[r.heldBy]++;
    if (isDecided(r)) count[r.result.winner!]++;
    else count.undecided++;
    if (outcome(r) === 'flip') flips++;
  }
  const changed = c.data.redistrictedStates.includes(state);
  return (
    <div className="detail">
      <header className="detail-head">
        <div className="detail-eyebrow">{state} · 하원 {races.length}석</div>
        <h2>{name}</h2>
        {changed && <div className="badges"><span className="badge-pill warn">경계 변경</span></div>}
      </header>
      <Section title="의석">
        <div className="state-seats">
          <div><span>민주</span><b style={{ color: PALETTE.D }}>{count.D}</b><small>{changed ? '새 경계' : `선거 전 ${before.D}`}</small></div>
          <div><span>공화</span><b style={{ color: PALETTE.R }}>{count.R}</b><small>{changed ? '새 경계' : `선거 전 ${before.R}`}</small></div>
          {count.I + before.I > 0 && <div><span>무소속</span><b style={{ color: PALETTE.I }}>{count.I}</b><small>{changed ? '새 경계' : `선거 전 ${before.I}`}</small></div>}
          <div><span>미결정</span><b>{count.undecided}</b><small>{changed ? '교체 판정 보류' : `정당 교체 ${flips}`}</small></div>
        </div>
      </Section>
      <Section title="선거구">
        <ul className="dlist">
          {races.map((r) => {
            const f = currentForecast(r, c.source);
            return (
              <li key={r.id}>
                <button onClick={() => c.onSelect({ type: 'race', id: r.id })}>
                  <span className="dlist-code">{raceCode(r)}</span>
                  <span className="dlist-main">
                    <span className={`dlist-out tone-${isDecided(r) ? r.result.winner : 'pending'}`}>{outcomeText(r)}</span>
                    {f && <small>{RATING_LABEL[f.rating]}</small>}
                  </span>
                  <span className="chev">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

/** 아무것도 고르지 않았을 때: 아직 승자가 안 나온 접전을 바로 고를 수 있게 */
export function EmptyDetail({ hint, picks, onPick }: { hint: string; picks: Race[]; onPick: (id: string) => void }) {
  return (
    <div className="detail detail-empty">
      <div className="empty-head">
        <div className="empty-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill="currentColor" /></svg>
        </div>
        <b>{hint}</b>
      </div>
      {picks.length > 0 && (
        <>
          <h3 className="picks-title">가장 치열한 곳</h3>
          <ul className="picks">
            {picks.map((r) => {
              const [a, b] = voteShares(r);
              return (
                <li key={r.id}>
                  <button onClick={() => onPick(r.id)}>
                    <span className="picks-code">{raceCode(r)}</span>
                    <span className="picks-main">
                      <b>{raceTitle(r)}</b>
                      <small>{isDecided(r) ? outcomeText(r) : `${STATUS_LABEL[r.result.status]} · 개표 ${r.result.expectedPct?.toFixed(0) ?? '–'}%`}</small>
                    </span>
                    <span className="picks-gap">
                      {a && b && <><i style={{ background: partyColor(a.party) }} />{(a.pct - b.pct).toFixed(1)}%p</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
