/** Глобальное состояние приложения (zustand). */
import { create } from 'zustand';
import type {
  AppInfo,
  CensorReport,
  ConnectionState,
  DiagReport,
  Server,
  Settings,
  Subscription,
  UpdateInfo,
  UpdateProgress,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { getEngine, isDesktop } from './engine';

export type Screen = 'home' | 'servers' | 'profile' | 'settings' | 'diagnostics' | 'censor' | 'subscriptions' | 'logs';

export type ModalName =
  | 'addSub'
  | 'manualAdd'
  | 'qrScan'
  | 'serverDetails'
  | 'update'
  | 'onboarding'
  | 'confirm'
  | 'modePicker'
  | null;

export interface ModalState {
  name: ModalName;
  serverId?: string;
  title?: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void | Promise<void>;
}

export interface Toast {
  id: string;
  kind: 'info' | 'warn' | 'error' | 'success';
  title: string;
  body?: string;
}

interface State {
  booted: boolean;
  splashVisible: boolean;
  info: AppInfo;
  settings: Settings;
  servers: Server[];
  subs: Subscription[];
  conn: ConnectionState;
  screen: Screen;
  modal: ModalState | null;
  toasts: Toast[];
  pinging: boolean;
  pingingIds: string[];
  speed: { rx: number; tx: number };
  uptime: number;
  update: UpdateInfo | null;
  updateProgress: UpdateProgress | null;
  updateChecking: boolean;
  diag: DiagReport | null;
  diagRunning: boolean;
  censor: CensorReport | null;
  censorRunning: boolean;
  search: string;
  filterFavorites: boolean;
  hideDemoNotice: boolean;

  init: () => Promise<void>;
  finishSplash: () => void;
  go: (screen: Screen) => void;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  connect: (opts?: { serverId?: string | null; auto?: boolean }) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  pingServer: (id: string) => Promise<void>;
  pingAll: () => Promise<void>;
  selectServer: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  addSubscription: (input: { name?: string; url?: string; content?: string }) => Promise<{ added: number }>;
  updateSubscriptions: (id?: string) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  toggleSubscription: (id: string, enabled: boolean) => Promise<void>;
  runDiagnostics: () => Promise<void>;
  runCensor: () => Promise<void>;
  checkUpdate: (silent?: boolean) => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  setSearch: (s: string) => void;
  setFilterFavorites: (v: boolean) => void;
}

const emptyConn: ConnectionState = {
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

const emptyInfo: AppInfo = {
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

let statsTimer: ReturnType<typeof setInterval> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let initStarted = false;

export const useApp = create<State>((set, get) => ({
  booted: false,
  splashVisible: true,
  info: emptyInfo,
  settings: DEFAULT_SETTINGS,
  servers: [],
  subs: [],
  conn: emptyConn,
  screen: 'home',
  modal: null,
  toasts: [],
  pinging: false,
  pingingIds: [],
  speed: { rx: 0, tx: 0 },
  uptime: 0,
  update: null,
  updateProgress: null,
  updateChecking: false,
  diag: null,
  diagRunning: false,
  censor: null,
  censorRunning: false,
  search: '',
  filterFavorites: false,
  hideDemoNotice: localStorage.getItem('shuzu.demoNotice') === 'hidden',

  async init() {
    if (initStarted) return;
    initStarted = true;
    const api = getEngine();
    try {
      const [info, settings, servers, subs, conn] = await Promise.all([
        api.info(),
        api.settings.get(),
        api.servers.list(),
        api.subscriptions.list(),
        api.state(),
      ]);
      set({ info, settings, servers, subs, conn, booted: true });

      api.onState((s) => {
        set({ conn: s });
        if (s.status === 'connected' && s.startedAt) startStats(api, set);
        if (s.status === 'disconnected') stopStats();
      });
      api.onToast((t) => get().toast(t));

      if (settings.autoUpdateCheck && isDesktop) {
        void get().checkUpdate(true);
      }
      if (settings.autoPing && servers.length && servers.every((s) => s.ping == null)) {
        void get().pingAll();
      }
      startPingLoop(get, settings);
    } catch (e) {
      console.error('init failed', e);
      set({ booted: true });
      get().toast({ kind: 'error', title: 'Ошибка запуска', body: e instanceof Error ? e.message : String(e) });
    }
  },

  finishSplash() {
    set({ splashVisible: false });
  },

  go(screen) {
    set({ screen });
  },

  openModal(modal) {
    set({ modal });
  },

  closeModal() {
    set({ modal: null });
  },

  toast(t) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 7000 : 4200);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },

  async saveSettings(patch) {
    const api = getEngine();
    const prev = get().settings;
    const optimistic = { ...prev, ...patch };
    set({ settings: optimistic });
    try {
      const saved = await api.settings.set(patch);
      set({ settings: saved });
      if (patch.pingIntervalSec !== undefined || patch.autoPing !== undefined) {
        startPingLoop(get, saved);
      }
    } catch (e) {
      set({ settings: prev });
      get().toast({ kind: 'error', title: 'Не удалось сохранить настройку', body: String(e) });
    }
  },

  async connect(opts) {
    const api = getEngine();
    const { servers, settings, conn } = get();
    if (conn.status === 'connecting') return;
    const target = opts?.serverId ?? (opts?.auto ? null : conn.serverId);
    if (!servers.length) {
      get().toast({ kind: 'warn', title: 'Нет серверов', body: 'Добавьте подписку, чтобы подключиться.' });
      get().go('subscriptions');
      return;
    }
    set({ conn: { ...conn, status: 'connecting', error: null } });
    try {
      const s = await api.connect({ serverId: target, auto: opts?.auto ?? !target });
      set({ conn: s, speed: { rx: 0, tx: 0 } });
      if (settings.autoCensorCheck && !get().censor) {
        setTimeout(() => void get().runCensor(), 1500);
      }
    } catch (e) {
      set({ conn: { ...get().conn, status: 'error', error: e instanceof Error ? e.message : String(e) } });
      get().toast({ kind: 'error', title: 'Не удалось подключиться', body: e instanceof Error ? e.message : String(e) });
    }
  },

  async disconnect() {
    const api = getEngine();
    set({ conn: { ...get().conn, status: 'disconnecting' } });
    try {
      const s = await api.disconnect();
      set({ conn: s, speed: { rx: 0, tx: 0 }, uptime: 0 });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка отключения', body: String(e) });
    }
  },

  async toggleConnection() {
    const { conn } = get();
    if (conn.status === 'connected') await get().disconnect();
    else if (conn.status === 'disconnected' || conn.status === 'error') await get().connect({ serverId: conn.serverId, auto: conn.auto });
    else if (conn.status === 'connecting') await get().disconnect();
  },

  async pingServer(id) {
    const api = getEngine();
    set({ pingingIds: [...get().pingingIds, id] });
    try {
      const s = await api.servers.ping(id);
      set({ servers: get().servers.map((x) => (x.id === id ? s : x)) });
    } catch {
      set({ servers: get().servers.map((x) => (x.id === id ? { ...x, dead: true, ping: null } : x)) });
    } finally {
      set({ pingingIds: get().pingingIds.filter((x) => x !== id) });
    }
  },

  async pingAll() {
    if (get().pinging) return;
    const api = getEngine();
    set({ pinging: true, pingingIds: get().servers.map((s) => s.id) });
    try {
      const servers = await api.servers.pingAll();
      set({ servers });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка проверки пинга', body: String(e) });
    } finally {
      set({ pinging: false, pingingIds: [] });
    }
  },

  async selectServer(id) {
    const { conn } = get();
    const server = get().servers.find((s) => s.id === id);
    if (!server) return;
    if (conn.status === 'connected') {
      // на лету — ядро переключает outbound через Clash API
      try {
        const api = getEngine();
        const next = await api.connect({ serverId: id, auto: false });
        set({ conn: next });
        get().toast({ kind: 'success', title: 'Сервер переключён', body: server.cleanName });
      } catch {
        get().toast({ kind: 'error', title: 'Не удалось переключить сервер' });
      }
    } else {
      set({ conn: { ...conn, serverId: id, auto: false } });
      await get().connect({ serverId: id, auto: false });
    }
  },

  async toggleFavorite(id) {
    try {
      const servers = await getEngine().servers.toggleFavorite(id);
      set({ servers });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка', body: String(e) });
    }
  },

  async removeServer(id) {
    try {
      const servers = await getEngine().servers.remove(id);
      set({ servers, modal: null });
      get().toast({ kind: 'success', title: 'Сервер удалён' });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка удаления', body: String(e) });
    }
  },

  async addSubscription(input) {
    const api = getEngine();
    const res = await api.servers.add(input);
    const [servers, subs] = await Promise.all([api.servers.list(), api.subscriptions.list()]);
    set({ servers, subs });
    return { added: res.added };
  },

  async updateSubscriptions(id) {
    const api = getEngine();
    try {
      if (id) await api.subscriptions.update(id);
      else await api.subscriptions.updateAll();
      const [servers, subs] = await Promise.all([api.servers.list(), api.subscriptions.list()]);
      set({ servers, subs });
      get().toast({ kind: 'success', title: 'Подписки обновлены' });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Не удалось обновить подписку', body: String(e) });
    }
  },

  async removeSubscription(id) {
    try {
      const servers = await getEngine().subscriptions.remove(id);
      const subs = await getEngine().subscriptions.list();
      set({ servers, subs });
      get().toast({ kind: 'success', title: 'Подписка удалена' });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка', body: String(e) });
    }
  },

  async toggleSubscription(id, enabled) {
    try {
      const subs = await getEngine().subscriptions.setEnabled(id, enabled);
      set({ subs });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Ошибка', body: String(e) });
    }
  },

  async runDiagnostics() {
    if (get().diagRunning) return;
    set({ diagRunning: true, diag: null });
    try {
      const report = await getEngine().diagnostics.run();
      set({ diag: report });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Диагностика не удалась', body: String(e) });
    } finally {
      set({ diagRunning: false });
    }
  },

  async runCensor() {
    if (get().censorRunning) return;
    set({ censorRunning: true });
    try {
      const report = await getEngine().censor.run();
      set({ censor: report });
    } catch (e) {
      get().toast({ kind: 'error', title: 'Проверка не удалась', body: String(e) });
    } finally {
      set({ censorRunning: false });
    }
  },

  async checkUpdate(silent) {
    if (get().updateChecking) return;
    set({ updateChecking: true });
    try {
      const update = await getEngine().updates.check();
      set({ update });
      if (update.available && !silent) {
        get().openModal({ name: 'update' });
      }
      if (update.available && silent) {
        get().toast({ kind: 'info', title: `Доступно обновление ${update.version}`, body: 'Откройте профиль, чтобы скачать.' });
      }
    } catch (e) {
      if (!silent) get().toast({ kind: 'error', title: 'Не удалось проверить обновления', body: String(e) });
    } finally {
      set({ updateChecking: false });
    }
  },

  async downloadUpdate() {
    const api = getEngine();
    set({ updateProgress: { stage: 'downloading', percent: 0, message: 'Начинаем загрузку' } });
    const unsub = api.updates.onProgress((p) => set({ updateProgress: p }));
    try {
      await api.updates.download();
      set({ updateProgress: { stage: 'ready', percent: 100, message: 'Готово к установке' } });
    } catch (e) {
      set({ updateProgress: { stage: 'error', percent: 0, message: String(e) } });
      get().toast({ kind: 'error', title: 'Ошибка загрузки обновления', body: String(e) });
    } finally {
      unsub();
    }
  },

  async installUpdate() {
    set({ updateProgress: { stage: 'installing', percent: 100, message: 'Устанавливаем…' } });
    await getEngine().updates.install();
  },

  setSearch(search) {
    set({ search });
  },

  setFilterFavorites(filterFavorites) {
    set({ filterFavorites });
  },
}));

function startStats(api: ReturnType<typeof getEngine>, set: (partial: Partial<State>) => void) {
  stopStats();
  let lastRx = 0;
  let lastTx = 0;
  let lastT = Date.now();
  statsTimer = setInterval(async () => {
    try {
      const s = await api.stats();
      const now = Date.now();
      const dt = (now - lastT) / 1000;
      const rxSpeed = Math.max(0, (s.rx - lastRx) / dt);
      const txSpeed = Math.max(0, (s.tx - lastTx) / dt);
      lastRx = s.rx;
      lastTx = s.tx;
      lastT = now;
      set({
        speed: { rx: rxSpeed, tx: txSpeed },
        uptime: s.uptime,
        conn: { ...(useApp.getState().conn as ConnectionState), rx: s.rx, tx: s.tx },
      });
    } catch {
      /* игнорируем сбои опроса */
    }
  }, 1000);
}

function stopStats() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
}

function startPingLoop(get: () => State, settings: Settings) {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  if (!settings.autoPing || !settings.pingIntervalSec) return;
  const ms = Math.max(15, settings.pingIntervalSec) * 1000;
  pingTimer = setInterval(() => {
    const st = get();
    if (st.conn.status === 'disconnected' && !st.pinging && st.servers.length) {
      void st.pingAll();
    }
  }, ms);
}
