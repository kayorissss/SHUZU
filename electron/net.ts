/** Сетевые операции main-процесса: пинг, подписки, пробы, системный прокси. */
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import type { Server } from '../shared/types';
import { parseSubscription, parseUserInfo, guessSubscriptionName } from '../shared/subscription';
import { jitterOf } from '../shared/quality';

const UA = 'SHUZU/0.1 (+https://github.com/kayorissss/SHUZU)';

/* ------------------------------ ICMP/TCP ------------------------------ */

export function tcpConnect(host: string, port: number, timeout = 3500, localAddress?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const socket = new net.Socket();
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Number(process.hrtime.bigint() - started) / 1e6);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error('таймаут')));
    socket.once('error', (e) => finish(e as Error));
    try {
      socket.connect({ host, port, localAddress });
    } catch (e) {
      finish(e as Error);
    }
  });
}

export function tlsHandshake(host: string, port: number, servername: string, timeout = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    let done = false;
    const socket = tls.connect(
      { host, port, servername, rejectUnauthorized: false, ALPNProtocols: ['h2', 'http/1.1'], timeout },
      () => {
        if (done) return;
        done = true;
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        socket.destroy();
        resolve(ms);
      },
    );
    socket.once('timeout', () => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error('таймаут TLS'));
    });
    socket.once('error', (e) => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(e);
    });
  });
}

/** Измеряет задержку до сервера: TCP-коннект (+TLS, если он есть в конфиге). */
export async function measureServer(server: Server, samples = 3): Promise<Server> {
  const results: number[] = [];
  let failed = 0;
  const useTls = ['tls', 'reality', 'xtls'].includes((server.params.security ?? '').toLowerCase());
  const servername = server.params.sni || server.params.host || server.host;

  for (let i = 0; i < samples; i++) {
    try {
      const tcp = await tcpConnect(server.host, server.port, 3500);
      let value = tcp;
      if (useTls && i === 0) {
        try {
          const handshake = await tlsHandshake(server.host, server.port, servername, 5000);
          value = Math.max(tcp, handshake);
        } catch {
          // TLS может не отвечать на «пустой» хендшейк (Reality) — не считаем это ошибкой
        }
      }
      results.push(Math.round(value));
    } catch {
      failed++;
    }
  }

  if (!results.length) {
    return { ...server, ping: null, jitter: null, loss: 1, dead: true, pingedAt: Date.now() };
  }
  const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
  return {
    ...server,
    ping: avg,
    jitter: jitterOf(results),
    loss: failed / samples,
    dead: false,
    pingedAt: Date.now(),
  };
}

/* ------------------------------ Подписки ------------------------------ */

export interface FetchedSubscription {
  content: string;
  userinfo: { used: number | null; total: number | null; expiresAt: number | null };
  name: string;
}

export async function fetchSubscription(url: string, timeoutMs = 20000): Promise<FetchedSubscription> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      // многие панели отдают разные форматы в зависимости от клиента
      'Accept-Encoding': 'gzip, deflate',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const content = await res.text();
  const userinfo = parseUserInfo(res.headers.get('subscription-userinfo'));
  const headerName = res.headers.get('profile-title') || res.headers.get('profile-web-page-url');
  let name = guessSubscriptionName(url);
  if (headerName) {
    name = headerName.startsWith('base64:') ? Buffer.from(headerName.slice(7), 'base64').toString('utf8') : headerName;
  }
  return { content, userinfo, name };
}

export function parseFetched(content: string, subscriptionId: string) {
  return parseSubscription(content, subscriptionId);
}

/* ------------------------------- Пробы -------------------------------- */

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  ms: number | null;
  error?: string;
  /** TCP прошёл, а TLS — нет: типичный признак DPI. */
  suspicious?: boolean;
}

