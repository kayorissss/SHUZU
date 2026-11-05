/**
 * Списки доменов для маршрутизации и проверок.
 *
 * RU_DIRECT_DOMAINS — «белый список» локальных сервисов: если включён обход
 * локальных сайтов, они идут напрямую, минуя туннель (быстрее + меньше
 * подозрений у банков, которые блокируют зарубежные IP).
 */

export const RU_DIRECT_DOMAINS: string[] = [
  // государство и банки
  'gosuslugi.ru',
  'nalog.gov.ru',
  'nalog.ru',
  'mos.ru',
  'pfr.gov.ru',
  'sfr.gov.ru',
  'fssp.gov.ru',
  'gibdd.ru',
  'sberbank.ru',
  'sber.ru',
  'online.sberbank.ru',
  'tbank.ru',
  'tinkoff.ru',
  'vtb.ru',
  'alfabank.ru',
  'gazprombank.ru',
  'raiffeisen.ru',
  'psbank.ru',
  'mkb.ru',
  'mirconnect.ru',
  'nspk.ru',
  // маркетплейсы и сервисы
  'ozon.ru',
  'wildberries.ru',
  'wildberries.by',
  'avito.ru',
  'dns-shop.ru',
  'mvideo.ru',
  'citilink.ru',
  'leroymerlin.ru',
  'detmir.ru',
  'samokat.ru',
  'yandex.ru',
  'yandex.net',
  'ya.ru',
  'yandexcloud.net',
  'kinopoisk.ru',
  'music.yandex.ru',
  'market.yandex.ru',
  'mail.ru',
  'vk.com',
  'vk.ru',
  'vkvideo.ru',
  'userapi.com',
  'ok.ru',
  'dzen.ru',
  'rutube.ru',
  'ria.ru',
  'lenta.ru',
  'rbc.ru',
  'habr.ru',
  'kaspersky.ru',
  '2gis.ru',
  '2gis.com',
  'sberauto.com',
  // инфраструктура
  'rt.ru',
  'mts.ru',
  'beeline.ru',
  'megafon.ru',
  't2.ru',
  'tele2.ru',
  'yota.ru',
  'mosmetro.ru',
  'rzd.ru',
  'aeroflot.ru',
  's7.ru',
  'pochta.ru',
  'russianpost.ru',
  'gismeteo.ru',
  'mail.yandex.ru',
];

/**
 * Ресурсы для проверки «глушилок».
 * group: local — почти всегда доступны даже при фильтрации;
 *        global — первыми страдают при блокировках/DPI;
 *        messenger / cloud / media — дополнительные маркеры.
 */
export interface ProbeTarget {
  id: string;
  label: string;
  group: 'local' | 'global' | 'messenger' | 'cloud' | 'media';
  /** Домен для DNS-проверки. */
  host: string;
  /** URL для HTTPS-проверки (204/200). */
  url: string;
  /** Ожидаемые коды ответа. */
  expect?: number[];
  /** IP, который должен вернуться (для детекта подмены) — только для известных. */
  note?: string;
}

export const PROBE_TARGETS: ProbeTarget[] = [
  // локальные (в РФ работают даже при жёсткой фильтрации)
  { id: 'vk', label: 'ВКонтакте', group: 'local', host: 'vk.com', url: 'https://vk.com/favicon.ico' },
  { id: 'gosuslugi', label: 'Госуслуги', group: 'local', host: 'gosuslugi.ru', url: 'https://www.gosuslugi.ru/favicon.ico' },
  { id: 'yandex', label: 'Яндекс', group: 'local', host: 'ya.ru', url: 'https://ya.ru/favicon.ico' },
  { id: 'mailru', label: 'Mail.ru', group: 'local', host: 'mail.ru', url: 'https://mail.ru/favicon.ico' },
  { id: 'sber', label: 'Сбербанк', group: 'local', host: 'sberbank.ru', url: 'https://www.sberbank.ru/favicon.ico' },

  // глобальные (главный индикатор)
  { id: 'google', label: 'Google', group: 'global', host: 'www.google.com', url: 'https://www.google.com/generate_204' },
  { id: 'gstatic', label: 'Google CDN', group: 'global', host: 'www.gstatic.com', url: 'https://www.gstatic.com/generate_204' },
  { id: 'youtube', label: 'YouTube', group: 'media', host: 'www.youtube.com', url: 'https://www.youtube.com/favicon.ico' },
  { id: 'cloudflare', label: 'Cloudflare', group: 'global', host: 'cloudflare.com', url: 'https://cloudflare.com/favicon.ico' },
  { id: 'apple', label: 'Apple', group: 'global', host: 'www.apple.com', url: 'https://www.apple.com/favicon.ico' },
  { id: 'microsoft', label: 'Microsoft', group: 'global', host: 'www.microsoft.com', url: 'https://www.microsoft.com/favicon.ico' },
  { id: 'xiaomi', label: 'Xiaomi (MIUI)', group: 'cloud', host: 'api.miui.com', url: 'https://api.miui.com/' },
  { id: 'huawei', label: 'Huawei', group: 'cloud', host: 'www.huawei.com', url: 'https://www.huawei.com/favicon.ico' },
  { id: 'github', label: 'GitHub', group: 'global', host: 'github.com', url: 'https://github.com/favicon.ico' },
  { id: 'telegram', label: 'Telegram', group: 'messenger', host: 'telegram.org', url: 'https://telegram.org/favicon.ico' },
  { id: 'whatsapp', label: 'WhatsApp', group: 'messenger', host: 'web.whatsapp.com', url: 'https://web.whatsapp.com/favicon.ico' },
  { id: 'instagram', label: 'Instagram', group: 'media', host: 'www.instagram.com', url: 'https://www.instagram.com/favicon.ico' },
  { id: 'openai', label: 'ChatGPT', group: 'global', host: 'chatgpt.com', url: 'https://chatgpt.com/favicon.ico' },
  { id: 'spotify', label: 'Spotify', group: 'media', host: 'open.spotify.com', url: 'https://open.spotify.com/favicon.ico' },
  { id: 'steam', label: 'Steam', group: 'media', host: 'store.steampowered.com', url: 'https://store.steampowered.com/favicon.ico' },
];

/** Домены, которые проверяем на DNS-подмену (публичные «честные» ответы). */
export const DNS_CANARY = [
  { host: 'www.google.com', forbid: ['0.0.0.0', '127.0.0.1'] },
  { host: 'github.com', forbid: ['0.0.0.0', '127.0.0.1'] },
];

export const CONNECTIVITY_URLS = [
  'https://www.gstatic.com/generate_204',
  'https://cp.cloudflare.com/generate_204',
  'http://captive.apple.com/hotspot-detect.html',
];
