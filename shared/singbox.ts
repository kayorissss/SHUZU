/**
 * Генерация конфигурации sing-box (ядро внутри SHUZU).
 *
 * Одна и та же логика маршрутизации используется и на ПК (TUN + системный прокси),
 * и на Android (локальный SOCKS, который забирает hev-socks5-tunnel из VpnService).
 *
 * В конфиг всегда добавляются:
 *  - urltest "auto"      — автоматический выбор лучшего сервера по задержке
 *  - selector "proxy"    — переключение сервера на лету через Clash API (без реконнекта)
 *  - Clash API           — статистика трафика, замер задержки каждого сервера,
 *                          переключение и проверка здоровья туннеля
 */
import type { Server, ServerParams, Settings } from './types';
import { RU_DIRECT_DOMAINS } from './rules';

export const AUTO_TAG = 'auto';
export const SELECT_TAG = 'proxy';
export const DIRECT_TAG = 'direct';
export const BLOCK_TAG = 'block';

export interface BuildOptions {
  servers: Server[];
  /** null = автоматический выбор (urltest). */
  selectedServerId: string | null;
  mode: 'tun' | 'proxy';
  android: boolean;
  socksPort: number;
  httpPort: number;
  clashApiPort: number;
  clashSecret: string;
  dns: Settings['dns'];
  customDns: string;
  bypassLocal: boolean;
  blockAds: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Путь к файлу кеша (не обязателен). */
  cachePath?: string;
  /** Теги серверов, которые ядро не поддерживает (SSR, xhttp и т.п.). */
  unsupported?: string[];
}

export interface BuiltConfig {
  config: Record<string, unknown>;
  /** id серверов, которые ядро не умеет (нужно показать в UI). */
  unsupportedIds: string[];
  tagsByServerId: Record<string, string>;
  selectorTag: string;
}

/* ------------------------------------------------------------------ */
/*  Outbound-часть                                                     */
/* ------------------------------------------------------------------ */

function tlsBlock(p: ServerParams, host: string, force = false): Record<string, unknown> | undefined {
  const security = (p.security ?? (force ? 'tls' : 'none')).toLowerCase();
  const isTls = force || security === 'tls' || security === 'reality' || security === 'xtls';
  if (!isTls) return undefined;

  const tls: Record<string, unknown> = { enabled: true, server_name: p.sni || host };
  if (p.alpn && p.alpn.length) tls.alpn = p.alpn;
  if (p.extra?.insecure === '1' || p.extra?.allowInsecure === '1') tls.insecure = true;

  const fp = p.fingerprint || (security === 'reality' ? 'chrome' : undefined);
  if (fp) {
    tls.utls = { enabled: true, fingerprint: normalizeFp(fp) };
  }
  if (security === 'reality') {
    tls.reality = {
      enabled: true,
      public_key: p.publicKey ?? '',
      short_id: p.shortId ?? '',
    };
  }
  return tls;
}

