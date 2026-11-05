// 時間顯示規則（ux.md §6.7）：1 小時內相對時間，之後 HH:mm，跨日 M/D HH:mm。

const pad = (n: number) => String(n).padStart(2, '0');

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatHm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatPostTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (sameDay(d, now)) return formatHm(d);
  return `${d.getMonth() + 1}/${d.getDate()} ${formatHm(d)}`;
}

/** 'YYYY-MM-DD' → 本地日期（不受時區影響） */
export function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 11/8 */
export function formatShortDate(ymd: string): string {
  const d = parseDate(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 11 月 8 日 主日（主日以外顯示星期） */
export function formatLongDate(ymd: string): string {
  const d = parseDate(ymd);
  const week = ['主日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${week}`;
}

/** 下一個主日；今天是主日就是今天（AC5.2） */
export function nextSunday(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toYmd(d);
}
