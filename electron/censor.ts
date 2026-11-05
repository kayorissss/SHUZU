/** Проверка «глушилок»: доступность локальных и глобальных сервисов. */
import type { CensorProbeResult, CensorReport } from '../shared/types';
import { evaluateCensorReport } from '../shared/censor';
import { PROBE_TARGETS } from '../shared/rules';
import { deepProbe } from './net';
import { mapLimit } from '../shared/util';

export async function runCensorCheck(): Promise<CensorReport> {
  const results = await mapLimit(PROBE_TARGETS, 6, async (target): Promise<CensorProbeResult> => {
    const probe = await deepProbe(target.host, target.url, 7000);
    // TCP прошёл, а TLS/HTTP — нет: характерный признак DPI
    const suspicious = probe.tcpOk && !probe.tlsOk;
    return {
      id: target.id,
      label: target.label,
      group: target.group,
      ok: probe.httpOk,
      ms: probe.ms != null ? Math.round(probe.ms) : null,
      via: 'http',
      error: probe.error,
      suspicious,
    };
  });
  return evaluateCensorReport(results);
}
