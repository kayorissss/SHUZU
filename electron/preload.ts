/** Мост renderer ↔ main. Renderer не имеет доступа к Node напрямую. */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppInfo,
  CensorReport,
  ConnectionState,
  DiagReport,
  LogLine,
  Server,
  Settings,
  ShuzuApi,
  Subscription,
  UpdateInfo,
  UpdateProgress,
} from '../shared/types';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: ShuzuApi = {
  info: () => ipcRenderer.invoke('info') as Promise<AppInfo>,
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
    set: (patch) => ipcRenderer.invoke('settings:set', patch) as Promise<Settings>,
  },
  servers: {
    list: () => ipcRenderer.invoke('servers:list') as Promise<Server[]>,
    ping: (id) => ipcRenderer.invoke('servers:ping', id) as Promise<Server>,
    pingMany: (ids) => ipcRenderer.invoke('servers:pingMany', ids) as Promise<Server[]>,
    pingAll: () => ipcRenderer.invoke('servers:pingAll') as Promise<Server[]>,
    toggleFavorite: (id) => ipcRenderer.invoke('servers:favorite', id) as Promise<Server[]>,
    remove: (id) => ipcRenderer.invoke('servers:remove', id) as Promise<Server[]>,
    add: (sub) => ipcRenderer.invoke('servers:add', sub) as Promise<{ added: number; subscription: Subscription | null; servers: Server[] }>,
    geo: (id) => ipcRenderer.invoke('servers:geo', id) as Promise<Server>,
  },
  subscriptions: {
    list: () => ipcRenderer.invoke('subs:list') as Promise<Subscription[]>,
    update: (id) => ipcRenderer.invoke('subs:update', id) as Promise<Server[]>,
    updateAll: () => ipcRenderer.invoke('subs:updateAll') as Promise<Server[]>,
    setEnabled: (id, enabled) => ipcRenderer.invoke('subs:setEnabled', id, enabled) as Promise<Subscription[]>,
    remove: (id) => ipcRenderer.invoke('subs:remove', id) as Promise<Server[]>,
  },
  connect: (opts) => ipcRenderer.invoke('conn:connect', opts) as Promise<ConnectionState>,
  disconnect: () => ipcRenderer.invoke('conn:disconnect') as Promise<ConnectionState>,
  state: () => ipcRenderer.invoke('conn:state') as Promise<ConnectionState>,
  onState: (cb) => on<ConnectionState>('state', cb),
  stats: () => ipcRenderer.invoke('conn:stats') as Promise<{ rx: number; tx: number; uptime: number }>,
  diagnostics: {
    run: () => ipcRenderer.invoke('diag:run') as Promise<DiagReport>,
  },
  censor: {
    run: () => ipcRenderer.invoke('censor:run') as Promise<CensorReport>,
  },
  updates: {
    check: () => ipcRenderer.invoke('update:check') as Promise<UpdateInfo>,
    download: () => ipcRenderer.invoke('update:download') as Promise<void>,
    install: () => ipcRenderer.invoke('update:install') as Promise<void>,
    onProgress: (cb) => on<UpdateProgress>('update-progress', cb),
  },
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    hide: () => ipcRenderer.send('win:hide'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized') as Promise<boolean>,
    onMaximizeChange: (cb) => on<boolean>('win:maximized', cb),
  },
  app: {
    openExternal: (url) => ipcRenderer.send('app:open-external', url),
    quit: () => ipcRenderer.send('app:quit'),
    restartAsAdmin: () => ipcRenderer.invoke('app:restart-admin') as Promise<boolean>,
    exportBackup: () => ipcRenderer.invoke('app:export-backup') as Promise<string | null>,
    importBackup: (json) => ipcRenderer.invoke('app:import-backup', json) as Promise<boolean>,
  },
  logs: () => ipcRenderer.invoke('logs:get') as Promise<LogLine[]>,
  onLog: (cb) => on<LogLine>('log', cb),
  onToast: (cb) => on<{ kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }>('toast', cb),
};

contextBridge.exposeInMainWorld('shuzu', api);
