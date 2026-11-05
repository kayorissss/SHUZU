/**
 * Разбор подписок и ссылок.
 *
 * Поддерживается:
 *  - vless://  vmess://  trojan://  ss://  ssr://  hysteria2:// (hy2://)
 *    tuic://  socks://  http://  wireguard://
 *  - base64-обёртка (стандартная и url-safe, с паддингом и без)
 *  - Clash / Clash.Meta YAML (proxies:)
 *  - sing-box JSON (outbounds:)
 *  - список ссылок простым текстом, с комментариями и пустыми строками
 */
import { parse as parseYaml } from 'yaml';
import { detectLocation, detectCountryByKeywords, flagEmojiToCode, titleCase } from './countries';
import type { Protocol, Server, ServerParams, Transport } from './types';

/** Стабильный короткий id (FNV-1a 32 бит в hex) — чтобы избранное не терялось при обновлении подписки. */
export function stableId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function decodeBase64(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/=]*$/.test(cleaned)) return input;
  const pad = cleaned.length % 4 === 0 ? '' : '='.repeat(4 - (cleaned.length % 4));
  try {
    // В Node и в браузере доступен Buffer/atob — используем универсальный путь.
    if (typeof Buffer !== 'undefined') return Buffer.from(cleaned + pad, 'base64').toString('utf8');
    const bin = atob(cleaned + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return input;
  }
}

/** Похоже ли на base64-подписку (а не на обычный текст ссылок). */
export function looksLikeBase64(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t.replace(/\r?\n/g, ''))) {
    // допускаем переводы строк, но не пробелы внутри строк
    if (/ /.test(t)) return false;
  }
  if (/^(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|tuic|socks|http|wireguard):\/\//im.test(t)) return false;
  if (/proxies\s*:/i.test(t) || /"outbounds"\s*:/i.test(t)) return false;
  return /^[A-Za-z0-9+/=_\-\s]+$/.test(t) && t.replace(/\s/g, '').length > 16;
}

function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q) return out;
  const s = q.startsWith('?') ? q.slice(1) : q;
  for (const part of s.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = decodeURIComponent((i === -1 ? part : part.slice(0, i)).trim());
    const v = i === -1 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, '%20'));
    if (k) out[k.toLowerCase()] = v;
  }
  return out;
}

function splitHostPort(hostport: string): { host: string; port: number } | null {
  let hp = hostport.trim();
  if (hp.startsWith('[')) {
    const end = hp.indexOf(']');
    if (end < 0) return null;
    const host = hp.slice(1, end);
    const rest = hp.slice(end + 1).replace(/^:/, '');
    return { host, port: rest ? Number(rest) : 443 };
  }
  const idx = hp.lastIndexOf(':');
  if (idx === -1) return { host: hp, port: 443 };
  const host = hp.slice(0, idx);
  const port = Number(hp.slice(idx + 1)) || 443;
  return { host, port };
}

function splitHash(uri: string): { base: string; name: string } {
  const i = uri.indexOf('#');
  if (i === -1) return { base: uri, name: '' };
  return { base: uri.slice(0, i), name: decodeURIComponent(uri.slice(i + 1)) };
}

function transportFrom(type: string | undefined): Transport {
  const t = (type ?? 'tcp').toLowerCase();
  if (t === 'ws' || t === 'websocket') return 'ws';
  if (t === 'grpc' || t === 'gun') return 'grpc';
  if (t === 'http' || t === 'h2' || t === 'h2c') return 'http';
  if (t === 'quic') return 'quic';
  if (t === 'httpupgrade') return 'httpupgrade';
  if (t === 'xhttp' || t === 'splithttp') return 'xhttp';
  if (t === 'kcp' || t === 'mkcp') return 'kcp';
  if (t === 'tcp' || t === '' || t === 'none' || t === 'raw') return 'tcp';
  return 'none';
}

