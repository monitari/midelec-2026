const kst = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const et = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'America/New_York', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const day = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });

export const fmtKst = (iso: string) => kst.format(new Date(iso));
export const fmtEt = (iso: string) => et.format(new Date(iso));
export const fmtDay = (iso: string) => day.format(new Date(iso));
export const fmtTime = (iso: string) => time.format(new Date(iso));
export const fmtNum = (n: number) => n.toLocaleString('ko-KR');
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;