const FINGERPRINTS = new Set(['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'random', 'randomized']);

function normalizeFp(fp: string): string {
  const f = fp.trim().toLowerCase();
  if (FINGERPRINTS.has(f)) return f;
  if (f === 'chrome_120' || f === 'chrome120') return 'chrome';
  return 'chrome';
}

function transportBlock(p: ServerParams): Record<string, unknown> | undefined {
  switch (p.transport) {
    case 'ws': {
      // Ранние данные включаем только если сервер их объявил (?ed=2048),
      // иначе часть панелей рвёт соединение.
      const ed = p.extra?.ed ? Number(p.extra.ed) || 2048 : undefined;
      const host = p.host || p.sni || '';
      return stripUndefined({
        type: 'ws',
        path: p.path || '/',
        headers: host ? { Host: host } : undefined,
        max_early_data: ed,
        early_data_header_name: ed ? 'Sec-WebSocket-Protocol' : undefined,
      });
    }
    case 'grpc':
      return { type: 'grpc', service_name: p.serviceName || p.path || '' };
    case 'http':
      return { type: 'http', host: p.host ? [p.host] : undefined, path: p.path || '/' };
    case 'httpupgrade':
      return { type: 'httpupgrade', host: p.host || p.sni || '', path: p.path || '/' };
    case 'quic':
      return { type: 'quic' };
    default:
      return undefined;
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/** Преобразует сервер в outbound sing-box. null — протокол не поддерживается. */
export function serverToOutbound(s: Server): Record<string, unknown> | null {
  const p = s.params;
  const base = { server: s.host, server_port: s.port };

  switch (s.protocol) {
    case 'vless': {
      if (p.transport === 'xhttp' || p.transport === 'kcp' || p.transport === 'none') return null;
      const tls = tlsBlock(p, s.host);
      return stripUndefined({
        type: 'vless',
        tag: '',
        ...base,
        uuid: p.id,
        flow: p.flow,
        packet_encoding: 'xudp',
        tls,
        transport: transportBlock(p),
        multiplex: undefined,
      });
    }
    case 'vmess': {
      if (p.transport === 'xhttp' || p.transport === 'kcp') return null;
      return stripUndefined({
        type: 'vmess',
        ...base,
        uuid: p.id,
        security: p.security && p.security !== 'none' ? p.security : 'auto',
        alter_id: Number(p.extra?.alterId ?? 0) || 0,
        tls: tlsBlock(p, s.host),
        transport: transportBlock(p),
      });
    }
    case 'trojan': {
      if (p.transport === 'xhttp' || p.transport === 'kcp') return null;
      return stripUndefined({
        type: 'trojan',
        ...base,
        password: p.password,
        tls: tlsBlock(p, s.host, true),
        transport: transportBlock(p),
      });
    }
    case 'shadowsocks': {
      return stripUndefined({
        type: 'shadowsocks',
        ...base,
        method: p.method || 'aes-128-gcm',
        password: p.password,
        plugin: p.plugin === 'obfs-local' || p.plugin === 'simple-obfs' ? 'obfs-local' : p.plugin,
        plugin_opts: p.pluginOpts,
      });
    }
    case 'hysteria2': {
      return stripUndefined({
        type: 'hysteria2',
        ...base,
        password: p.password,
        obfs: p.obfs
          ? { type: p.obfs === 'salamander' ? 'salamander' : p.obfs, password: p.obfsPassword }
          : undefined,
        tls: { enabled: true, server_name: p.sni || s.host, alpn: p.alpn?.length ? p.alpn : ['h3'], insecure: p.extra?.insecure === '1' },
      });
    }
    case 'tuic': {
      return stripUndefined({
        type: 'tuic',
        ...base,
        uuid: p.id,
        password: p.password,
        congestion_control: p.extra?.congestion_control || 'bbr',
        udp_relay_mode: p.extra?.udp_relay_mode || 'native',
        tls: {
          enabled: true,
          server_name: p.sni || s.host,
          alpn: p.alpn?.length ? p.alpn : ['h3'],
          insecure: p.extra?.insecure === '1',
        },
      });
    }
    case 'socks': {
      return stripUndefined({
        type: 'socks',
        ...base,
        version: '5',
        username: p.id,
        password: p.password,
      });
    }
    case 'http': {
      return stripUndefined({
        type: 'http',
        ...base,
        username: p.id,
        password: p.password,
        tls: tlsBlock(p, s.host),
      });
    }
    default:
      // shadowsocksr, wireguard, unknown — ядро не умеет в этом режиме
      return null;
  }
}

export function outboundTag(serverId: string): string {
  return `srv-${serverId}`;
}

/* ------------------------------------------------------------------ */
/*  DNS                                                                */
/* ------------------------------------------------------------------ */

function dnsServers(opts: BuildOptions): { servers: unknown[]; final: string } {
  const proxy = { tag: 'dns-proxy', type: 'https', server: '1.1.1.1', detour: SELECT_TAG, domain_resolver: undefined };
  if (opts.dns === 'system') {
    return { servers: [], final: '' };
  }
  if (opts.dns === 'custom') {
    const host = (opts.customDns || '1.1.1.1').trim();
    const isIp = /^[0-9.]+$/.test(host) || host.includes(':');
    return {
      servers: [
        isIp
          ? { tag: 'dns-proxy', type: 'udp', server: host, detour: SELECT_TAG }
          : { tag: 'dns-proxy', type: 'https', server: host, detour: SELECT_TAG },
      ],
      final: 'dns-proxy',
    };
  }
  const servers: unknown[] = [proxy];
  if (opts.bypassLocal) {
    servers.push({ tag: 'dns-local', type: 'udp', server: '77.88.8.8', detour: DIRECT_TAG });
  }
  return { servers, final: 'dns-proxy' };
}

/* ------------------------------------------------------------------ */
/*  Полный конфиг                                                      */
/* ------------------------------------------------------------------ */

export function buildSingboxConfig(opts: BuildOptions): BuiltConfig {
  const tagsByServerId: Record<string, string> = {};
  const outbounds: Record<string, unknown>[] = [];
  const unsupportedIds: string[] = [];
  const proxyTags: string[] = [];

  for (const s of opts.servers) {
    const o = serverToOutbound(s);
    const tag = outboundTag(s.id);
    if (!o) {
      unsupportedIds.push(s.id);
      continue;
    }
    tagsByServerId[s.id] = tag;
    o.tag = tag;
    outbounds.push(o);
    proxyTags.push(tag);
  }

  const hasProxy = proxyTags.length > 0;

  // urltest — автоматический выбор лучшего сервера
  if (hasProxy) {
    outbounds.push({
      type: 'urltest',
      tag: AUTO_TAG,
      outbounds: [...proxyTags],
      url: 'https://www.gstatic.com/generate_204',
      interval: '2m',
      tolerance: 40,
      idle_timeout: '30m',
    });
  }

  // selector — ручное переключение без перезапуска ядра
  const selectorDefault =
    opts.selectedServerId && tagsByServerId[opts.selectedServerId]
      ? tagsByServerId[opts.selectedServerId]
      : AUTO_TAG;
  outbounds.push({
    type: 'selector',
    tag: SELECT_TAG,
    outbounds: hasProxy ? [AUTO_TAG, ...proxyTags] : [DIRECT_TAG],
    default: hasProxy ? selectorDefault : DIRECT_TAG,
    interrupt_exist_connections: false,
  });

  outbounds.push({ type: 'direct', tag: DIRECT_TAG });
  outbounds.push({ type: 'block', tag: BLOCK_TAG });

  /* ---------- входящие соединения ---------- */
  const inbounds: Record<string, unknown>[] = [];
  if (opts.android) {
    // Android: hev-socks5-tunnel забирает пакеты из VpnService и отдаёт их сюда
    inbounds.push({
      type: 'socks',
      tag: 'socks-in',
      listen: '127.0.0.1',
      listen_port: opts.socksPort,
      udp: true,
    });
  } else if (opts.mode === 'tun') {
    inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
      mtu: 9000,
      auto_route: true,
      strict_route: true,
      stack: 'gvisor',
    });
  } else {
    // Режим «системный прокси» — работает без прав администратора
    inbounds.push({
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: opts.httpPort,
    });
  }

  /* ---------- маршрутизация ---------- */
  const rules: Record<string, unknown>[] = [];

  // 1. Служебное: определяем протокол и подменяем адресатов по домену
  rules.push({ action: 'sniff' });

  if (opts.blockAds) {
    rules.push({
      domain_suffix: [
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
        'ad.doubleclick.net', 'an.yandex.ru', 'ads.vk.com', 'adriver.ru', 'criteo.com', 'taboola.com',
        'outbrain.com', 'adcolony.com', 'applovin.com', 'unityads.unity3d.com', 'ads.tiktok.com',
      ],
      action: 'reject',
    });
  }

  if (opts.bypassLocal) {
    rules.push({ domain_suffix: RU_DIRECT_DOMAINS, outbound: DIRECT_TAG });
  }

  // локальные адреса и LAN — всегда напрямую, иначе ломается принтер/роутер
  rules.push({ ip_is_private: true, outbound: DIRECT_TAG });

  // 2. DNS-запросы внутри туннеля обрабатывает встроенный резолвер
  if (opts.dns !== 'system') {
    rules.push({ protocol: 'dns', action: 'hijack-dns' });
  }

  const dns = dnsServers(opts);

  const config: Record<string, unknown> = {
    log: {
      level: opts.logLevel ?? 'warn',
      timestamp: true,
    },
    ...(opts.dns !== 'system'
      ? {
          dns: stripUndefined({
            servers: dns.servers,
            final: dns.final,
          }),
        }
      : {}),
    inbounds,
    outbounds,
    route: stripUndefined({
      rules,
      final: SELECT_TAG,
      auto_detect_interface: !opts.android,
      default_mark: undefined,
    }),
    experimental: {
      clash_api: {
        external_controller: `127.0.0.1:${opts.clashApiPort}`,
        secret: opts.clashSecret,
        default_mode: 'rule',
      },
      cache_file: {
        enabled: true,
        path: opts.cachePath ?? 'cache.db',
        store_fakeip: false,
      },
    },
  };

  return { config, unsupportedIds, tagsByServerId, selectorTag: SELECT_TAG };
}

/** Конфиг hev-socks5-tunnel (Android): TUN из VpnService -> локальный SOCKS ядра. */
export function buildHevConfig(socksPort: number, mtu = 8500): string {
  return [
    'tunnel:',
    '  name: tun0',
    `  mtu: ${mtu}`,
    '  ipv4: 172.19.0.1',
    '  ipv6: "fdfe:dcba:9876::1"',
    "  icmp: 'reply'",
    '',
    'socks5:',
    '  port: ' + socksPort,
    '  address: 127.0.0.1',
    "  udp: 'udp'",
    '  pipeline: true',
    '  tcp-fastopen: true',
    '',
    'misc:',
    "  log-level: 'warn'",
    '  log-file: stderr',
    '  task-stack-size: 204800',
    '  connect-timeout: 8000',
    '  tcp-buffer-size: 131072',
    '  max-session-count: 0',
    '',
  ].join('\n');
}
