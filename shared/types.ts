/**
 * SHUZU — общие типы между renderer (UI), main (Electron) и Android-слоем.
 * Всё, что описывает данные приложения, живёт здесь, чтобы не расползалось.
 */

export type Protocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'shadowsocksr'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'socks'
  | 'http'
  | 'unknown';

export type Transport =
  | 'tcp'
  | 'ws'
  | 'grpc'
  | 'http'
  | 'h2'
  | 'quic'
  | 'httpupgrade'
  | 'xhttp'
  | 'kcp'
  | 'none';

/** Один сервер (outbound), полученный из подписки или добавленный вручную. */
export interface Server {
  id: string;
  /** Отображаемое имя из подписки (может быть "🇩🇪 Frankfurt | 1.2x"). */
  name: string;
  /** Имя без эмодзи/служебных суффиксов — для списков. */
  cleanName: string;
  protocol: Protocol;
  host: string;
  port: number;
  /** ISO-3166-1 alpha-2, вычисленный из имени/флага/геолокации. */
  country: string | null;
  /** Город, если удалось определить. */
  city: string | null;
  favorite: boolean;
  /** id подписки-источника, null если добавлен вручную. */
  subscriptionId: string | null;
  /** Полный исходный URI (vless://..., vmess://..., и т.д.). */
  uri: string;
  /** Разобранные параметры протокола — используются генератором конфига. */
  params: ServerParams;
  /** Последний измеренный пинг в мс (TCP/TLS-хендшейк до хоста). */
  ping: number | null;
  /** Пинг через туннель, измеряется после подключения. */
  tunnelPing: number | null;
  /** Джиттер, мс. */
  jitter: number | null;
  /** Потери при последней серии пингов, 0..1. */
  loss: number | null;
  /** Момент последнего замера (unix ms). */
  pingedAt: number | null;
  /** Недоступен (не резолвится/не коннектится) — помечается автоматически. */
  dead: boolean;
}

export interface ServerParams {
  /** vless: uuid; vmess: uuid; trojan/ss: пароль. */
  id?: string;
  password?: string;
  security?: string;
  encryption?: string;
  flow?: string;
  sni?: string;
  alpn?: string[];
  fingerprint?: string;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  transport: Transport;
  path?: string;
  host?: string;
  serviceName?: string;
  headerType?: string;
  /** shadowsocks */
  method?: string;
  plugin?: string;
  pluginOpts?: string;
  /** hysteria2 / tuic */
  obfs?: string;
  obfsPassword?: string;
  /** wireguard */
  privateKey?: string;
  peerPublicKey?: string;
  presharedKey?: string;
  mtu?: number;
  reserved?: number[];
  /** служебное: какие поля подсветить в деталях */
  extra?: Record<string, string>;
}

export interface Subscription {
  id: string;
  name: string;
  url: string | null;
  /** Сколько трафика осталось по заголовку subscription-userinfo. */
  trafficUsed: number | null;
  trafficTotal: number | null;
  expiresAt: number | null;
  updatedAt: number;
  lastError: string | null;
  serverCount: number;
  /** Показывать серверы подписки в общем списке. */
  enabled: boolean;
}

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

export type ConnectionMode = 'tun' | 'proxy';

export interface ConnectionState {
  status: ConnStatus;
  serverId: string | null;
  /** auto = "Fastest server" */
  auto: boolean;
  mode: ConnectionMode;
  startedAt: number | null;
  error: string | null;
  /** rx/tx в байтах с момента подключения */
  rx: number;
  tx: number;
  /** Внутренний SOCKS/HTTP порт ядра. */
  localPort: number | null;
  /** Внешний IP после подключения (проверяется автоматически). */
  exitIp: string | null;
  exitCountry: string | null;
}

export interface Settings {
  language: 'ru' | 'en';
  theme: 'dark' | 'graphite' | 'light';
  accent: 'mint' | 'ice' | 'violet' | 'amber';
  mode: ConnectionMode;
  autoConnect: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  autoSelectFastest: boolean;
  autoUpdateCheck: boolean;
  /** Блокировать трафик при обрыве туннеля (kill switch). */
  killSwitch: boolean;
  /** Обход российских сайтов напрямую (geoip-ru / geosite-ru). */
  bypassLocal: boolean;
  blockAds: boolean;
  /** DNS через туннель или системный. */
  dns: 'tunnel' | 'system' | 'custom';
  customDns: string;
  /** Скрывать окно вместо закрытия. */
  minimizeToTray: boolean;
  notifications: boolean;
  /** Показывать анимацию карты. */
  mapAnimation: boolean;
  /** Автоматически проверять пинг всех серверов при открытии списка. */
  autoPing: boolean;
  /** Сколько секунд между авто-проверками пинга (0 = выкл). */
  pingIntervalSec: number;
  /** Периодический автоперевыбор лучшего сервера. */
  autoSwitch: boolean;
  /** Внутренние порты ядра. */
  socksPort: number;
  httpPort: number;
  /** Режим "невидимки": не показывать уведомления о подключении. */
  quietMode: boolean;
  /** Автоопределение глушилок при старте. */
  autoCensorCheck: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'ru',
  theme: 'dark',
  accent: 'mint',
  mode: 'tun',
  autoConnect: false,
  launchAtLogin: false,
  startMinimized: false,
  autoSelectFastest: true,
  autoUpdateCheck: true,
  killSwitch: false,
  bypassLocal: true,
  blockAds: false,
  dns: 'tunnel',
  customDns: '1.1.1.1',
  minimizeToTray: true,
  notifications: true,
  mapAnimation: true,
  autoPing: true,
  pingIntervalSec: 60,
  autoSwitch: false,
  socksPort: 10808,
  httpPort: 10809,
  quietMode: false,
  autoCensorCheck: true,
};

