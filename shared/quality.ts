/** Оценка качества серверов: выбор "самого лучшего" для авто-режима. */
import type { Server } from './types';

export interface ServerQuality {
  /** 0..100, больше — лучше. */
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

/**
 * Взвешенная оценка: задержка важнее джиттера, потери и «мёртвость» штрафуются.
 * Учитывается только свежий замер (старше 15 минут — считаем устаревшим).
 */
export function qualityOf(s: Server, now = Date.now()): ServerQuality {
  if (s.dead) return { score: 0, grade: 'poor' };
  const ping = s.tunnelPing ?? s.ping;
  const fresh = s.pingedAt != null && now - s.pingedAt < 15 * 60_000;
  if (ping == null || !fresh) return { score: 0, grade: 'unknown' };

  // 20 мс -> ~100, 300 мс -> ~25
  const pingScore = Math.max(0, Math.min(100, 120 - (ping - 20) * 0.32));
  const jitterPenalty = Math.min(20, (s.jitter ?? 0) * 0.35);
  const lossPenalty = (s.loss ?? 0) * 90;
  const score = Math.max(0, Math.min(100, pingScore - jitterPenalty - lossPenalty));

  const grade: ServerQuality['grade'] =
    score >= 82 ? 'excellent' : score >= 62 ? 'good' : score >= 38 ? 'fair' : 'poor';
  return { score: Math.round(score), grade };
}

/** Лучший сервер: сначала по качеству, при равенстве — по пингу. */
export function pickBest(servers: Server[], now = Date.now()): Server | null {
  const alive = servers.filter((s) => !s.dead && (s.ping != null || s.tunnelPing != null));
  if (!alive.length) return null;
  let best = alive[0];
  let bestScore = qualityOf(best, now).score;
  for (const s of alive.slice(1)) {
    const q = qualityOf(s, now).score;
    if (q > bestScore || (q === bestScore && (s.ping ?? 1e9) < (best.ping ?? 1e9))) {
      best = s;
      bestScore = q;
    }
  }
  return best;
}

/** Статистика по пингам — для заголовка списка серверов. */
export function pingSummary(servers: Server[]): { best: number | null; avg: number | null; alive: number; total: number } {
  const pings = servers.map((s) => s.tunnelPing ?? s.ping).filter((p): p is number => p != null);
  if (!pings.length) return { best: null, avg: null, alive: 0, total: servers.length };
  const sum = pings.reduce((a, b) => a + b, 0);
  return {
    best: Math.min(...pings),
    avg: Math.round(sum / pings.length),
    alive: pings.length,
    total: servers.length,
  };
}

/** Джиттер по серии замеров (стандартное отклонение). */
export function jitterOf(samples: number[]): number {
  if (samples.length < 2) return 0;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length;
  return Math.round(Math.sqrt(variance));
}

/** Цветовая категория пинга (используется в UI). */
export function pingTone(ping: number | null): 'great' | 'ok' | 'meh' | 'bad' | 'none' {
  if (ping == null) return 'none';
  if (ping < 60) return 'great';
  if (ping < 130) return 'ok';
  if (ping < 250) return 'meh';
  return 'bad';
}
