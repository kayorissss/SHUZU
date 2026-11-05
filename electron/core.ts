/**
 * Управление ядром sing-box.
 *
 * Ядро лежит внутри программы (resources/core/<platform>/), запускается
 * отдельным процессом с сгенерированным конфигом, а общение идёт через
 * Clash API (статистика трафика, задержки, переключение сервера).
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, chmodSync, openSync, closeSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app } from 'electron';
import http from 'node:http';
import { buildSingboxConfig, outboundTag } from '../shared/singbox';
import type { ConnectionState, LogLine, Server, Settings } from '../shared/types';
import { coreDir, getSettings } from './store';
import { randomId } from '../shared/util';

export type CoreStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

interface CoreOptions {
  servers: Server[];
  serverId: string | null;
  mode: 'tun' | 'proxy';
}

const CLASH_PORT = 19090;

export class Core {
  private proc: ChildProcess | null = null;
  private status: CoreStatus = 'stopped';
  private logs: LogLine[] = [];
  private secret = randomId(24);
  private startedAt: number | null = null;
  private rx = 0;
  private tx = 0;
  private trafficAbort: (() => void) | null = null;
  private opts: CoreOptions | null = null;
  private lastError: string | null = null;
  private tags = new Map<string, string>();

  onLog: (line: LogLine) => void = () => {};
  onExit: (code: number | null) => void = () => {};
  onTraffic: (rx: number, tx: number) => void = () => {};

  /** Путь к исполняемому файлу ядра. */
  corePath(): string {
    const exe = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    const candidates = [
      join(process.resourcesPath ?? '', 'core', exe),
      join(process.resourcesPath ?? '', 'core', process.platform, exe),
      join(app.getAppPath(), 'resources', 'core', exe),
      join(app.getAppPath(), 'cores', process.platform, exe),
      join(dirname(process.execPath), 'core', exe),
    ];
    for (const c of candidates) {
      if (c && existsSync(c)) return c;
    }
    return candidates[0];
  }

  coreVersion(): string | null {
    try {
      const cfg = join(coreDir(), 'version.txt');
      if (existsSync(cfg)) return readFileSync(cfg, 'utf8').trim();
    } catch {
      /* ignore */
    }
    return null;
  }

  isReady(): boolean {
    return existsSync(this.corePath());
  }

  getStatus(): CoreStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLogs(): LogLine[] {
    return this.logs.slice(-800);
  }

  getState(): ConnectionState {
    const settings = getSettings();
    return {
      status:
        this.status === 'running'
          ? 'connected'
          : this.status === 'starting'
            ? 'connecting'
            : this.status === 'stopping'
              ? 'disconnecting'
              : this.status === 'error'
                ? 'error'
                : 'disconnected',
      serverId: this.opts?.serverId ?? null,
      auto: !this.opts?.serverId,
      mode: this.opts?.mode ?? settings.mode,
      startedAt: this.startedAt,
      error: this.lastError,
      rx: this.rx,
      tx: this.tx,
      localPort: this.opts?.mode === 'tun' ? null : settings.httpPort,
      exitIp: null,
      exitCountry: null,
    };
  }

  private log(level: LogLine['level'], msg: string) {
    const line: LogLine = { t: Date.now(), level, msg };
    this.logs.push(line);
    if (this.logs.length > 1200) this.logs.splice(0, 400);
    this.onLog(line);
  }

  private writeConfig(opts: CoreOptions): string {
    const settings: Settings = getSettings();
    const built = buildSingboxConfig({
      servers: opts.servers,
      selectedServerId: opts.serverId,
      mode: opts.mode,
      android: false,
      socksPort: settings.socksPort,
      httpPort: settings.httpPort,
      clashApiPort: CLASH_PORT,
      clashSecret: this.secret,
      dns: settings.dns,
      customDns: settings.customDns,
      bypassLocal: settings.bypassLocal,
      blockAds: settings.blockAds,
      logLevel: 'info',
      cachePath: join(coreDir(), 'cache.db'),
    });
    this.tags = new Map(Object.entries(built.tagsByServerId));
    const file = join(coreDir(), 'config.json');
    writeFileSync(file, JSON.stringify(built.config, null, 2), 'utf8');
    if (built.unsupportedIds.length) {
      this.log('warn', `Ядро не поддерживает ${built.unsupportedIds.length} сервер(ов): ${built.unsupportedIds.join(', ')}`);
    }
    return file;
  }

  /** Проверка конфига перед запуском — чтобы не падать «молча». */
  async checkConfig(configPath: string): Promise<boolean> {
    const bin = this.corePath();
    return new Promise((resolve) => {
      execFile(bin, ['check', '-c', configPath], { timeout: 20000 }, (err, stdout, stderr) => {
        if (err) {
          this.lastError = (stderr || stdout || err.message).slice(0, 600);
          this.log('error', `Проверка конфига не прошла: ${this.lastError}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async start(opts: CoreOptions): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      await this.stop();
    }
    this.opts = opts;
    this.lastError = null;
    this.rx = 0;
    this.tx = 0;
    this.status = 'starting';

    const bin = this.corePath();
    if (!existsSync(bin)) {
      this.status = 'error';
      this.lastError = 'Ядро не найдено в папке программы. Переустановите SHUZU.';
      this.log('error', this.lastError);
      throw new Error(this.lastError);
    }
    try {
      chmodSync(bin, 0o755);
    } catch {
      /* не критично на Windows */
    }

    this.ensureWintun(bin);
    const configPath = this.writeConfig(opts);
    const ok = await this.checkConfig(configPath);
    if (!ok) {
      this.status = 'error';
      throw new Error(this.lastError ?? 'Конфигурация ядра некорректна');
    }

    const logFile = join(coreDir(), 'core.log');
    let out: number | null = null;
    try {
      out = openSync(logFile, 'a');
    } catch {
      out = null;
    }

    this.log('info', `Запуск ядра: ${bin} (режим ${opts.mode})`);
    const child = spawn(bin, ['run', '-c', configPath, '-D', coreDir()], {
      cwd: coreDir(),
      stdio: ['ignore', out ?? 'pipe', out ?? 'pipe'],
      windowsHide: true,
      env: { ...process.env, ENABLE_DEPRECATED_LEGACY_DNS_SERVERS: 'true', ENABLE_DEPRECATED_OUTBOUND_DOMAIN_RESOLVER: 'true' },
    });
    if (out !== null) closeSync(out);
    this.proc = child;

    child.on('exit', (code) => {
      const wasRunning = this.status === 'running' || this.status === 'starting';
      this.status = wasRunning && code !== 0 ? 'error' : 'stopped';
      if (wasRunning && code !== 0) {
        this.lastError = `Ядро завершилось с кодом ${code}. Подробности — в журнале ядра.`;
        this.log('error', this.lastError);
      }
      this.startedAt = null;
      this.stopTraffic();
      this.onExit(code);
    });

    child.on('error', (err) => {
      this.status = 'error';
      this.lastError = err.message;
      this.log('error', `Не удалось запустить ядро: ${err.message}`);
    });

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => this.ingestLogs(chunk));
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => this.ingestLogs(chunk));
    }

    // ждём, пока Clash API ответит — это значит, что ядро реально поднялось
    const ready = await this.waitReady(15000);
    if (!ready) {
      const tail = this.logs.slice(-6).map((l) => l.msg).join(' | ');
      this.status = 'error';
      this.lastError =
        'Ядро не подняло туннель. ' +
        (this.lastError ??
          (tail || 'Проверьте права администратора и отсутствие других VPN-клиентов.'));
      this.log('error', this.lastError);
      await this.stop();
      throw new Error(this.lastError);
    }

    this.status = 'running';
    this.startedAt = Date.now();
    this.log('info', 'Ядро готово, туннель активен');
    this.startTraffic();
  }

  private ingestLogs(chunk: string) {
    for (const raw of chunk.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      let level: LogLine['level'] = 'info';
      if (/error|fatal/i.test(line)) level = 'error';
      else if (/warn/i.test(line)) level = 'warn';
      else if (/debug/i.test(line)) level = 'debug';
      // вырезаем служебную обвязку "time=... level=..."
      const msg = line.replace(/^[A-Z_]+\(\d+\)\s*/, '').replace(/\s+time="?[^"]+"?/g, '');
      this.log(level, msg.slice(0, 500));
      if (level === 'error') this.lastError = msg.slice(0, 400);
    }
  }

  private waitReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const tick = async () => {
        if (this.status === 'error' || !this.proc) return resolve(false);
        const ok = await this.apiGet('/version').then(() => true).catch(() => false);
        if (ok) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 250);
      };
      void tick();
    });
  }

  private apiGet(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { host: '127.0.0.1', port: CLASH_PORT, path, timeout: 4000, headers: { Authorization: `Bearer ${this.secret}` } },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  }

  private apiRequest(method: string, path: string, body?: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          host: '127.0.0.1',
          port: CLASH_PORT,
          path,
          method,
          timeout: 8000,
          headers: {
            Authorization: `Bearer ${this.secret}`,
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** Живой поток статистики: {down, up} в байтах/с. */
  private startTraffic() {
    this.stopTraffic();
    let closed = false;
    const req = http.get(
      { host: '127.0.0.1', port: CLASH_PORT, path: '/traffic', headers: { Authorization: `Bearer ${this.secret}` } },
      (res) => {
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const obj = JSON.parse(line) as { up?: number; down?: number };
              this.tx += obj.up ?? 0;
              this.rx += obj.down ?? 0;
              this.onTraffic(this.rx, this.tx);
            } catch {
              /* пропускаем нечитаемые кадры */
            }
          }
        });
        res.on('end', () => {
          if (!closed) setTimeout(() => this.status === 'running' && this.startTraffic(), 1200);
        });
      },
    );
    req.on('error', () => {
      if (!closed && this.status === 'running') setTimeout(() => this.status === 'running' && this.startTraffic(), 2000);
    });
    this.trafficAbort = () => {
      closed = true;
      req.destroy();
    };
  }

  private stopTraffic() {
    this.trafficAbort?.();
    this.trafficAbort = null;
  }

  /** Переключение сервера на лету (без перезапуска ядра). */
  async switchServer(serverId: string | null): Promise<void> {
    if (this.status !== 'running') return;
    const target = serverId ? this.tags.get(serverId) : 'auto';
    if (!target) throw new Error('Сервер не найден в конфигурации ядра');
    await this.apiRequest('PUT', '/proxies/proxy', { name: target });
    if (this.opts) this.opts.serverId = serverId;
    this.log('info', `Переключение на ${target}`);
  }

  /** Задержка через туннель для всех серверов (Clash API). */
  async delayAll(): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};
    const entries = [...this.tags.entries()];
    await Promise.all(
      entries.map(async ([serverId, tag]) => {
        try {
          const raw = await this.apiGet(`/proxies/${encodeURIComponent(tag)}/delay?timeout=4000&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`);
          const obj = JSON.parse(raw) as { delay?: number };
          result[serverId] = obj.delay ?? null;
        } catch {
          result[serverId] = null;
        }
      }),
    );
    return result;
  }

  async delayOne(serverId: string): Promise<number | null> {
    const tag = this.tags.get(serverId);
    if (!tag) return null;
    try {
      const raw = await this.apiGet(`/proxies/${encodeURIComponent(tag)}/delay?timeout=5000&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`);
      const obj = JSON.parse(raw) as { delay?: number };
      return obj.delay ?? null;
    } catch {
      return null;
    }
  }

  /**
   * sing-box ищет wintun.dll рядом с собой (и в рабочем каталоге) — на некоторых
   * сборках достаточно только второго, поэтому копируем драйвер куда нужно.
   */
  private ensureWintun(bin: string) {
    if (process.platform !== 'win32') return;
    try {
      const src = join(bin, '..', 'wintun.dll');
      if (!existsSync(src)) {
        this.log('warn', 'wintun.dll не найден — режим TUN может не запуститься');
        return;
      }
      const dst = join(coreDir(), 'wintun.dll');
      if (!existsSync(dst)) {
        copyFileSync(src, dst);
        this.log('info', 'wintun.dll скопирован в рабочий каталог ядра');
      }
    } catch (e) {
      this.log('warn', `Не удалось подготовить wintun.dll: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async stop(): Promise<void> {
    this.stopTraffic();
    if (!this.proc) {
      this.status = 'stopped';
      this.startedAt = null;
      return;
    }
    this.status = 'stopping';
    const child = this.proc;
    this.proc = null;
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (process.platform === 'win32' && child.pid) {
            execFile('taskkill', ['/pid', String(child.pid), '/f', '/t'], () => resolve());
          } else {
            child.kill('SIGKILL');
            resolve();
          }
        } catch {
          resolve();
        }
      }, 2500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.status = 'stopped';
    this.startedAt = null;
    this.rx = 0;
    this.tx = 0;
    this.log('info', 'Ядро остановлено');
  }

  tagFor(serverId: string): string | undefined {
    return this.tags.get(serverId) ?? outboundTag(serverId);
  }

  /** Очистка временных файлов ядра. */
  cleanupTmp() {
    try {
      const f = join(coreDir(), 'config.json.tmp');
      if (existsSync(f)) unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

export const core = new Core();
