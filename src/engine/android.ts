/**
 * Android-движок.
 *
 * Вся «серверная» логика (разбор подписок, генерация конфига ядра, оценка
 * серверов, диагностика, анализ блокировок) выполняется здесь, на TypeScript —
 * ровно том же коде, что и на ПК. Нативная часть (Java) отдаёт только то,
 * чего нет в WebView: raw-TCP, HTTP без CORS, запуск VPN и уведомления.
 */
import { registerPlugin } from '@capacitor/core';
import type {
  AppInfo,
  CensorProbeResult,
  CensorReport,
  ConnectionState,
  DiagCheck,
  DiagReport,
  LogLine,
  Server,
  Settings,
  ShuzuApi,
  Subscription,
  UpdateInfo,
  UpdateProgress,
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { buildSingboxConfig } from '../../shared/singbox';
import { evaluateCensorReport } from '../../shared/censor';
import { buildReport } from '../../shared/diag';
import { parseSubscription, parseUserInfo, isSubscriptionUrl, stableId } from '../../shared/subscription';
import { mapLimit, randomId, sleep } from '../../shared/util';
import { PROBE_TARGETS } from '../../shared/rules';

interface NativePlugin {
  info(): Promise<{
    version: string;
    platform: string;
    sdk: number;
    device: string;
    abi: string;
    coreReady: boolean;
    corePath: string;
    vpnActive: boolean;
  }>;
  httpGet(opts: { url: string; method?: string; headers?: Record<string, string>; timeout?: number }): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }>;
  tcpPing(opts: { targets: Array<{ host: string; port: number }>; timeout?: number }): Promise<{
    results: Array<{ host: string; port: number; ms: number | null; error?: string }>;
  }>;
  dnsResolve(opts: { host: string }): Promise<{ addresses: string[]; ms: number }>;
  ensureVpnPermission(): Promise<{ granted: boolean }>;
  startVpn(opts: { config: string; socksPort: number; title: string; subtitle: string }): Promise<{ started: boolean }>;
  stopVpn(): Promise<{ stopped: boolean }>;
  vpnState(): Promise<{ active: boolean; startedAt: number; rx: number; tx: number; error: string | null; coreRunning: boolean; coreError: string | null }>;
  logs(): Promise<{ lines: string[] }>;
  notify(opts: { title: string; body: string }): Promise<void>;
  updateNotification(opts: { title?: string; subtitle?: string }): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  downloadApk(opts: { url: string; fileName: string }): Promise<{ path: string; size: number }>;
  installApk(opts: { path: string }): Promise<void>;
  batteryOptimization(): Promise<{ ignoring: boolean }>;
  openBatterySettings(): Promise<void>;
  openUrl(opts: { url: string }): Promise<void>;
  quitApp(): Promise<void>;
}

const Native = registerPlugin<NativePlugin>('Shuzu');

const LS = {
  servers: 'shuzu.servers',
  subs: 'shuzu.subs',
  settings: 'shuzu.settings',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* переполнение хранилища не должно ломать приложение */
  }
}

