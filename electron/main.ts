/** Точка входа main-процесса SHUZU. */
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  protocol,
  shell,
  Tray,
  net as electronNet,
} from 'electron';
import { join, normalize, sep } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type {
  AppInfo,
  CensorReport,
  ConnectionState,
  DiagReport,
  Server,
  Settings,
  Subscription,
  UpdateInfo,
  LogLine,
} from '../shared/types';
import { core } from './core';
import { checkForUpdates, downloadUpdate, installUpdate, REPO, setProgressListener } from './updater';
import { measureServer, fetchSubscription, exitInfo, setSystemProxy, getSystemProxy, httpProbe } from './net';
import { runDiagnostics } from './diagnostics';
import { runCensorCheck } from './censor';
import {
  getServers,
  getSettings,
  getSubscriptions,
  loadState,
  saveState,
  setServers,
  setSettings,
  setSubscriptions,
} from './store';
import { parseSubscription, stableId, isSubscriptionUrl } from '../shared/subscription';
import { pickBest } from '../shared/quality';
import { mapLimit } from '../shared/util';

const isDev = !app.isPackaged;
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
const isWin = process.platform === 'win32';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let connecting = false;

/* --------------------------- протокол app:// --------------------------- */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function registerAppProtocol() {
  const root = join(__dirname, '..', 'renderer');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(normalize(root + sep))) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!existsSync(filePath)) {
      // SPA-фолбэк
      const index = join(root, 'index.html');
      if (existsSync(index)) return electronNet.fetch(pathToFileURL(index).toString());
      return new Response('Not found', { status: 404 });
    }
    return electronNet.fetch(pathToFileURL(filePath).toString());
  });
}