function cleanDisplayName(name: string): string {
  const withoutEmoji = name
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // "Германия | Франкфурт", "DE-Frankfurt | x1.5" -> берём самую содержательную часть
  const parts = withoutEmoji
    .split(/[|•]/)
    .map((p) => p.trim())
    .filter((p) => p && !/^[x×]?\d+(\.\d+)?x?$/i.test(p));
  if (!parts.length) return withoutEmoji;
  return parts[0].replace(/\s{2,}/g, ' ').trim();
}

function buildServer(uri: string, protocol: Protocol, name: string, host: string, port: number, params: ServerParams, subscriptionId: string | null): Server {
  const display = name.trim() || `${protocol.toUpperCase()} ${host}`;
  // страну ищем в имени сервера; хост — только как резерв (в нём бывают «tr», «de» и т.п.)
  const loc = detectLocation(display);
  const country = loc.country ?? detectCountryByKeywords(host) ?? flagEmojiToCode(display);
  const cleanName = cleanDisplayName(display) || display;
  return {
    id: stableId(uri),
    name: display,
    cleanName,
    protocol,
    host,
    port,
    country,
    city: loc.city ? titleCase(loc.city) : null,
    favorite: false,
    subscriptionId,
    uri,
    params,
    ping: null,
    tunnelPing: null,
    jitter: null,
    loss: null,
    pingedAt: null,
    dead: false,
  };
}

/** vless://uuid@host:port?encryption=none&security=reality&...#Name */
function parseVless(uri: string, name: string, subscriptionId: string | null): Server | null {
  const { base } = splitHash(uri);
  const body = base.slice('vless://'.length);
  const at = body.lastIndexOf('@');
  if (at < 0) return null;
  const uuid = body.slice(0, at);
  const rest = body.slice(at + 1);
  const qIdx = rest.indexOf('?');
  const hp = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const q = parseQuery(qIdx === -1 ? '' : rest.slice(qIdx));
  const hostPort = splitHostPort(hp);
  if (!hostPort || !uuid) return null;

  const security = (q.security ?? 'none').toLowerCase();
  const params: ServerParams = {
    id: uuid,
    security,
    encryption: q.encryption ?? 'none',
    flow: q.flow || undefined,
    sni: q.sni || q.peer || undefined,
    alpn: q.alpn ? q.alpn.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    fingerprint: q.fp || undefined,
    publicKey: q.pbk || undefined,
    shortId: q.sid || undefined,
    spiderX: q.spx || undefined,
    transport: transportFrom(q.type),
    path: q.path ? decodeURIComponent(q.path) : undefined,
    host: q.host || undefined,
    serviceName: q.servicename || q.serviceName || undefined,
    headerType: q.headertype || undefined,
    extra: { ...q },
  };
  return buildServer(uri, 'vless', name, hostPort.host, hostPort.port, params, subscriptionId);
}

/** vmess://base64(json) */
function parseVmess(uri: string, subscriptionId: string | null): Server | null {
  const body = uri.slice('vmess://'.length);
  const decoded = decodeBase64(body.split('#')[0]);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(decoded);
  } catch {
    return null;
  }
  const str = (k: string): string => (j[k] == null ? '' : String(j[k]));
  const host = str('add');
  const port = Number(str('port')) || 443;
  if (!host) return null;
  const net = str('net');
  const tls = str('tls');
  const params: ServerParams = {
    id: str('id'),
    security: str('scy') || 'auto',
    sni: str('sni') || str('host') || undefined,
    fingerprint: str('fp') || undefined,
    alpn: str('alpn') ? str('alpn').split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    transport: transportFrom(net),
    path: str('path') || undefined,
    host: str('host') || undefined,
    serviceName: str('path') || undefined,
    headerType: str('type') || undefined,
    extra: { alterId: str('aid') || '0', tls: tls || 'none' },
  };
  if (tls && tls !== 'none' && !params.sni) params.sni = str('host') || host;
  const name = str('ps') || str('remarks') || '';
  return buildServer(uri, 'vmess', name, host, port, params, subscriptionId);
}