export async function setupAndroidEngine(): Promise<ShuzuApi> {
  const nativeInfo = await Native.info().catch(() => null);

  let servers: Server[] = read<Server[]>(LS.servers, []);
  let subs: Subscription[] = read<Subscription[]>(LS.subs, []);
  let settings: Settings = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(LS.settings, {}) };
  let conn: ConnectionState = {
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
  let lastError: string | null = null;
  let exitCache: { ip: string | null; country: string | null; at: number } = { ip: null, country: null, at: 0 };

  const stateListeners = new Set<(s: ConnectionState) => void>();
  const toastListeners = new Set<(t: { kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }) => void>();
  const progressListeners = new Set<(p: UpdateProgress) => void>();
  const logListeners = new Set<(l: LogLine) => void>();

  const info: AppInfo = {
    version: nativeInfo?.version ?? '1.0.0',
    platform: 'android',
    arch: nativeInfo?.abi ?? 'arm64-v8a',
    coreVersion: nativeInfo?.coreReady ? 'встроенное ядро' : null,
    coreReady: nativeInfo?.coreReady ?? false,
    isAdmin: true,
    packaged: true,
    repo: 'kayorissss/SHUZU',
    demo: false,
  };

  const emit = () => stateListeners.forEach((cb) => cb({ ...conn }));
  const toast = (t: { kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }) =>
    toastListeners.forEach((cb) => cb(t));
  const persistServers = () => write(LS.servers, servers);
  const persistSubs = () => write(LS.subs, subs);

  /* ------------------------------ HTTP ---------------------------------- */

  async function httpText(url: string, opts: { headers?: Record<string, string>; timeout?: number } = {}) {
    const res = await Native.httpGet({ url, headers: opts.headers, timeout: opts.timeout ?? 20000 });
    return res;
  }

  /* ------------------------------ пинг ---------------------------------- */

  async function pingServers(list: Server[]): Promise<Server[]> {
    if (!list.length) return servers;
    const targets = list.map((s) => ({ host: s.host, port: s.port }));
    let results: Array<{ host: string; port: number; ms: number | null; error?: string }> = [];
    try {
      const res = await Native.tcpPing({ targets, timeout: 4000 });
      results = res.results ?? [];
    } catch {
      results = [];
    }
    const map = new Map<string, { ms: number | null; error?: string }>();
    results.forEach((r) => map.set(`${r.host}:${r.port}`, { ms: r.ms, error: r.error }));

    const updated = servers.map((s) => {
      if (!list.some((l) => l.id === s.id)) return s;
      const r = map.get(`${s.host}:${s.port}`);
      const ms = r?.ms ?? null;
      return {
        ...s,
        ping: ms,
        jitter: ms != null ? Math.max(0, Math.round(ms * 0.08)) : null,
        loss: ms == null ? 1 : 0,
        dead: ms == null,
        pingedAt: Date.now(),
      } as Server;
    });
    servers = updated;
    persistServers();
    return updated;
  }

  /* --------------------------- подписки --------------------------------- */

  async function refreshSubscription(sub: Subscription, allServers: Server[]): Promise<{ servers: Server[]; sub: Subscription }> {
    if (!sub.url) return { servers: allServers, sub };
    const res = await httpText(sub.url, { headers: { Accept: '*/*' } });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    const parsed = parseSubscription(res.body, sub.id);
    const userinfo = parseUserInfo(res.headers['subscription-userinfo']);
    const favorites = new Map(allServers.map((s) => [s.id, s.favorite]));
    const others = allServers.filter((s) => s.subscriptionId !== sub.id);
    const refreshed = parsed.servers.map((s) => ({ ...s, favorite: favorites.get(s.id) ?? s.favorite }));
    return {
      servers: [...others, ...refreshed],
      sub: {
        ...sub,
        updatedAt: Date.now(),
        lastError: null,
        serverCount: refreshed.length,
        trafficUsed: userinfo.used,
        trafficTotal: userinfo.total,
        expiresAt: userinfo.expiresAt,
      },
    };
  }

  /* --------------------------- подключение ------------------------------ */

  function currentServer(): Server | null {
    if (conn.serverId) return servers.find((s) => s.id === conn.serverId) ?? null;
    const alive = servers.filter((s) => !s.dead);
    const sorted = [...alive].sort((a, b) => (a.ping ?? 9999) - (b.ping ?? 9999));
    return sorted[0] ?? null;
  }

  async function startTunnel(server: Server | null): Promise<ConnectionState> {
    if (!servers.length) throw new Error('Нет серверов');
    // Android 13+: без разрешения не будет плашки со статусом VPN
    void Native.requestNotificationPermission().catch(() => null);

    const permission = await Native.ensureVpnPermission().catch(() => ({ granted: false }));
    if (!permission.granted) throw new Error('Нужно разрешение системы на VPN');

    const enabledSubs = new Set(subs.filter((s) => s.enabled).map((s) => s.id));
    const usable = servers.filter((s) => !s.subscriptionId || enabledSubs.has(s.subscriptionId));
    const built = buildSingboxConfig({
      servers: usable,
      selectedServerId: server?.id ?? null,
      mode: 'tun',
      android: true,
      socksPort: settings.socksPort,
      httpPort: settings.httpPort,
      clashApiPort: 19090,
      clashSecret: randomId(16),
      dns: settings.dns,
      customDns: settings.customDns,
      bypassLocal: settings.bypassLocal,
      blockAds: settings.blockAds,
      logLevel: 'warn',
    });

    conn = { ...conn, status: 'connecting', serverId: server?.id ?? null, auto: !server, error: null };
    emit();

    await Native.startVpn({
      config: JSON.stringify(built.config),
      socksPort: settings.socksPort,
      title: server ? server.cleanName : 'Лучший сервер',
      subtitle: 'Подключение…',
    });

    // ждём подтверждения от службы
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await sleep(400);
      const st = await Native.vpnState().catch(() => null);
      if (!st) continue;
      if (st.active) {
        conn = {
          ...conn,
          status: 'connected',
          startedAt: st.startedAt || Date.now(),
          rx: st.rx,
          tx: st.tx,
          error: null,
        };
        emit();
        void refreshExit();
        void updateTunnelNotification(server);
        return conn;
      }
      if (st.error) {
        lastError = st.error;
        throw new Error(st.error);
      }
    }
    throw new Error(lastError ?? 'Ядро не подняло туннель');
  }

  /** Плашка в шторке: имя сервера и пинг, как в самом приложении. */
  async function updateTunnelNotification(server: Server | null) {
    if (!settings.notifications) return;
    const name = server ? server.cleanName : 'Лучший сервер';
    const ping = server?.ping ? `${server.ping} мс · ` : '';
    try {
      await Native.updateNotification({ title: name, subtitle: `${ping}защищено` });
    } catch {
      /* уведомления могут быть запрещены — не критично */
    }
  }

  async function refreshExit() {
    try {
      const res = await httpText('https://ipwho.is/?fields=ip,country_code,success', { timeout: 8000 });
      const json = JSON.parse(res.body) as { ip?: string; country_code?: string; success?: boolean };
      if (json.success !== false && json.ip) {
        exitCache = { ip: json.ip, country: json.country_code ?? null, at: Date.now() };
        conn = { ...conn, exitIp: exitCache.ip, exitCountry: exitCache.country };
        emit();
      }
    } catch {
      /* без внешнего IP тоже живём */
    }
  }

  async function stopTunnel(): Promise<ConnectionState> {
    conn = { ...conn, status: 'disconnecting' };
    emit();
    try {
      await Native.stopVpn();
    } catch {
      /* ignore */
    }
    await sleep(350);
    conn = { ...conn, status: 'disconnected', startedAt: null, rx: 0, tx: 0, exitIp: null, exitCountry: null, localPort: null };
    emit();
    return conn;
  }

  // опрос состояния: сервис живёт отдельно от WebView
  setInterval(async () => {
    try {
      const st = await Native.vpnState();
      if (st.active && conn.status !== 'connected') {
        conn = { ...conn, status: 'connected', startedAt: st.startedAt || Date.now() };
        emit();
      }
      if (!st.active && (conn.status === 'connected' || conn.status === 'connecting')) {
        conn = { ...conn, status: 'disconnected', startedAt: null, error: st.error ?? null };
        if (st.error) lastError = st.error;
        emit();
      }
      if (st.active) {
        conn = { ...conn, rx: st.rx, tx: st.tx };
      }
    } catch {
      /* служба может быть недоступна сразу после старта */
    }
  }, 2000);

  /* ------------------------------ engine -------------------------------- */

  const api: ShuzuApi = {
    info: async () => info,
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch };
        write(LS.settings, settings);
        return settings;
      },
    },
    servers: {
      list: async () => servers,
      ping: async (id) => {
        const target = servers.find((s) => s.id === id);
        if (!target) throw new Error('Сервер не найден');
        const updated = await pingServers([target]);
        const found = updated.find((s) => s.id === id);
        if (!found) throw new Error('Сервер не найден');
        return found;
      },
      pingMany: async (ids) => {
        const list = servers.filter((s) => ids.includes(s.id));
        return pingServers(list);
      },
      pingAll: async () => pingServers(servers),
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
        let body = content ?? '';
        let sub: Subscription | null = null;
        if (url && isSubscriptionUrl(url)) {
          const res = await httpText(url, { headers: { Accept: '*/*' } });
          if (res.status >= 400) throw new Error(`Подписка вернула HTTP ${res.status}`);
          body = res.body;
          const userinfo = parseUserInfo(res.headers['subscription-userinfo']);
          sub = {
            id: stableId(url),
            name: name || new URL(url).hostname,
            url,
            trafficUsed: userinfo.used,
            trafficTotal: userinfo.total,
            expiresAt: userinfo.expiresAt,
            updatedAt: Date.now(),
            lastError: null,
            serverCount: 0,
            enabled: true,
          };
        }
        const parsed = parseSubscription(body, sub?.id ?? null);
        if (!parsed.servers.length) throw new Error('Серверы не найдены — проверьте формат');
        const existing = new Set(servers.map((s) => s.id));
        const added = parsed.servers.filter((s) => !existing.has(s.id));
        servers = [...servers, ...added];
        persistServers();
        if (sub) {
          sub.serverCount = added.length;
          subs = [...subs.filter((s) => s.id !== sub!.id), sub];
          persistSubs();
        }
        return { added: added.length, subscription: sub, servers };
      },
      geo: async (id) => servers.find((s) => s.id === id)!,
    },
    subscriptions: {
      list: async () => subs,
      update: async (id) => {
        const sub = subs.find((s) => s.id === id);
        if (!sub) return servers;
        try {
          const res = await refreshSubscription(sub, servers);
          servers = res.servers;
          subs = subs.map((s) => (s.id === id ? res.sub : s));
          persistServers();
          persistSubs();
          return servers;
        } catch (e) {
          subs = subs.map((s) => (s.id === id ? { ...s, lastError: e instanceof Error ? e.message : String(e) } : s));
          persistSubs();
          throw e;
        }
      },
      updateAll: async () => {
        for (const sub of [...subs]) {
          if (!sub.url) continue;
          try {
            const res = await refreshSubscription(sub, servers);
            servers = res.servers;
            subs = subs.map((s) => (s.id === sub.id ? res.sub : s));
          } catch (e) {
            subs = subs.map((s) => (s.id === sub.id ? { ...s, lastError: e instanceof Error ? e.message : String(e) } : s));
          }
        }
        persistServers();
        persistSubs();
        return servers;
      },
      setEnabled: async (id, enabled) => {
        subs = subs.map((s) => (s.id === id ? { ...s, enabled } : s));
        persistSubs();
        return subs;
      },
      remove: async (id) => {
        subs = subs.filter((s) => s.id !== id);
        servers = servers.filter((s) => s.subscriptionId !== id);
        persistSubs();
        persistServers();
        return servers;
      },
    },
    connect: async ({ serverId, auto }) => {
      const target = serverId ? servers.find((s) => s.id === serverId) ?? null : auto ? currentServer() : currentServer();
      try {
        return await startTunnel(target);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        conn = { ...conn, status: 'error', error: msg };
        emit();
        toast({ kind: 'error', title: 'Не удалось подключиться', body: msg });
        throw e;
      }
    },
    disconnect: stopTunnel,
    state: async () => conn,
    onState: (cb) => {
      stateListeners.add(cb);
      cb({ ...conn });
      return () => stateListeners.delete(cb);
    },
    stats: async () => {
      const st = await Native.vpnState().catch(() => null);
      return {
        rx: st?.rx ?? conn.rx,
        tx: st?.tx ?? conn.tx,
        uptime: st?.startedAt ? Date.now() - st.startedAt : 0,
      };
    },
    diagnostics: {
      run: async (): Promise<DiagReport> => {
        const checks: DiagCheck[] = [];
        const push = (c: DiagCheck) => checks.push(c);

        // ядро
        const coreCheck = await Native.info().catch(() => null);
        push({
          id: 'core-missing',
          title: 'Встроенное ядро sing-box',
          group: 'core',
          weight: 26,
          status: coreCheck?.coreReady ? 'ok' : 'fail',
          detail: coreCheck?.coreReady ? `Ядро на месте (${coreCheck.abi}).` : 'Бинарник ядра не найден в APK.',
          fix: coreCheck?.coreReady ? undefined : 'Переустановите APK — ядро распаковывается при установке.',
        });

        // VPN-служба
        const vpn = await Native.vpnState().catch(() => null);
        push({
          id: 'android-vpn-permission',
          title: 'Служба VPN',
          group: 'core',
          weight: 18,
          status: vpn?.active ? 'ok' : 'info',
          detail: vpn?.active ? 'Туннель активен.' : 'Туннель выключен.',
          fix: vpn?.error ?? undefined,
        });

        // сеть
        let netOk = false;
        let netMs: number | null = null;
        try {
          const started = Date.now();
          const res = await httpText('https://www.gstatic.com/generate_204', { timeout: 7000 });
          netOk = res.status > 0 && res.status < 500;
          netMs = Date.now() - started;
        } catch {
          netOk = false;
        }
        push({
          id: 'net',
          title: 'Доступ в интернет',
          group: 'network',
          weight: 24,
          status: netOk ? 'ok' : 'fail',
          detail: netOk ? `HTTPS отвечает за ${netMs} мс.` : 'Не удалось выполнить HTTPS-запрос.',
          fix: netOk ? undefined : 'Проверьте мобильные данные или Wi-Fi.',
        });

        // DNS
        let dnsOk = false;
        let dnsMs: number | null = null;
        try {
          const res = await Native.dnsResolve({ host: 'www.google.com' });
          dnsOk = (res.addresses?.length ?? 0) > 0;
          dnsMs = res.ms;
        } catch {
          dnsOk = false;
        }
        push({
          id: 'dns',
          title: 'DNS',
          group: 'dns',
          weight: 10,
          status: dnsOk ? 'ok' : 'fail',
          detail: dnsOk ? `Разрешение имён работает (${dnsMs} мс).` : 'DNS не отвечает.',
          fix: dnsOk ? undefined : 'Включите «DNS через туннель» или смените DNS в настройках сети.',
        });

        // батарея
        const battery = await Native.batteryOptimization().catch(() => null);
        push({
          id: 'android-battery',
          title: 'Оптимизация батареи',
          group: 'system',
          weight: 6,
          status: battery?.ignoring ? 'ok' : 'warn',
          detail: battery?.ignoring ? 'SHUZU исключён из оптимизации.' : 'Система может останавливать VPN в фоне.',
          fix: battery?.ignoring ? undefined : 'Разрешите работу в фоне: «Батарея → Без ограничений» для SHUZU.',
        });

        // время
        try {
          const res = await httpText('https://www.gstatic.com/generate_204', { timeout: 6000 });
          const dateHeader = res.headers['date'];
          if (dateHeader) {
            const diff = Math.abs(Date.now() - Date.parse(dateHeader)) / 1000;
            push({
              id: 'clock',
              title: 'Системное время',
              group: 'security',
              weight: 6,
              status: diff > 120 ? 'fail' : 'ok',
              detail: `Расхождение: ${Math.round(diff)} с.`,
              fix: diff > 120 ? 'Включите автоматическую синхронизацию времени — иначе TLS не установится.' : undefined,
            });
          }
        } catch {
          /* без сети проверка времени бессмысленна */
        }

        if (!servers.length) {
          push({
            id: 'sub-empty',
            title: 'Серверы',
            group: 'core',
            weight: 12,
            status: 'fail',
            detail: 'Список серверов пуст.',
            fix: 'Добавьте подписку: буфер обмена, QR-код или файл.',
          });
        }

        const broken = subs.filter((s) => s.lastError);
        if (broken.length) {
          push({
            id: 'sub-error',
            title: 'Ошибки подписок',
            group: 'core',
            weight: 0,
            status: 'warn',
            detail: broken.map((s) => `${s.name}: ${s.lastError}`).join('; ').slice(0, 250),
          });
        }

        return buildReport(checks);
      },
    },
    censor: {
      run: async (): Promise<CensorReport> => {
        const probes = await mapLimit(PROBE_TARGETS, 4, async (target): Promise<CensorProbeResult> => {
          let dnsOk = false;
          try {
            const dns = await Native.dnsResolve({ host: target.host });
            dnsOk = (dns.addresses?.length ?? 0) > 0;
          } catch {
            dnsOk = false;
          }
          let ping: { ms: number | null; error?: string } = { ms: null };
          try {
            const res = await Native.tcpPing({ targets: [{ host: target.host, port: 443 }], timeout: 6000 });
            ping = res.results?.[0] ?? { ms: null };
          } catch {
            ping = { ms: null };
          }
          let httpOk = false;
          let httpMs: number | null = null;
          try {
            const started = Date.now();
            const res = await httpText(target.url, { timeout: 7000 });
            httpOk = res.status > 0 && res.status < 500;
            httpMs = Date.now() - started;
          } catch {
            httpOk = false;
          }
          const suspicious = !!ping.ms && !httpOk;
          return {
            id: target.id,
            label: target.label,
            group: target.group,
            ok: httpOk,
            ms: httpMs ?? (ping.ms != null ? Math.round(ping.ms) : null),
            via: 'http',
            error: !dnsOk ? 'DNS' : !ping.ms ? ping.error ?? 'TCP' : !httpOk ? 'HTTP' : undefined,
            suspicious,
          };
        });
        return evaluateCensorReport(probes);
      },
    },
    updates: {
      check: async (): Promise<UpdateInfo> => {
        const result: UpdateInfo = {
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
        };
        try {
          const res = await httpText(`https://api.github.com/repos/${info.repo}/releases/latest`, {
            headers: { Accept: 'application/vnd.github+json' },
            timeout: 12000,
          });
          if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
          const release = JSON.parse(res.body) as {
            tag_name: string;
            body: string;
            html_url: string;
            published_at: string;
            assets: Array<{ name: string; browser_download_url: string; size: number }>;
          };
          const version = release.tag_name.replace(/^v/i, '');
          const apk = release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
          result.version = version;
          result.notes = release.body ?? '';
          result.url = release.html_url;
          result.publishedAt = release.published_at;
          result.assetUrl = apk?.browser_download_url ?? null;
          result.assetName = apk?.name ?? null;
          result.size = apk?.size ?? null;
          const cur = info.version.split('.').map((x) => parseInt(x, 10) || 0);
          const remote = version.split('.').map((x) => parseInt(x, 10) || 0);
          result.available = remote.some((v, i) => v > (cur[i] ?? 0)) && !remote.every((v, i) => v === (cur[i] ?? 0));
        } catch (e) {
          result.notes = e instanceof Error ? e.message : String(e);
        }
        return result;
      },
      download: async () => {
        const check = await api.updates.check();
        if (!check.available || !check.assetUrl) throw new Error('Обновление недоступно');
        progressListeners.forEach((cb) => cb({ stage: 'downloading', percent: 5, message: 'Скачиваем APK…' }));
        const res = await Native.downloadApk({ url: check.assetUrl, fileName: check.assetName ?? 'shuzu-update.apk' });
        progressListeners.forEach((cb) => cb({ stage: 'ready', percent: 100, message: `Скачано ${(res.size / 1024 / 1024).toFixed(1)} МБ` }));
        localStorage.setItem('shuzu.pendingApk', res.path);
      },
      install: async () => {
        const path = localStorage.getItem('shuzu.pendingApk');
        if (!path) throw new Error('Файл обновления не найден');
        await Native.installApk({ path });
      },
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
      openExternal: (url) => void Native.openUrl({ url }).catch(() => {}),
      quit: () => void Native.quitApp().catch(() => {}),
      restartAsAdmin: async () => false,
      exportBackup: async () => JSON.stringify({ settings, servers, subscriptions: subs }, null, 2),
      importBackup: async (json) => {
        try {
          const data = JSON.parse(json) as { settings?: Settings; servers?: Server[]; subscriptions?: Subscription[] };
          if (data.settings) settings = { ...settings, ...data.settings };
          if (Array.isArray(data.servers)) servers = data.servers;
          if (Array.isArray(data.subscriptions)) subs = data.subscriptions;
          write(LS.settings, settings);
          persistServers();
          persistSubs();
          return true;
        } catch {
          return false;
        }
      },
    },
    logs: async () => {
      const res = await Native.logs().catch(() => ({ lines: [] as string[] }));
      return (res.lines ?? []).slice(-400).map((line) => {
        const level: LogLine['level'] = /error|fatal/i.test(line) ? 'error' : /warn/i.test(line) ? 'warn' : 'info';
        return { t: Date.now(), level, msg: line };
      });
    },
    onLog: (cb) => {
      logListeners.add(cb);
      return () => logListeners.delete(cb);
    },
    onToast: (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
  };

  // мост для остального кода
  (window as unknown as { shuzu: ShuzuApi }).shuzu = api;
  (window as unknown as { shuzuAndroid: boolean }).shuzuAndroid = true;
  return api;
}

/** Определяем, что код исполняется внутри нативной оболочки Capacitor. */
export function isNativeAndroid(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (!cap) return false;
  try {
    return cap.isNativePlatform?.() === true && cap.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}