export async function httpProbe(url: string, timeoutMs = 7000, opts: { method?: 'GET' | 'HEAD'; viaProxy?: string } = {}): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.status > 0 && res.status < 500, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: null, ms: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Комплексная проба: DNS → TCP:443 → TLS → HTTP. Позволяет отличить DPI от «нет интернета». */
export async function deepProbe(host: string, url: string, timeoutMs = 7000): Promise<{
  dnsOk: boolean;
  tcpOk: boolean;
  tlsOk: boolean;
  httpOk: boolean;
  ms: number | null;
  ip: string | null;
  error?: string;
}> {
  let ip: string | null = null;
  let dnsOk = false;
  try {
    const addrs = await dns.resolve4(host);
    ip = addrs[0] ?? null;
    dnsOk = !!ip;
    if (ip && (ip === '0.0.0.0' || ip.startsWith('127.'))) dnsOk = false;
  } catch {
    dnsOk = false;
  }

  let tcpOk = false;
  let tcpMs: number | null = null;
  if (ip) {
    try {
      tcpMs = await tcpConnect(ip, 443, timeoutMs);
      tcpOk = true;
    } catch {
      tcpOk = false;
    }
  }

  let tlsOk = false;
  if (tcpOk) {
    try {
      await tlsHandshake(ip!, 443, host, timeoutMs);
      tlsOk = true;
    } catch {
      tlsOk = false;
    }
  }

  let httpOk = false;
  let httpMs: number | null = null;
  if (tlsOk) {
    const probe = await httpProbe(url, timeoutMs);
    httpOk = probe.ok;
    httpMs = probe.ms;
  }

  return { dnsOk, tcpOk, tlsOk, httpOk, ms: httpMs ?? tcpMs, ip, error: !dnsOk ? 'DNS' : !tcpOk ? 'TCP' : !tlsOk ? 'TLS' : !httpOk ? 'HTTP' : undefined };
}

/** Внешний IP и страна — проверка, что туннель действительно работает. */
export async function exitInfo(): Promise<{ ip: string | null; country: string | null }> {
  try {
    const res = await fetch('https://ipwho.is/?fields=ip,country_code,success', { signal: AbortSignal.timeout(6000) });
    const json = (await res.json()) as { ip?: string; country_code?: string; success?: boolean };
    if (json.success !== false && json.ip) return { ip: json.ip, country: json.country_code ?? null };
  } catch {
    /* пробуем резервный сервис */
  }
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(6000) });
    const json = (await res.json()) as { ip?: string };
    return { ip: json.ip ?? null, country: null };
  } catch {
    return { ip: null, country: null };
  }
}

export async function resolveHost(host: string): Promise<string[]> {
  try {
    return await dns.resolve4(host);
  } catch {
    return [];
  }
}

/* -------------------------- Системный прокси -------------------------- */

const REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

function run(cmd: string, args: string[], timeout = 8000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : 1) : 0, out: stdout ?? '', err: stderr ?? '' });
    });
  });
}

export async function setSystemProxy(enabled: boolean, host = '127.0.0.1', port = 10809): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (enabled) {
    await run('reg', ['add', REG_PATH, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', `${host}:${port}`, '/f']);
    await run('reg', ['add', REG_PATH, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '<local>;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*', '/f']);
    await run('reg', ['add', REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
  } else {
    await run('reg', ['add', REG_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
    await run('reg', ['delete', REG_PATH, '/v', 'ProxyServer', '/f']);
  }
  // сообщаем системе об изменении настроек
  await run('rundll32.exe', ['user32.dll,UpdatePerUserSystemParameters']);
  return true;
}

export async function getSystemProxy(): Promise<{ enabled: boolean; server: string | null }> {
  if (process.platform !== 'win32') return { enabled: false, server: null };
  const res = await run('reg', ['query', REG_PATH, '/v', 'ProxyEnable']);
  const enabled = /0x1\b/.test(res.out);
  const srv = await run('reg', ['query', REG_PATH, '/v', 'ProxyServer']);
  const m = srv.out.match(/ProxyServer\s+REG_SZ\s+(.+)/);
  return { enabled, server: m ? m[1].trim() : null };
}

export { run };