/* ------------------------------- окна --------------------------------- */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 480,
    frame: false,
    transparent: false,
    backgroundColor: '#07070a',
    resizable: false,
    movable: false,
    show: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0;background:radial-gradient(60% 50% at 50% 42%, #131317, #07070a 72%);overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}
    .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
    .logo{width:92px;height:92px;animation:pop .7s cubic-bezier(.22,1,.36,1) both}
    .word{color:#fff;font-size:24px;font-weight:700;letter-spacing:.3em;text-indent:.3em;animation:fade .6s .2s both}
    .sub{color:rgba(255,255,255,.42);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;animation:fade .6s .35s both}
    .bar{width:132px;height:2px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-top:6px}
    .bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,transparent,#3EE0A8,transparent);animation:slide 1.1s ease-in-out infinite}
    @keyframes slide{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
    @keyframes pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  </style></head><body><div class="wrap">
    <svg class="logo" viewBox="0 0 96 96" fill="none">
      <defs><linearGradient id="g" x1="14" y1="10" x2="82" y2="88" gradientUnits="userSpaceOnUse"><stop stop-color="#3EE0A8"/><stop offset="1" stop-color="#22C4E0"/></linearGradient>
      <filter id="gl" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect x="4" y="4" width="88" height="88" rx="26" fill="url(#g)"/>
      <g filter="url(#gl)"><path d="M48 22 68 32v14.5c0 11.6-7.9 20.4-20 23.5-12.1-3.1-20-11.9-20-23.5V32z" fill="#0B1210" fill-opacity=".86" stroke="#08110E" stroke-opacity=".4" stroke-width="2" stroke-linejoin="round"/>
      <path d="M48 36v11.5" stroke="#EAFFF7" stroke-width="3.4" stroke-linecap="round"/><path d="M41 41.5a9.2 9.2 0 1 0 14 0" stroke="#EAFFF7" stroke-width="3.4" stroke-linecap="round"/></g>
    </svg>
    <div class="word">SHUZU</div><div class="sub">secure tunnel</div><div class="bar"><i></i></div>
  </div></body></html>`;
  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.on('closed', () => (splashWindow = null));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 760,
    minWidth: 380,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#08080a',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    icon: join(__dirname, '..', '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  const send = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  core.onLog = (line) => send('log', line);
  core.onTraffic = () => {
    /* статистику renderer забирает через conn:stats — поток в UI не дублируем */
  };
  core.onExit = (code) => {
    send('state', core.getState());
    if (code !== 0 && getSettings().notifications) {
      notify('Туннель отключился', 'Соединение с сервером прервано. Откройте SHUZU, чтобы переподключиться.');
    }
    // «мягкий» kill switch: если туннель упал, не оставляем системный прокси включённым
    if (getSettings().mode === 'proxy') {
      void setSystemProxy(false).catch(() => {});
    }
  };

  if (isDev && RENDERER_URL) {
    void mainWindow.loadURL(RENDERER_URL);
  } else {
    void mainWindow.loadURL('app://shuzu/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      if (getSettings().startMinimized && getSettings().launchAtLogin) {
        // стартуем в трее
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    }, 900);
  });

  mainWindow.on('maximize', () => send('win:maximized', true));
  mainWindow.on('unmaximize', () => send('win:maximized', false));

  mainWindow.on('close', (e) => {
    if (!quitting && getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (!quitting) {
      quitting = true;
      void shutdown();
    }
  });

  mainWindow.on('closed', () => (mainWindow = null));

  // внешние ссылки — в браузер
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function notify(title: string, body: string) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title,
      body,
      icon: join(__dirname, '..', '..', 'resources', 'icon.png'),
      silent: getSettings().quietMode,
    });
    n.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    n.show();
  } catch {
    /* уведомления могут быть отключены в системе */
  }
}

function sendToast(kind: 'info' | 'warn' | 'error' | 'success', title: string, body?: string) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toast', { kind, title, body });
}

/* ------------------------------- трей --------------------------------- */
function createTray() {
  const iconPath = join(__dirname, '..', '..', 'resources', 'tray.png');
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('SHUZU');
  updateTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const connected = core.getStatus() === 'running';
  const menu = Menu.buildFromTemplate([
    { label: connected ? 'Отключиться' : 'Подключиться', click: () => void (connected ? doDisconnect() : doConnect(null)) },
    { label: 'Показать SHUZU', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: `Версия ${app.getVersion()}`, enabled: false },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

/* --------------------------- подключение ------------------------------ */

async function doConnect(serverId: string | null): Promise<ConnectionState> {
  if (connecting) return core.getState();
  connecting = true;
  const settings = getSettings();
  try {
    const subs = getSubscriptions();
    const enabled = new Set(subs.filter((s) => s.enabled).map((s) => s.id));
    const all = getServers().filter((s) => !s.subscriptionId || enabled.has(s.subscriptionId));
    if (!all.length) throw new Error('Нет серверов для подключения');

    // TUN создаёт виртуальный адаптер — без прав администратора Windows не даст драйвер
    if (settings.mode === 'tun' && isWin && !(await isElevated())) {
      const message =
        'Для режима TUN нужны права администратора: Windows не разрешает установить драйвер адаптера. ' +
        'Перезапустите SHUZU от имени администратора или переключитесь на режим «Системный прокси» — он работает без прав.';
      throw new Error(message);
    }

    let target = serverId;
    if (!target && settings.autoSelectFastest) {
      const best = pickBest(all) ?? all[0];
      target = best?.id ?? null;
    }

    await core.start({ servers: all, serverId: target, mode: settings.mode });

    if (settings.mode === 'proxy' && isWin) {
      await setSystemProxy(true, '127.0.0.1', settings.httpPort);
    }

    const state = core.getState();
    if (mainWindow) mainWindow.webContents.send('state', state);
    updateTrayMenu();

    const server = all.find((s) => s.id === target);
    if (settings.notifications && !settings.quietMode) {
      notify('SHUZU подключён', `${server ? server.cleanName : 'Лучший сервер'} · ${settings.mode === 'tun' ? 'TUN' : 'прокси'}`);
    }

    // через пару секунд проверяем внешний IP — это подтверждает, что туннель реально работает
    setTimeout(async () => {
      const info = await exitInfo();
      const st = core.getState();
      if (st.status === 'connected') {
        const merged = { ...st, exitIp: info.ip, exitCountry: info.country };
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state', merged);
      }
    }, 2500);

    return state;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendToast('error', 'Не удалось подключиться', msg);
    if (settings.mode === 'proxy' && isWin) void setSystemProxy(false).catch(() => {});
    const state = { ...core.getState(), status: 'error' as const, error: msg };
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state', state);
    throw e;
  } finally {
    connecting = false;
  }
}

async function doDisconnect(): Promise<ConnectionState> {
  const settings = getSettings();
  if (settings.mode === 'proxy' && isWin) {
    await setSystemProxy(false).catch(() => {});
  }
  await core.stop();
  const state = core.getState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state', state);
  updateTrayMenu();
  return state;
}

async function shutdown() {
  try {
    await doDisconnect();
  } catch {
    /* ignore */
  }
  try {
    core.cleanupTmp();
  } catch {
    /* ignore */
  }
}

/* ------------------------------ IPC ---------------------------------- */

function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    platform: (process.platform as AppInfo['platform']) ?? 'linux',
    arch: process.arch,
    coreVersion: core.coreVersion(),
    coreReady: core.isReady(),
    isAdmin: process.getuid ? process.getuid() === 0 : false,
    packaged: app.isPackaged,
    repo: REPO,
    demo: false,
  };
}

async function isElevated(): Promise<boolean> {
  if (!isWin) return typeof process.getuid === 'function' ? process.getuid() === 0 : false;
  return new Promise((resolve) => {
    import('node:child_process').then(({ execFile }) => {
      execFile('net', ['session'], { timeout: 4000, windowsHide: true }, (err) => resolve(!err));
    });
  });
}

function registerIpc() {
  ipcMain.handle('info', async (): Promise<AppInfo> => {
    const info = appInfo();
    info.isAdmin = await isElevated();
    return info;
  });

  ipcMain.handle('settings:get', (): Settings => getSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>): Settings => {
    const prev = getSettings();
    const next = setSettings(patch);
    if (patch.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: next.startMinimized ? ['--minimized'] : [] });
    }
    if (patch.minimizeToTray !== undefined) {
      // меню трея обновляется при следующем действии; поведение читается из настроек
    }
    if (prev.mode !== next.mode && core.getStatus() === 'running') {
      sendToast('info', 'Режим изменён', 'Переподключите туннель, чтобы применить новый режим.');
    }
    return next;
  });

  ipcMain.handle('servers:list', (): Server[] => getServers());

  ipcMain.handle('servers:ping', async (_e, id: string): Promise<Server> => {
    const servers = getServers();
    const server = servers.find((s) => s.id === id);
    if (!server) throw new Error('Сервер не найден');

    // если туннель активен и сервер есть в конфиге — меряем реальную задержку через ядро
    let measured: Server;
    if (core.getStatus() === 'running' && core.tagFor(id)) {
      const delay = await core.delayOne(id);
      measured = delay != null
        ? { ...server, tunnelPing: delay, ping: server.ping ?? delay, pingedAt: Date.now(), dead: false }
        : { ...(await measureServer(server)), dead: true };
    } else {
      measured = await measureServer(server);
    }
    const updated = servers.map((s) => (s.id === id ? measured : s));
    setServers(updated);
    return measured;
  });

  ipcMain.handle('servers:pingMany', async (_e, ids: string[]): Promise<Server[]> => {
    const servers = getServers();
    const targets = servers.filter((s) => ids.includes(s.id));
    const results = new Map<string, Server>();
    await mapLimit(targets, 8, async (s) => {
      const m = await measureServer(s);
      results.set(s.id, m);
      return m;
    });
    const updated = servers.map((s) => results.get(s.id) ?? s);
    setServers(updated);
    return updated;
  });

  ipcMain.handle('servers:pingAll', async (): Promise<Server[]> => {
    const servers = getServers();
    const results = new Map<string, Server>();
    const running = core.getStatus() === 'running';
    const delays = running ? await core.delayAll() : {};

    await mapLimit(servers, 8, async (s) => {
      const tunnelDelay = delays[s.id];
      const measured = await measureServer(s);
      const merged: Server =
        tunnelDelay != null ? { ...measured, tunnelPing: tunnelDelay } : measured;
      results.set(s.id, merged);
      return merged;
    });
    const updated = servers.map((s) => results.get(s.id) ?? s);
    setServers(updated);
    return updated;
  });

  ipcMain.handle('servers:favorite', (_e, id: string): Server[] => {
    const servers = getServers().map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s));
    return setServers(servers);
  });

  ipcMain.handle('servers:remove', (_e, id: string): Server[] => setServers(getServers().filter((s) => s.id !== id)));

  ipcMain.handle('servers:geo', async (_e, id: string): Promise<Server> => {
    const servers = getServers();
    const server = servers.find((s) => s.id === id);
    if (!server) throw new Error('Сервер не найден');
    if (server.country) return server;
    const res = await httpProbe(`https://ipwho.is/${encodeURIComponent(server.host)}`, 6000);
    if (!res.ok) return server;
    try {
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(server.host)}`, { signal: AbortSignal.timeout(6000) });
      const json = (await r.json()) as { country_code?: string; city?: string; success?: boolean };
      if (json.success === false) return server;
      const updated: Server = { ...server, country: json.country_code ?? null, city: json.city ?? server.city };
      setServers(servers.map((s) => (s.id === id ? updated : s)));
      return updated;
    } catch {
      return server;
    }
  });

  ipcMain.handle('servers:add', async (_e, input: { name?: string; url?: string; content?: string }) => {
    const servers = getServers();
    const subs = getSubscriptions();
    let content = input.content ?? '';
    let sub: Subscription | null = null;
    let subscriptionId: string | null = null;

    if (input.url && isSubscriptionUrl(input.url)) {
      const id = stableId(input.url);
      subscriptionId = id;
      const fetched = await fetchSubscription(input.url);
      content = fetched.content;
      sub = {
        id,
        name: input.name || fetched.name,
        url: input.url,
        trafficUsed: fetched.userinfo.used,
        trafficTotal: fetched.userinfo.total,
        expiresAt: fetched.userinfo.expiresAt,
        updatedAt: Date.now(),
        lastError: null,
        serverCount: 0,
        enabled: true,
      };
    }

    const parsed = parseSubscription(content, subscriptionId);
    if (!parsed.servers.length) {
      throw new Error('В этом содержимом не нашлось ни одного сервера. Проверьте ссылку или формат.');
    }
    const existing = new Set(servers.map((s) => s.id));
    const added = parsed.servers.filter((s) => !existing.has(s.id));
    const merged = [...servers, ...added];
    setServers(merged);

    if (sub) {
      sub.serverCount = added.length;
      const rest = subs.filter((s) => s.id !== sub!.id);
      setSubscriptions([...rest, sub]);
    }
    return { added: added.length, subscription: sub, servers: merged };
  });

  ipcMain.handle('subs:list', (): Subscription[] => getSubscriptions());

  ipcMain.handle('subs:update', async (_e, id: string): Promise<Server[]> => {
    const subs = getSubscriptions();
    const sub = subs.find((s) => s.id === id);
    if (!sub?.url) return getServers();
    try {
      const fetched = await fetchSubscription(sub.url);
      const parsed = parseSubscription(fetched.content, sub.id);
      const servers = getServers();
      const favorites = new Map(servers.map((s) => [s.id, s.favorite]));
      const others = servers.filter((s) => s.subscriptionId !== sub.id);
      const refreshed = parsed.servers.map((s) => ({ ...s, favorite: favorites.get(s.id) ?? s.favorite }));
      const updated = setServers([...others, ...refreshed]);
      setSubscriptions(
        subs.map((s) =>
          s.id === id
            ? {
                ...s,
                trafficUsed: fetched.userinfo.used,
                trafficTotal: fetched.userinfo.total,
                expiresAt: fetched.userinfo.expiresAt,
                updatedAt: Date.now(),
                lastError: null,
                serverCount: refreshed.length,
              }
            : s,
        ),
      );
      return updated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubscriptions(subs.map((s) => (s.id === id ? { ...s, lastError: msg } : s)));
      throw e;
    }
  });

  ipcMain.handle('subs:updateAll', async (): Promise<Server[]> => {
    const subs = getSubscriptions();
    // обновляем последовательно: панели не любят параллельные запросы
    for (const sub of subs) {
      if (!sub.url) continue;
      try {
        const fetched = await fetchSubscription(sub.url);
        const parsed = parseSubscription(fetched.content, sub.id);
        const servers = getServers();
        const favorites = new Map(servers.map((s) => [s.id, s.favorite]));
        const others = servers.filter((s) => s.subscriptionId !== sub.id);
        const refreshed = parsed.servers.map((s) => ({ ...s, favorite: favorites.get(s.id) ?? s.favorite }));
        setServers([...others, ...refreshed]);
        const current = getSubscriptions();
        setSubscriptions(
          current.map((s) =>
            s.id === sub.id
              ? { ...s, updatedAt: Date.now(), lastError: null, serverCount: refreshed.length, trafficUsed: fetched.userinfo.used, trafficTotal: fetched.userinfo.total, expiresAt: fetched.userinfo.expiresAt }
              : s,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSubscriptions(getSubscriptions().map((s) => (s.id === sub.id ? { ...s, lastError: msg } : s)));
      }
    }
    return getServers();
  });

  ipcMain.handle('subs:setEnabled', (_e, id: string, enabled: boolean): Subscription[] =>
    setSubscriptions(getSubscriptions().map((s) => (s.id === id ? { ...s, enabled } : s))),
  );

  ipcMain.handle('subs:remove', (_e, id: string): Server[] => {
    setSubscriptions(getSubscriptions().filter((s) => s.id !== id));
    return setServers(getServers().filter((s) => s.subscriptionId !== id));
  });

  ipcMain.handle('conn:connect', async (_e, opts: { serverId?: string | null; auto?: boolean }): Promise<ConnectionState> => {
    if (core.getStatus() === 'running' && opts?.serverId) {
      await core.switchServer(opts.serverId);
      const state = core.getState();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state', state);
      return state;
    }
    return doConnect(opts?.serverId ?? null);
  });

  ipcMain.handle('conn:disconnect', (): Promise<ConnectionState> => doDisconnect());
  ipcMain.handle('conn:state', (): ConnectionState => core.getState());
  ipcMain.handle('conn:stats', () => {
    const st = core.getState();
    return { rx: st.rx, tx: st.tx, uptime: st.startedAt ? Date.now() - st.startedAt : 0 };
  });

  ipcMain.handle('diag:run', (): Promise<DiagReport> => runDiagnostics());
  ipcMain.handle('censor:run', (): Promise<CensorReport> => runCensorCheck());

  ipcMain.handle('update:check', (): Promise<UpdateInfo> => checkForUpdates());
  ipcMain.handle('update:download', async (): Promise<void> => {
    setProgressListener((p) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-progress', p);
    });
    await downloadUpdate();
  });
  ipcMain.handle('update:install', async (): Promise<void> => {
    quitting = true;
    await installUpdate();
  });

  ipcMain.handle('logs:get', (): LogLine[] => core.getLogs());

  ipcMain.handle('win:is-maximized', (): boolean => mainWindow?.isMaximized() ?? false);
  ipcMain.on('win:minimize', () => mainWindow?.minimize());
  ipcMain.on('win:toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow?.close());
  ipcMain.on('win:hide', () => mainWindow?.hide());

  ipcMain.on('app:open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.on('app:quit', () => {
    quitting = true;
    app.quit();
  });

  ipcMain.handle('app:restart-admin', async (): Promise<boolean> => {
    if (!isWin) return false;
    if (await isElevated()) return false;
    const exe = app.getPath('exe');
    const { execFile } = await import('node:child_process');
    // Передаём путь как литерал PowerShell; ждём подтверждения UAC, прежде чем закрыться.
    const literal = "'" + exe.replace(/'/g, "''") + "'";
    const launched = await new Promise<boolean>((resolve) => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `$ErrorActionPreference = 'Stop'; Start-Process -FilePath ${literal} -Verb RunAs`],
        { windowsHide: true }, (err) => resolve(!err));
    });
    if (launched) {
      quitting = true;
      setTimeout(() => app.quit(), 700);
    }
    return launched;
  });

  ipcMain.handle('app:export-backup', (): string => {
    const state = loadState();
    return JSON.stringify({ version: state.version, settings: state.settings, servers: state.servers, subscriptions: state.subscriptions }, null, 2);
  });

  ipcMain.handle('app:import-backup', (_e, json: string): boolean => {
    try {
      const data = JSON.parse(json) as { settings?: Settings; servers?: Server[]; subscriptions?: Subscription[] };
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.servers)) setServers(data.servers);
      if (Array.isArray(data.subscriptions)) setSubscriptions(data.subscriptions);
      return true;
    } catch {
      return false;
    }
  });
}

/* --------------------------- жизненный цикл --------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.shuzu.app');
    registerAppProtocol();
    registerIpc();
    loadState();
    createSplash();
    createMainWindow();
    createTray();

    // автоподключение
    const settings = getSettings();
    if (settings.autoConnect) {
      setTimeout(() => {
        void doConnect(null).catch(() => {});
      }, 2500);
    }

    // проверка обновлений при старте и раз в 6 часов
    if (settings.autoUpdateCheck) {
      const check = async () => {
        try {
          const info = await checkForUpdates();
          if (info.available) {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toast', {
              kind: 'info',
              title: `Доступно обновление ${info.version}`,
              body: 'Откройте «Обновления» в профиле, чтобы скачать.',
            });
            notify('Доступно обновление SHUZU', `Версия ${info.version} — откройте программу, чтобы обновить.`);
          }
        } catch {
          /* нет сети — не мешаем пользователю */
        }
      };
      setTimeout(() => void check(), 6000);
      setInterval(() => void check(), 6 * 3600_000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else mainWindow?.show();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    void core.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (getSettings().minimizeToTray) return;
      quitting = true;
      app.quit();
    }
  });

  // страховка от «висящего» ядра при аварийном завершении
  process.on('exit', () => {
    try {
      void core.stop();
    } catch {
      /* ignore */
    }
  });
}

// временный файл нужен для диагностики состояния (не содержит секретов)
process.on('uncaughtException', (err) => {
  try {
    writeFileSync(join(app.getPath('userData'), 'crash.log'), `${new Date().toISOString()}\n${err.stack ?? err.message}\n`, { flag: 'a' });
  } catch {
    /* ignore */
  }
  sendToast('error', 'Внутренняя ошибка', err.message);
});
