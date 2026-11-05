/**
 * Автообновления через GitHub Releases.
 * Проверка версии → плашка в интерфейсе → скачивание внутри программы → установка.
 */
import { app, shell } from 'electron';
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { UpdateInfo, UpdateProgress } from '../shared/types';

export const REPO = process.env.SHUZU_REPO || 'kayorissss/SHUZU';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((x) => parseInt(x, 10))
    .map((x) => (Number.isFinite(x) ? x : 0));
}

export function isNewer(remote: string, current: string): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function assetForPlatform(assets: ReleaseAsset[]): ReleaseAsset | null {
  const platform = process.platform;
  const arch = process.arch;
  const candidates = assets.filter((a) => {
    const n = a.name.toLowerCase();
    if (platform === 'win32') return n.endsWith('.exe') && !n.includes('uninstall');
    if (platform === 'darwin') return n.endsWith('.dmg') || (n.endsWith('.zip') && n.includes('mac'));
    return n.endsWith('.appimage') || n.endsWith('.deb');
  });
  if (!candidates.length) return null;
  // предпочитаем совпадение по архитектуре и установщик
  const archMatch = candidates.find((a) => a.name.toLowerCase().includes(arch)) ?? candidates[0];
  const installer = candidates.find((a) => /setup|install/i.test(a.name));
  return installer ?? archMatch;
}

let currentInfo: UpdateInfo | null = null;
let downloadedPath: string | null = null;
let onProgress: (p: UpdateProgress) => void = () => {};

export function setProgressListener(cb: (p: UpdateProgress) => void) {
  onProgress = cb;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion();
  const info: UpdateInfo = {
    available: false,
    version: current,
    currentVersion: current,
    notes: '',
    url: `https://github.com/${REPO}/releases`,
    assetUrl: null,
    assetName: null,
    size: null,
    publishedAt: null,
    mandatory: false,
  };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'SHUZU-updater', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
    const release = (await res.json()) as Release;
    const version = release.tag_name.replace(/^v/i, '');
    const asset = assetForPlatform(release.assets ?? []);
    info.version = version;
    info.notes = release.body ?? '';
    info.publishedAt = release.published_at;
    info.url = release.html_url;
    info.available = isNewer(version, current);
    info.assetUrl = asset?.browser_download_url ?? null;
    info.assetName = asset?.name ?? null;
    info.size = asset?.size ?? null;
    info.mandatory = /\b(mandatory|critical)\b/i.test(release.body ?? '');
  } catch (e) {
    info.notes = e instanceof Error ? e.message : String(e);
  }
  currentInfo = info;
  return info;
}

export async function downloadUpdate(): Promise<string> {
  const info = currentInfo ?? (await checkForUpdates());
  if (!info.available || !info.assetUrl) throw new Error('Обновление недоступно');

  const dir = join(app.getPath('temp'), 'shuzu-update');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, info.assetName ?? 'shuzu-update.exe');
  if (existsSync(file)) {
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(info.assetUrl, {
    headers: { 'User-Agent': 'SHUZU-updater' },
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!res.ok || !res.body) throw new Error(`Не удалось скачать: HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length') ?? info.size ?? 0);
  let received = 0;
  const out = createWriteStream(file);

  onProgress({ stage: 'downloading', percent: 0, message: 'Загрузка обновления…' });

  await new Promise<void>((resolve, reject) => {
    const reader = res.body!.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        out.end(() => resolve());
        return;
      }
      received += value.byteLength;
      const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
      onProgress({ stage: 'downloading', percent, message: `Загрузка ${percent}% · ${(received / 1024 / 1024).toFixed(1)} МБ` });
      if (!out.write(Buffer.from(value))) {
        await new Promise<void>((r) => out.once('drain', () => r()));
      }
      void pump();
    };
    pump().catch((e) => {
      out.destroy();
      reject(e);
    });
  });

  onProgress({ stage: 'verifying', percent: 99, message: 'Проверка файла…' });
  const size = existsSync(file) ? statSync(file).size : 0;
  if (total && Math.abs(size - total) > 1024 * 16) {
    throw new Error('Размер загруженного файла не совпадает с ожидаемым');
  }

  downloadedPath = file;
  onProgress({ stage: 'ready', percent: 100, message: 'Готово к установке' });
  return file;
}

export async function installUpdate(): Promise<void> {
  const file = downloadedPath;
  if (!file || !existsSync(file)) throw new Error('Файл обновления не найден');

  if (process.platform === 'win32') {
    // тихая установка NSIS-инсталлятора; программа закроется сама
    const child = spawn(file, ['/S', '--updated'], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.quit(), 800);
    return;
  }
  if (process.platform === 'darwin') {
    await shell.openPath(file);
    setTimeout(() => app.quit(), 800);
    return;
  }
  await shell.openPath(file);
}
