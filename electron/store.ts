/** Хранилище состояния: настройки, серверы, подписки. */
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Server, Settings, Subscription } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

export interface PersistedState {
  settings: Settings;
  servers: Server[];
  subscriptions: Subscription[];
  favorites: string[];
  version: number;
}

const STATE_VERSION = 1;

let cache: PersistedState | null = null;

function statePath(): string {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'state.json');
}

export function loadState(): PersistedState {
  if (cache) return cache;
  const file = statePath();
  let loaded: Partial<PersistedState> = {};
  if (existsSync(file)) {
    try {
      loaded = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedState>;
    } catch {
      // повреждённый файл — откладываем в сторону, чтобы не терять данные молча
      try {
        renameSync(file, `${file}.broken-${Date.now()}`);
      } catch {
        /* ignore */
      }
    }
  }
  cache = {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) },
    servers: Array.isArray(loaded.servers) ? loaded.servers : [],
    subscriptions: Array.isArray(loaded.subscriptions) ? loaded.subscriptions : [],
    favorites: Array.isArray(loaded.favorites) ? loaded.favorites : [],
  };
  // восстановим избранное даже если серверы пересозданы
  const fav = new Set(cache.favorites);
  cache.servers = cache.servers.map((s) => ({ ...s, favorite: s.favorite || fav.has(s.id) }));
  return cache;
}

export function saveState(patch: Partial<PersistedState>): PersistedState {
  const state = { ...loadState(), ...patch };
  state.favorites = state.servers.filter((s) => s.favorite).map((s) => s.id);
  cache = state;
  const file = statePath();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, file);
  return state;
}

export function getSettings(): Settings {
  return loadState().settings;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const state = loadState();
  const settings = { ...state.settings, ...patch };
  saveState({ settings });
  return settings;
}

export function getServers(): Server[] {
  return loadState().servers;
}

export function setServers(servers: Server[]): Server[] {
  saveState({ servers });
  return servers;
}

export function getSubscriptions(): Subscription[] {
  return loadState().subscriptions;
}

export function setSubscriptions(subscriptions: Subscription[]): Subscription[] {
  saveState({ subscriptions });
  return subscriptions;
}

/** Каталог ядра и логов. */
export function coreDir(): string {
  const dir = join(app.getPath('userData'), 'core');
  mkdirSync(dir, { recursive: true });
  return dir;
}
