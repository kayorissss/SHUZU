/**
 * Анализ «глушилок» (DPI/блокировок).
 *
 * Логика: если доступны только локальные сервисы (ВК, Госуслуги, Яндекс),
 * а глобальные (Google, Cloudflare, Apple, MIUI) — нет, значит трафик
 * фильтруется по SNI/по IP. Это тот самый случай «ВПН не работает, а Запрет
 * с Варпом — работают».
 */
import type { CensorProbeResult, CensorReport } from './types';

export function evaluateCensorReport(probes: CensorProbeResult[], now = Date.now()): CensorReport {
  const byGroup = (g: string) => probes.filter((p) => p.group === g);
  const okRate = (list: CensorProbeResult[]) => (list.length ? list.filter((p) => p.ok).length / list.length : 1);

  const local = byGroup('local');
  const global = byGroup('global');
  const messenger = byGroup('messenger');
  const cloud = byGroup('cloud');
  const media = byGroup('media');

  const localRate = okRate(local);
  const globalRate = okRate(global);
  const messengerRate = okRate(messenger);
  const cloudRate = okRate(cloud);
  const mediaRate = okRate(media);

  const blockedGroups: string[] = [];
  if (globalRate < 0.6) blockedGroups.push('global');
  if (mediaRate < 0.6) blockedGroups.push('media');
  if (messengerRate < 0.6) blockedGroups.push('messenger');
  if (cloudRate < 0.6) blockedGroups.push('cloud');

  // Признаки активного вмешательства: TLS-обрыв на конкретных SNI,
  // подозрительно быстрый «ok» при недоступном TCP и т.п.
  const suspicious = probes.filter((p) => p.suspicious).length;

  let dpiScore = 0;
  dpiScore += (1 - globalRate) * 55;
  dpiScore += (1 - mediaRate) * 15;
  dpiScore += (1 - messengerRate) * 12;
  dpiScore += (1 - cloudRate) * 8;
  if (suspicious) dpiScore += Math.min(20, suspicious * 6);
  // если даже локальные не работают — это не DPI, а отсутствие интернета
  if (localRate < 0.4 && globalRate < 0.4) dpiScore = Math.min(dpiScore, 25);

  dpiScore = Math.round(Math.max(0, Math.min(100, dpiScore)));

  let verdict: CensorReport['verdict'];
  if (!probes.length) verdict = 'unknown';
  else if (localRate < 0.3 && globalRate < 0.3) verdict = 'unknown';
  else if (dpiScore >= 55) verdict = 'filtered';
  else if (dpiScore >= 22) verdict = 'partial';
  else verdict = 'open';

  const summary = summarize(verdict, { localRate, globalRate, mediaRate, messengerRate, cloudRate, suspicious, blockedGroups });

  return { createdAt: now, probes, dpiScore, verdict, summary, blockedGroups };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function summarize(
  verdict: CensorReport['verdict'],
  s: { localRate: number; globalRate: number; mediaRate: number; messengerRate: number; cloudRate: number; suspicious: number; blockedGroups: string[] },
): string {
  if (verdict === 'unknown') {
    return 'Не удалось сделать вывод: проверки не прошли ни по локальным, ни по глобальным сервисам. Похоже, интернета нет совсем — проверьте подключение к сети или Wi-Fi.';
  }
  if (verdict === 'open') {
    return `Интернет работает без заметной фильтрации: доступны локальные (${pct(s.localRate)}) и глобальные (${pct(s.globalRate)}) сервисы. Глушилки не обнаружены — обычный VPN должен подключаться.`;
  }
  if (verdict === 'partial') {
    return `Частичная фильтрация: локальные сервисы доступны на ${pct(s.localRate)}, глобальные — на ${pct(s.globalRate)}. Часть соединений обрывается на этапе TLS — похоже на DPI, который режет отдельные SNI. Помогает маскировка (Reality/utls) и обфускация.`;
  }
  return `Трафик фильтруется: локальные сервисы доступны на ${pct(s.localRate)}, а глобальные — только на ${pct(s.globalRate)}. Это типичная картина DPI-блокировки по SNI/IP. Обычный WireGuard/OpenVPN будет «подключаться», но не пускать трафик — нужны VLESS+Reality, Hysteria2 или обфускация, а также DNS через туннель.`;
}

/** Что делать — подсказки под отчётом. */
export function censorAdvice(report: CensorReport): string[] {
  const out: string[] = [];
  if (report.verdict === 'filtered') {
    out.push('Используйте сервер с VLESS + Reality (utls chrome) или Hysteria2 — их DPI не распознаёт.');
    out.push('Включите «DNS через туннель», иначе провайдер подменяет ответы и соединение рвётся.');
    out.push('Попробуйте другой порт: 443 работает чаще, чем 8443/2053.');
    out.push('Если не работает ни один клиент, а «Запрет» работает — провайдер режет по IP-адресам VPN-хостингов, нужен сервер с «чистым» IP.');
  } else if (report.verdict === 'partial') {
    out.push('Часть SNI блокируется — включите фрагментацию TLS или Reality.');
    out.push('Проверьте, что DNS идёт через туннель.');
  } else if (report.verdict === 'unknown') {
    out.push('Сначала восстановите доступ в интернет: проверьте Wi-Fi/кабель, DHCP и шлюз.');
  }
  return out;
}
