import { useEffect, type ReactNode } from 'react';

/** 화면 아래에 잠깐 떠올랐다 사라지는 알림 */
export function Toast({ children, tone, onDone, duration = 4500 }: {
  children: ReactNode;
  tone?: 'warn';
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`toast${tone ? ` toast-${tone}` : ''}`} role="status" aria-live="polite">
      <i aria-hidden />
      {children}
    </div>
  );
}

/** 첫 데이터를 받기 전 화면 뼈대 */
export function BootSkeleton() {
  return (
    <div className="app" aria-busy="true" aria-label="선거 데이터를 불러오는 중">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="sk" style={{ width: 200, height: 22 }} />
            <div className="sk" style={{ width: 280, height: 13, marginTop: 8 }} />
          </div>
        </div>
      </header>
      <main className="wrap">
        <section className="card">
          <div className="sk" style={{ width: 180, height: 26 }} />
          <div className="sk-row">
            <div className="sk" style={{ width: 110, height: 48 }} />
            <div className="sk" style={{ width: 110, height: 48 }} />
          </div>
          <div className="sk" style={{ height: 22, borderRadius: 8 }} />
        </section>
        <section className="card">
          <div className="sk" style={{ height: 44, borderRadius: 12 }} />
          <div className="sk sk-map" />
        </section>
      </main>
    </div>
  );
}
