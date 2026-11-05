/**
 * Демо-движок для браузерного предпросмотра.
 *
 * ВАЖНО: вне Electron/Android создать настоящий туннель невозможно, поэтому
 * браузерная версия используется только для просмотра интерфейса. Все данные
 * здесь — имитация, и UI помечает такое состояние плашкой «Демо».
 */
import type {
  AppInfo,
  LogLine,
  UpdateProgress,
  CensorProbeResult,
  CensorReport,
  ConnectionState,
  DiagCheck,
  DiagReport,
  Server,
  Settings,
  ShuzuApi,
  Subscription,
  UpdateInfo,
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { evaluateCensorReport } from '../../shared/censor';
import { buildReport } from '../../shared/diag';
import { parseLink } from '../../shared/subscription';
import { pickBest } from '../../shared/quality';
import { sleep } from '../../shared/util';
import { PROBE_TARGETS } from '../../shared/rules';

const LS = {
  servers: 'shuzu.demo.servers',
  subs: 'shuzu.demo.subs',
  settings: 'shuzu.demo.settings',
};

const DEMO_URIS = [
  'vless://11111111-2222-3333-4444-555555555551@us.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=x&sid=ab&type=tcp&flow=xtls-rprx-vision#🇺🇸 United States | New York',
  'vless://11111111-2222-3333-4444-555555555552@de.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=x&sid=ab&type=tcp&flow=xtls-rprx-vision#🇩🇪 Germany | Frankfurt',
  'vless://11111111-2222-3333-4444-555555555553@nl.example.com:443?encryption=none&security=tls&sni=nl.example.com&type=ws&path=%2Fws#🇳🇱 Netherlands | Amsterdam',
  'vless://11111111-2222-3333-4444-555555555554@jp.example.com:443?encryption=none&security=reality&sni=www.apple.com&fp=chrome&pbk=x&sid=ab&type=tcp#🇯🇵 Japan | Tokyo',
  'hysteria2://pass@fi.example.com:8443?sni=fi.example.com#🇫🇮 Finland | Helsinki',
  'vless://11111111-2222-3333-4444-555555555555@uk.example.com:443?encryption=none&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=x&sid=ab&type=grpc&serviceName=grpc#🇬🇧 United Kingdom | London',
  'trojan://password@sg.example.com:443?sni=sg.example.com#🇸🇬 Singapore',
  'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@se.example.com:8388#🇸🇪 Sweden | Stockholm',
  'vless://11111111-2222-3333-4444-555555555556@tr.example.com:443?encryption=none&security=tls&sni=tr.example.com&type=tcp#🇹🇷 Turkey | Istanbul',
  'vless://11111111-2222-3333-4444-555555555557@kz.example.com:443?encryption=none&security=reality&sni=www.google.com&fp=chrome&pbk=x&sid=ab&type=tcp#🇰🇿 Kazakhstan | Almaty',
  'vless://11111111-2222-3333-4444-555555555558@ca.example.com:443?encryption=none&security=tls&sni=ca.example.com&type=ws&path=%2F#🇨🇦 Canada | Toronto',
  'vless://11111111-2222-3333-4444-555555555559@hk.example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=x&sid=ab&type=tcp#🇭🇰 Hong Kong',
];

function loadServers(): Server[] {
  try {
    const raw = localStorage.getItem(LS.servers);
    if (raw) return JSON.parse(raw) as Server[];
  } catch {
    /* ignore */
  }
  const parsed = DEMO_URIS.map((u) => parseLink(u, 'demo')).filter((s): s is Server => !!s);
  // пара избранных и уже «замеренных» — чтобы список выглядел живым
  return parsed.map((s, i) => ({
    ...s,
    favorite: i < 2,
    ping: [58, 92, 104, 168, 210, 84, 240, 96, 130, 88, 176, 232][i] ?? null,
    jitter: 4 + (i % 5) * 2,
    loss: 0,
    pingedAt: Date.now() - 60_000,
  }));
}

function loadSubs(): Subscription[] {
  try {
    const raw = localStorage.getItem(LS.subs);
    if (raw) return JSON.parse(raw) as Subscription[];
  } catch {
    /* ignore */
  }
  return [
    {
      id: 'demo',
      name: 'Demo Subscription',
      url: 'https://example.com/sub',
      trafficUsed: 12.4 * 1024 ** 3,
      trafficTotal: 100 * 1024 ** 3,
      expiresAt: Date.now() + 24 * 86_400_000,
      updatedAt: Date.now() - 3600_000,
      lastError: null,
      serverCount: DEMO_URIS.length,
      enabled: true,
    },
  ];
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const initialConn: ConnectionState = {
  status: 'disconnected',
  serverId: null,
  auto: true,
  mode: 'tun',
  startedAt: null,
  error: null,
  rx: 0,
  tx: 0,
  localPort: null,
  exitIp: null,
  exitCountry: null,
};

export function createDemoEngine(): ShuzuApi {
  let servers = loadServers();
  let subs = loadSubs();
  let settings: Settings = (() => {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_SETTINGS };
  })();
  let conn: ConnectionState = { ...initialConn, mode: settings.mode };
  const stateListeners = new Set<(s: ConnectionState) => void>();
  const progressListeners = new Set<(p: UpdateProgress) => void>();
  const toastListeners = new Set<(t: { kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }) => void>();
  const logListeners = new Set<(l: LogLine) => void>();

  const emit = () => stateListeners.forEach((cb) => cb({ ...conn }));
  const emitToast = (t: { kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }) =>
    toastListeners.forEach((cb) => cb(t));

  const info: AppInfo = {
    version: '0.1.0',
    platform: 'web',
    arch: 'web',
    coreVersion: null,
    coreReady: false,
    isAdmin: false,
    packaged: false,
    repo: 'kayorissss/SHUZU',
    demo: true,
  };

  const persistServers = () => save(LS.servers, servers);

  function pickServer(id: string | null | undefined, auto: boolean | undefined): Server | null {
    if (auto || !id) {
      return pickBest(servers) ?? servers[0] ?? null;
    }
    return servers.find((s) => s.id === id) ?? null;
  }

  return {
    info: async () => info,
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch };
        save(LS.settings, settings);
        if (patch.mode) conn = { ...conn, mode: patch.mode };
        emit();
        return settings;
      },
    },
    servers: {
      list: async () => servers,
      ping: async (id) => {
        const s = servers.find((x) => x.id === id);
        if (!s) throw new Error('not found');
        await sleep(160 + Math.random() * 260);
        const ping = 40 + Math.round(Math.random() * 200);
        const updated: Server = { ...s, ping, jitter: Math.round(Math.random() * 14), loss: 0, pingedAt: Date.now(), dead: false };
        servers = servers.map((x) => (x.id === id ? updated : x));
        persistServers();
        return updated;
      },
      pingMany: async (ids) => {
        for (const id of ids) {
          await sleep(90 + Math.random() * 120);
          servers = servers.map((s) =>
            s.id === id ? { ...s, ping: 40 + Math.round(Math.random() * 200), jitter: Math.round(Math.random() * 12), loss: 0, pingedAt: Date.now(), dead: false } : s,
          );
        }
        persistServers();
        return servers;
      },
      pingAll: async () => {
        servers = servers.map((s) => ({
          ...s,
          ping: 35 + Math.round(Math.random() * 220),
          jitter: Math.round(Math.random() * 12),
          loss: 0,
          pingedAt: Date.now(),
          dead: Math.random() < 0.05,
        }));
        persistServers();
        return servers;
      },
      toggleFavorite: async (id) => {
        servers = servers.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s));
        persistServers();
        return servers;
      },
      remove: async (id) => {
        servers = servers.filter((s) => s.id !== id);
        persistServers();
        return servers;
      },
      add: async ({ name, url, content }) => {
        const text = content ?? url ?? '';
        const parsed = text
          .split(/\r?\n/)
          .map((l) => parseLink(l, 'demo'))
          .filter((s): s is Server => !!s);
        const added = parsed.map((s) => ({ ...s, subscriptionId: null }));
        servers = [...servers, ...added];
        persistServers();
        const sub: Subscription = {
          id: `demo-${Date.now()}`,
          name: name || 'Новая подписка',
          url: url ?? null,
          trafficUsed: null,
          trafficTotal: null,
          expiresAt: null,
          updatedAt: Date.now(),
          lastError: null,
          serverCount: added.length,
          enabled: true,
        };
        if (url) {
          subs = [...subs, sub];
          save(LS.subs, subs);
        }
        return { added: added.length, subscription: url ? sub : null, servers };
      },
      geo: async (id) => servers.find((s) => s.id === id)!,
    },
    subscriptions: {
      list: async () => subs,
      update: async (id) => {
        subs = subs.map((s) => (s.id === id ? { ...s, updatedAt: Date.now(), lastError: null } : s));
        save(LS.subs, subs);
        return servers;
      },
      updateAll: async () => {
        subs = subs.map((s) => ({ ...s, updatedAt: Date.now(), lastError: null }));
        save(LS.subs, subs);
        return servers;
      },
      setEnabled: async (id, enabled) => {
        subs = subs.map((s) => (s.id === id ? { ...s, enabled } : s));
        save(LS.subs, subs);
        return subs;
      },
      remove: async (id) => {
        subs = subs.filter((s) => s.id !== id);
        servers = servers.filter((s) => s.subscriptionId !== id);
        save(LS.subs, subs);
        persistServers();
        return servers;
      },
    },
    connect: async ({ serverId, auto }) => {
      const srv = pickServer(serverId, auto);
      if (!srv) {
        conn = { ...conn, status: 'error', error: 'Нет серверов' };
        emit();
        return conn;
      }
      conn = { ...conn, status: 'connecting', serverId: srv.id, auto: auto ?? !serverId, error: null };
      emit();
      await sleep(650);
      conn = { ...conn, status: 'connecting', localPort: settings.socksPort };
      emit();
      await sleep(500);
      conn = {
        ...conn,
        status: 'connected',
        startedAt: Date.now(),
        localPort: settings.socksPort,
        exitIp: '203.0.113.' + (10 + Math.floor(Math.random() * 80)),
        exitCountry: srv.country,
      };
      emit();
      emitToast({ kind: 'success', title: 'Подключено', body: `${srv.cleanName} · ${settings.mode === 'tun' ? 'TUN' : 'системный прокси'}` });
      return conn;
    },
    disconnect: async () => {
      conn = { ...conn, status: 'disconnecting' };
      emit();
      await sleep(320);
      conn = { ...initialConn, mode: settings.mode };
      emit();
      return conn;
    },
    state: async () => conn,
    onState: (cb) => {
      stateListeners.add(cb);
      cb({ ...conn });
      return () => stateListeners.delete(cb);
    },
    stats: async () => ({
      rx: conn.rx,
      tx: conn.tx,
      uptime: conn.startedAt ? Date.now() - conn.startedAt : 0,
    }),
    diagnostics: {
      run: async (): Promise<DiagReport> => {
        const checks: DiagCheck[] = [];
        const push = (c: DiagCheck) => checks.push(c);
        await sleep(200);
        push({ id: 'core-missing', title: 'Ядро sing-box', status: 'warn', detail: 'Демо-режим: ядро не запускается в браузере.', fix: 'Откройте приложение для Windows или Android — ядро идёт в комплекте.', weight: 30, group: 'core' });
        await sleep(160);
        push({ id: 'net', title: 'Доступ в интернет', status: 'ok', detail: 'Шлюз отвечает, DNS работает.', weight: 25, group: 'network' });
        push({ id: 'admin', title: 'Права администратора', status: 'info', detail: 'Не требуется в демо-режиме.', weight: 0, group: 'system' });
        push({ id: 'system-proxy', title: 'Системный прокси', status: 'ok', detail: 'Прокси не задан.', weight: 10, group: 'system' });
        push({ id: 'other-vpn', title: 'Другие VPN-адаптеры', status: 'ok', detail: 'Конфликтов не найдено.', weight: 15, group: 'system' });
        push({ id: 'dns', title: 'DNS', status: 'ok', detail: '77.88.8.8, 1.1.1.1', weight: 10, group: 'dns' });
        push({ id: 'clock', title: 'Системное время', status: 'ok', detail: 'Расхождение 0.4 с — TLS будет работать.', weight: 10, group: 'security' });
        return buildReport(checks);
      },
    },
    censor: {
      run: async (): Promise<CensorReport> => {
        const probes: CensorProbeResult[] = [];
        for (const t of PROBE_TARGETS.slice(0, 12)) {
          await sleep(60);
          const ok = Math.random() > (t.group === 'local' ? 0.05 : 0.3);
          probes.push({ id: t.id, label: t.label, group: t.group, ok, ms: ok ? 30 + Math.round(Math.random() * 320) : null, via: 'http' });
        }
        return evaluateCensorReport(probes);
      },
    },
    updates: {
      check: async (): Promise<UpdateInfo> => ({
        available: false,
        version: info.version,
        currentVersion: info.version,
        notes: '',
        url: `https://github.com/${info.repo}/releases`,
        assetUrl: null,
        assetName: null,
        size: null,
        publishedAt: null,
        mandatory: false,
      }),
      download: async () => {
        for (let p = 0; p <= 100; p += 10) {
          progressListeners.forEach((cb) => cb({ stage: 'downloading', percent: p, message: 'Демо-загрузка' }));
          await sleep(80);
        }
      },
      install: async () => {},
      onProgress: (cb) => {
        progressListeners.add(cb);
        return () => progressListeners.delete(cb);
      },
    },
    window: {
      minimize: () => {},
      toggleMaximize: () => {},
      close: () => {},
      hide: () => {},
      isMaximized: async () => false,
      onMaximizeChange: () => () => {},
    },
    app: {
      openExternal: (url) => window.open(url, '_blank', 'noopener'),
      quit: () => {},
      restartAsAdmin: async () => false,
      exportBackup: async () => JSON.stringify({ servers, subs, settings }, null, 2),
      importBackup: async (json) => {
        try {
          const data = JSON.parse(json) as { servers?: Server[]; subs?: Subscription[]; settings?: Settings };
          if (data.servers) servers = data.servers;
          if (data.subs) subs = data.subs;
          if (data.settings) settings = { ...settings, ...data.settings };
          persistServers();
          save(LS.subs, subs);
          save(LS.settings, settings);
          return true;
        } catch {
          return false;
        }
      },
    },
    logs: async () => [{ t: Date.now(), level: 'info', msg: 'Демо-режим: журнал недоступен' }],
    onLog: (cb) => {
      logListeners.add(cb);
      return () => logListeners.delete(cb);
    },
    onToast: (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
  };
}