/** trojan://password@host:port?sni=...&type=ws#Name */
function parseTrojan(uri: string, name: string, subscriptionId: string | null): Server | null {
  const { base } = splitHash(uri);
  const body = base.slice('trojan://'.length);
  const at = body.lastIndexOf('@');
  if (at < 0) return null;
  const password = decodeURIComponent(body.slice(0, at));
  const rest = body.slice(at + 1);
  const qIdx = rest.indexOf('?');
  const hp = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const q = parseQuery(qIdx === -1 ? '' : rest.slice(qIdx));
  const hostPort = splitHostPort(hp);
  if (!hostPort) return null;
  const params: ServerParams = {
    password,
    sni: q.sni || q.peer || undefined,
    alpn: q.alpn ? q.alpn.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    fingerprint: q.fp || undefined,
    transport: transportFrom(q.type),
    path: q.path ? decodeURIComponent(q.path) : undefined,
    host: q.host || undefined,
    serviceName: q.servicename || undefined,
    security: q.security || 'tls',
    extra: { ...q },
  };
  return buildServer(uri, 'trojan', name, hostPort.host, hostPort.port, params, subscriptionId);
}

/** ss://base64(method:password)@host:port?plugin=...#Name  |  ss://base64(method:password@host:port)#Name */
function parseShadowsocks(uri: string, name: string, subscriptionId: string | null): Server | null {
  const { base } = splitHash(uri);
  let body = base.slice('ss://'.length);
  let q: Record<string, string> = {};
  const qIdx = body.indexOf('?');
  if (qIdx !== -1) {
    q = parseQuery(body.slice(qIdx));
    body = body.slice(0, qIdx);
  }
  let method = '';
  let password = '';
  let hostPortStr = '';

  if (body.includes('@')) {
    const at = body.lastIndexOf('@');
    const credPart = body.slice(0, at);
    hostPortStr = body.slice(at + 1);
    const cred = credPart.includes(':') && !credPart.includes('%3A') && !/^[A-Za-z0-9+/=_-]+$/.test(credPart) ? credPart : decodeBase64(credPart);
    const ci = cred.indexOf(':');
    method = cred.slice(0, ci);
    password = ci === -1 ? '' : cred.slice(ci + 1);
  } else {
    const decoded = decodeBase64(body);
    const at = decoded.lastIndexOf('@');
    if (at < 0) return null;
    const cred = decoded.slice(0, at);
    hostPortStr = decoded.slice(at + 1);
    const ci = cred.indexOf(':');
    method = cred.slice(0, ci);
    password = cred.slice(ci + 1);
  }
  const hp2 = splitHostPort(hostPortStr.replace(/\/$/, ''));
  if (!hp2 || !method) return null;
  const params: ServerParams = {
    method: method.toLowerCase(),
    password,
    transport: 'tcp',
    plugin: q.plugin ? q.plugin.split(';')[0] : undefined,
    pluginOpts: q.plugin && q.plugin.includes(';') ? q.plugin.split(';').slice(1).join(';') : undefined,
    extra: { ...q },
  };
  return buildServer(uri, 'shadowsocks', name, hp2.host, hp2.port, params, subscriptionId);
}

/** ssr://base64(host:port:protocol:method:obfs:base64pass/?params) */
function parseShadowsocksR(uri: string, subscriptionId: string | null): Server | null {
  const body = uri.slice('ssr://'.length).split('#')[0];
  const decoded = decodeBase64(body);
  const main = decoded.split('/?')[0];
  const parts = main.split(':');
  if (parts.length < 6) return null;
  const host = parts[0];
  const port = Number(parts[1]) || 443;
  const q = parseQuery(decoded.includes('/?') ? decoded.split('/?')[1] : '');
  const params: ServerParams = {
    method: parts[3],
    password: decodeBase64(parts[5]),
    obfs: parts[4],
    transport: 'tcp',
    extra: { protocol: parts[2], ...q },
  };
  const name = q.remarks ? decodeBase64(q.remarks) : `${host}:${port}`;
  return buildServer(uri, 'shadowsocksr', name, host, port, params, subscriptionId);
}