export interface AppInfo {
  version: string;
  platform: 'win32' | 'darwin' | 'linux' | 'android' | 'web';
  arch: string;
  coreVersion: string | null;
  /** Ядро найдено и исполняемо. */
  coreReady: boolean;
  isAdmin: boolean;
  packaged: boolean;
  repo: string;
  demo: boolean;
}

export interface TrafficPoint {
  t: number;
  rx: number;
  tx: number;
}

export type DiagStatus = 'ok' | 'warn' | 'fail' | 'info' | 'running';

export interface DiagCheck {
  id: string;
  title: string;
  status: DiagStatus;
  detail: string;
  /** Что делать, если проблема. */
  fix?: string;
  /** Вес в общем скоре (0 = не влияет). */
  weight?: number;
  group: 'system' | 'network' | 'core' | 'dns' | 'security';
}

export interface DiagReport {
  createdAt: number;
  score: number;
  checks: DiagCheck[];
  summary: string;
  verdict: 'healthy' | 'degraded' | 'blocked';
}

export interface CensorProbeResult {
  id: string;
  label: string;
  group: 'local' | 'global' | 'messenger' | 'cloud' | 'media';
  /** Ресурс доступен. */
  ok: boolean;
  /** Время ответа, мс. */
  ms: number | null;
  /** Как именно проверяли: dns / tcp / tls / http. */
  via: 'dns' | 'tcp' | 'tls' | 'http';
  error?: string;
  /** Признак подмены/обрыва (DPI). */
  suspicious?: boolean;
}

export interface CensorReport {
  createdAt: number;
  probes: CensorProbeResult[];
  /** 0..100: насколько вероятно, что трафик фильтруется. */
  dpiScore: number;
  verdict: 'open' | 'partial' | 'filtered' | 'unknown';
  summary: string;
  /** Чего именно не хватает: "global" | "local" | ... */
  blockedGroups: string[];
}

export interface UpdateInfo {
  available: boolean;
  version: string;
  currentVersion: string;
  notes: string;
  url: string;
  /** Прямая ссылка на ассет под текущую платформу. */
  assetUrl: string | null;
  assetName: string | null;
  size: number | null;
  publishedAt: string | null;
  mandatory: boolean;
}

export interface UpdateProgress {
  stage: 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';
  percent: number;
  message: string;
}

export interface LogLine {
  t: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}

/** IPC-контракт между renderer и main. */
export interface ShuzuApi {
  info(): Promise<AppInfo>;
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  servers: {
    list(): Promise<Server[]>;
    ping(id: string): Promise<Server>;
    pingMany(ids: string[]): Promise<Server[]>;
    pingAll(): Promise<Server[]>;
    toggleFavorite(id: string): Promise<Server[]>;
    remove(id: string): Promise<Server[]>;
    add(sub: { name?: string; url?: string; content?: string }): Promise<{ added: number; subscription: Subscription | null; servers: Server[] }>;
    geo(id: string): Promise<Server>;
  };
  subscriptions: {
    list(): Promise<Subscription[]>;
    update(id: string): Promise<Server[]>;
    updateAll(): Promise<Server[]>;
    setEnabled(id: string, enabled: boolean): Promise<Subscription[]>;
    remove(id: string): Promise<Server[]>;
  };
  connect(opts: { serverId?: string | null; auto?: boolean }): Promise<ConnectionState>;
  disconnect(): Promise<ConnectionState>;
  state(): Promise<ConnectionState>;
  onState(cb: (s: ConnectionState) => void): () => void;
  stats(): Promise<{ rx: number; tx: number; uptime: number }>;
  diagnostics: {
    run(): Promise<DiagReport>;
  };
  censor: {
    run(): Promise<CensorReport>;
  };
  updates: {
    check(): Promise<UpdateInfo>;
    download(): Promise<void>;
    install(): Promise<void>;
    onProgress(cb: (p: UpdateProgress) => void): () => void;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    hide(): void;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (v: boolean) => void): () => void;
  };
  app: {
    openExternal(url: string): void;
    quit(): void;
    restartAsAdmin(): Promise<boolean>;
    exportBackup(): Promise<string | null>;
    importBackup(json: string): Promise<boolean>;
  };
  logs(): Promise<LogLine[]>;
  onLog(cb: (l: LogLine) => void): () => void;
  onToast(cb: (t: { kind: 'info' | 'warn' | 'error' | 'success'; title: string; body?: string }) => void): () => void;
}
