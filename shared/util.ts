/** Мелкие утилиты, общие для UI и main. */

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number | null | undefined): string {
  const s = formatBytes(bytesPerSec, 1);
  return s === '—' ? s : `${s}/с`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatDate(ts: number | null | undefined, lang: 'ru' | 'en' = 'ru'): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts: number | null | undefined, lang: 'ru' | 'en' = 'ru'): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function daysLeft(ts: number | null | undefined): number | null {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86_400_000);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Плавная кривая для анимаций камеры карты. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ограничитель параллелизма (полезно для пинга 200 серверов). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function randomId(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint8Array(len);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
    return s;
  }
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Дебаунс для поиска/скролла. */
export function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}