/** hysteria2://password@host:port?sni=...&obfs=salamander&obfs-password=...#Name */
function parseHysteria2(uri: string, name: string, subscriptionId: string | null): Server | null {
  const { base } = splitHash(uri);
  const body = base.replace(/^(hysteria2|hy2):\/\//, '');
  const at = body.lastIndexOf('@');
  if (at < 0) return null;
  const password = decodeURIComponent(body.slice(0, at));
  const rest = body.slice(at + 1);
  const qIdx = rest.indexOf('?');
  const hp = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const q = parseQuery(qIdx === -1 ? '' : rest.slice(qIdx));
  const hostPort = splitHostPort(hp.replace(/\/$/, ''));
  if (!hostPort) return null;
  const params: ServerParams = {
    password,
    sni: q.sni || q.peer || undefined,
    obfs: q.obfs || undefined,
    obfsPassword: q['obfs-password'] || q.obfs_password || undefined,
    alpn: q.alpn ? q.alpn.split(',').map((s) => s.trim()) : undefined,
    transport: 'quic',
    extra: { ...q, insecure: q.insecure ?? '1' },
  };
  return buildServer(uri, 'hysteria2', name, hostPort.host, hostPort.port, params, subscriptionId);
}

/** tuic://uuid:password@host:port?congestion_control=bbr&alpn=h3&sni=...#Name */
function parseTuic(uri: string, name: string, subscriptionId: string | null): Server | null {
  const { base } = splitHash(uri);
  const body = base.slice('tuic://'.length);
  const at = body.lastIndexOf('@');
  if (at < 0) return null;
  const cred = body.slice(0, at);
  const ci = cred.indexOf(':');
  const uuid = decodeURIComponent(ci === -1 ? cred : cred.slice(0, ci));
  const password = ci === -1 ? '' : decodeURIComponent(cred.slice(ci + 1));
  const rest = body.slice(at + 1);
  const qIdx = rest.indexOf('?');
  const hp = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const q = parseQuery(qIdx === -1 ? '' : rest.slice(qIdx));
  const hostPort = splitHostPort(hp.replace(/\/$/, ''));
  if (!hostPort) return null;
  const params: ServerParams = {
    id: uuid,
    password,
    sni: q.sni || undefined,
    alpn: q.alpn ? q.alpn.split(',') : ['h3'],
    transport: 'quic',
    extra: { ...q, congestion_control: q.congestion_control || 'bbr' },
  };
  return buildServer(uri, 'tuic', name, hostPort.host, hostPort.port, params, subscriptionId);
}

function parseSocksHttp(uri: string, name: string, subscriptionId: string | null, proto: 'socks' | 'http'): Server | null {
  const { base } = splitHash(uri);
  const body = base.replace(/^(socks|socks5|http|https):\/\//, '');
  const at = body.lastIndexOf('@');
  if (proto === 'http') {
    // Обычную ссылку на сайт (подписку) нельзя путать с HTTP-прокси:
    // прокси-ссылка содержит логин/пароль либо нестандартный порт.
    const hostOnly = (at >= 0 ? body.slice(at + 1) : body).split('?')[0].replace(/\/$/, '');
    const portPart = hostOnly.includes(':') ? Number(hostOnly.slice(hostOnly.lastIndexOf(':') + 1)) : NaN;
    const hasCreds = at >= 0 && body.slice(0, at).includes(':');
    const nonStandardPort = Number.isFinite(portPart) && portPart !== 80 && portPart !== 443;
    if (!hasCreds && !nonStandardPort) return null;
  }
  const cred = at >= 0 ? body.slice(0, at) : '';
  const rest = at >= 0 ? body.slice(at + 1) : body;
  const qIdx = rest.indexOf('?');
  const hp = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const q = parseQuery(qIdx === -1 ? '' : rest.slice(qIdx));
  const hostPort = splitHostPort(hp.replace(/\/$/, ''));
  if (!hostPort) return null;
  const [username, password] = cred.split(':');
  const params: ServerParams = {
    id: username ? decodeURIComponent(username) : undefined,
    password: password ? decodeURIComponent(password) : undefined,
    transport: 'tcp',
    extra: { ...q },
  };
  return buildServer(uri, proto, name, hostPort.host, hostPort.port, params, subscriptionId);
}

/** Разбирает одну ссылку. Возвращает null, если формат неизвестен. */
export function parseLink(raw: string, subscriptionId: string | null = null): Server | null {
  const uri = raw.trim();
  if (!uri || uri.startsWith('//') || uri.startsWith('#')) return null;
  const { name } = splitHash(uri);
  const lower = uri.toLowerCase();
  try {
    if (lower.startsWith('vless://')) return parseVless(uri, name, subscriptionId);
    if (lower.startsWith('vmess://')) return parseVmess(uri, subscriptionId);
    if (lower.startsWith('trojan://')) return parseTrojan(uri, name, subscriptionId);
    if (lower.startsWith('ss://')) return parseShadowsocks(uri, name, subscriptionId);
    if (lower.startsWith('ssr://')) return parseShadowsocksR(uri, subscriptionId);
    if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) return parseHysteria2(uri, name, subscriptionId);
    if (lower.startsWith('tuic://')) return parseTuic(uri, name, subscriptionId);
    if (lower.startsWith('socks://') || lower.startsWith('socks5://')) return parseSocksHttp(uri, name, subscriptionId, 'socks');
    if (lower.startsWith('http://') || lower.startsWith('https://')) return parseSocksHttp(uri, name, subscriptionId, 'http');
  } catch {
    return null;
  }
  return null;
}

interface ClashProxy {
  name?: string;
  type?: string;
  server?: string;
  port?: number | string;
  uuid?: string;
  password?: string | number;
  cipher?: string;
  alterId?: number;
  udp?: boolean;
  tls?: boolean;
  sni?: string;
  servername?: string;
  network?: string;
  'ws-opts'?: { path?: string; headers?: Record<string, string> };
  'grpc-opts'?: { 'grpc-service-name'?: string };
  'reality-opts'?: { 'public-key'?: string; 'short-id'?: string };
  'client-fingerprint'?: string;
  skipCertVerify?: boolean;
  alpn?: string[];
  flow?: string;
  obfs?: string;
  'obfs-param'?: string;
}

function clashToServer(p: ClashProxy, subscriptionId: string | null): Server | null {
  if (!p.server || !p.port) return null;
  const type = (p.type ?? '').toLowerCase();
  const port = Number(p.port);
  const tls = p.tls === true;
  const transport = transportFrom(p.network);
  const sni = p.sni || p.servername || undefined;
  const fp = p['client-fingerprint'] || undefined;
  const common: ServerParams = {
    sni,
    fingerprint: fp,
    alpn: p.alpn,
    transport,
    path: p['ws-opts']?.path,
    host: p['ws-opts']?.headers?.Host || p['ws-opts']?.headers?.host,
    serviceName: p['grpc-opts']?.['grpc-service-name'],
    publicKey: p['reality-opts']?.['public-key'],
    shortId: p['reality-opts']?.['short-id'],
    flow: p.flow,
    security: tls ? 'tls' : 'none',
    extra: { insecure: p.skipCertVerify ? '1' : '0' },
  };
  const name = p.name ?? `${type} ${p.server}`;
  const fake = `clash://${type}/${p.server}:${port}/${encodeURIComponent(name)}`;
  const loc = detectLocation(name + ' ' + p.server);
  const mk = (protocol: Protocol, params: ServerParams): Server => ({
    ...buildServer(fake, protocol, name, p.server!, port, params, subscriptionId),
    country: loc.country,
    city: loc.city,
  });

  switch (type) {
    case 'vless':
      return mk('vless', { ...common, id: p.uuid, flow: p.flow });
    case 'vmess':
      return mk('vmess', { ...common, id: p.uuid, security: p.cipher ?? 'auto', extra: { ...common.extra, alterId: String(p.alterId ?? 0) } });
    case 'trojan':
      return mk('trojan', { ...common, security: 'tls', password: String(p.password ?? '') });
    case 'ss':
    case 'shadowsocks':
      return mk('shadowsocks', { ...common, transport: 'tcp', method: (p.cipher ?? 'aes-128-gcm').toLowerCase(), password: String(p.password ?? '') });
    case 'hysteria2':
    case 'hy2':
      return mk('hysteria2', { ...common, transport: 'quic', password: String(p.password ?? ''), obfs: p.obfs, obfsPassword: p['obfs-param'] });
    case 'tuic':
      return mk('tuic', { ...common, transport: 'quic', id: p.uuid, password: String(p.password ?? '') });
    case 'socks5':
    case 'socks':
      return mk('socks', { ...common, transport: 'tcp', id: p.uuid || undefined, password: p.password ? String(p.password) : undefined });
    case 'http':
      return mk('http', { ...common, transport: 'tcp', id: p.uuid || undefined, password: p.password ? String(p.password) : undefined });
    default:
      return null;
  }
}

/** Достаёт серверы из Clash YAML. */
function parseClashYaml(text: string, subscriptionId: string | null): Server[] {
  try {
    const doc = parseYaml(text) as { proxies?: ClashProxy[] } | null;
    if (!doc || !Array.isArray(doc.proxies)) return [];
    return doc.proxies.map((p) => clashToServer(p, subscriptionId)).filter((s): s is Server => !!s);
  } catch {
    return [];
  }
}

/** Достаёт серверы из sing-box JSON (outbounds:). */
function parseSingboxJson(text: string, subscriptionId: string | null): Server[] {
  try {
    const doc = JSON.parse(text) as { outbounds?: Array<Record<string, unknown>> };
    if (!doc || !Array.isArray(doc.outbounds)) return [];
    const out: Server[] = [];
    for (const o of doc.outbounds) {
      const type = String(o.type ?? '');
      const server = String(o.server ?? '');
      const port = Number(o.server_port ?? 0);
      if (!server || !port) continue;
      const tls = (o.tls ?? {}) as Record<string, unknown>;
      const reality = (tls.reality ?? {}) as Record<string, unknown>;
      const utls = (tls.utls ?? {}) as Record<string, unknown>;
      const tr = (o.transport ?? {}) as Record<string, unknown>;
      const headers = (tr.headers ?? {}) as Record<string, string>;
      const params: ServerParams = {
        id: (o.uuid as string) ?? undefined,
        password: (o.password as string) ?? undefined,
        method: (o.method as string) ?? undefined,
        sni: (tls.server_name as string) ?? undefined,
        fingerprint: (utls.fingerprint as string) ?? undefined,
        publicKey: (reality.public_key as string) ?? undefined,
        shortId: (reality.short_id as string) ?? undefined,
        alpn: (tls.alpn as string[]) ?? undefined,
        transport: transportFrom(tr.type as string),
        path: (tr.path as string) ?? undefined,
        host: headers.Host ?? headers.host,
        serviceName: (tr.service_name as string) ?? undefined,
        security: tls.enabled ? 'tls' : 'none',
        flow: (o.flow as string) ?? undefined,
        extra: { insecure: tls.insecure ? '1' : '0' },
      };
      const protoMap: Record<string, Protocol> = {
        vless: 'vless',
        vmess: 'vmess',
        trojan: 'trojan',
        shadowsocks: 'shadowsocks',
        hysteria2: 'hysteria2',
        tuic: 'tuic',
        socks: 'socks',
        http: 'http',
      };
      const proto = protoMap[type];
      if (!proto) continue;
      out.push(buildServer(JSON.stringify(o), proto, String(o.tag ?? server), server, port, params, subscriptionId));
    }
    return out;
  } catch {
    return [];
  }
}

export interface ParsedSubscription {
  servers: Server[];
  /** Что именно нашли: ссылки / clash / sing-box / base64. */
  format: 'links' | 'base64' | 'clash' | 'singbox' | 'empty';
  skipped: number;
}

/**
 * Разбирает тело подписки (то, что вернул сервер или пользователь вставил вручную).
 * Устойчиво к base64, YAML, JSON и простым спискам ссылок.
 */
export function parseSubscription(raw: string, subscriptionId: string | null = null): ParsedSubscription {
  const text = (raw ?? '').replace(/^\uFEFF/, '').trim();
  if (!text) return { servers: [], format: 'empty', skipped: 0 };

  if (/"outbounds"\s*:/.test(text) && text.trimStart().startsWith('{')) {
    const servers = parseSingboxJson(text, subscriptionId);
    if (servers.length) return { servers, format: 'singbox', skipped: 0 };
  }
  if (/^\s*proxies\s*:/m.test(text)) {
    const servers = parseClashYaml(text, subscriptionId);
    if (servers.length) return { servers, format: 'clash', skipped: 0 };
  }

  let body = text;
  let format: ParsedSubscription['format'] = 'links';
  if (looksLikeBase64(text)) {
    const decoded = decodeBase64(text);
    if (/(vless|vmess|trojan|ss|hysteria2|tuic|hy2):\/\//i.test(decoded)) {
      body = decoded;
      format = 'base64';
    }
  }

  // YAML/JSON уже могли прийти в base64
  if (/^\s*proxies\s*:/m.test(body)) {
    const servers = parseClashYaml(body, subscriptionId);
    if (servers.length) return { servers, format: 'clash', skipped: 0 };
  }

  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

  const servers: Server[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    // в строке может быть несколько ссылок через пробел
    const candidates = /:\/\//.test(line) ? line.split(/\s+/) : [line];
    for (const cand of candidates) {
      const s = parseLink(cand, subscriptionId);
      if (s) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        servers.push(s);
      } else if (cand.includes('://')) {
        skipped++;
      }
    }
  }
  return { servers, format: servers.length ? format : 'empty', skipped };
}

/** Разбирает заголовок subscription-userinfo: upload=1; download=2; total=3; expire=4 */
export function parseUserInfo(header: string | null | undefined): { used: number | null; total: number | null; expiresAt: number | null } {
  if (!header) return { used: null, total: null, expiresAt: null };
  const get = (k: string): number | null => {
    const m = header.match(new RegExp(`${k}=([0-9]+)`, 'i'));
    return m ? Number(m[1]) : null;
  };
  const up = get('upload');
  const down = get('download');
  const total = get('total');
  const expire = get('expire');
  return {
    used: up != null || down != null ? (up ?? 0) + (down ?? 0) : null,
    total: total && total > 0 ? total : null,
    expiresAt: expire && expire > 0 ? expire * 1000 : null,
  };
}

/** Угадывает имя подписки по URL (для списка подписок). */
export function guessSubscriptionName(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return host;
  } catch {
    return 'Subscription';
  }
}

/** Ссылка-подписка или просто набор ссылок? */
export function isSubscriptionUrl(input: string): boolean {
  const t = input.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  if (/(vless|vmess|trojan|ss|hysteria2|tuic|hy2):\/\//i.test(t)) return false;
  return !/\s/.test(t);
}
