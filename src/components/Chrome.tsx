import { useEffect, useState } from 'react';
import type { ElectionData } from '../lib/types';
import { fmtKst } from '../lib/format';

/** 데이터 수집이 이 시간 넘게 멈추면 경고 */
const STALE_MS = 15 * 60_000;

/** 개표 상태 배지. 수집이 오래 멈췄으면 경고로 바뀐다 */
export function StatusBadge({ meta }: { meta: ElectionData['meta'] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (meta.isSample) return <span className="status-badge sample">샘플 데이터</span>;
  const age = now - Date.parse(meta.fetchedAt);
  if (age > STALE_MS) {
    const min = Math.floor(age / 60_000);
    const text = min >= 120 ? `${Math.floor(min / 60)}시간` : `${min}분`;
    return (
      <span className="status-badge stale" title={`마지막 수집 ${fmtKst(meta.fetchedAt)} · npm run fetch:data -- --every 5 로 계속 받을 수 있어요`}>
        <i aria-hidden />{text}째 갱신 없음
      </span>
    );
  }
  return <span className="status-badge live" title="공식 인증 전 개표 결과"><i aria-hidden />개표 중</span>;
}

type Theme = 'light' | 'dark';
const KEY = 'midelec-theme';

function readTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** 시스템 설정을 따르다가, 누르면 밝게/어둡게를 고정한다 */
export function ThemeToggle() {
  const system = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [theme, setTheme] = useState<Theme>(() => readTheme() ?? system());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101013' : '#f2f4f6');
  }, [theme]);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(KEY, next); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  };
  return (
    <button className="icon-btn theme-btn" onClick={toggle} aria-label={theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'} title={theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <circle cx="10" cy="10" r="4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

/** 지금 보는 화면(주소 해시에 담긴 선거 종류·모드·선택)을 공유. 휴대폰은 공유 창, 그 밖에는 링크 복사 */
export function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 공유 창을 닫았거나 클립보드 권한이 없으면 조용히 넘어간다 */
    }
  };
  return (
    <button className={`icon-btn share-btn${copied ? ' done' : ''}`} onClick={share} aria-label={copied ? '링크를 복사했어요' : '지금 화면 링크 복사'} title="지금 화면 링크 복사">
      {copied ? (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )}
      <span className="share-tip" aria-hidden>{copied ? '복사됨' : ''}</span>
    </button>
  );
}
