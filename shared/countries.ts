/**
 * Справочник стран: код ISO-3166-1 alpha-2, названия (ru/en), центр для карты,
 * а также псевдонимы городов и провайдерских названий, по которым определяется
 * страна сервера из его имени.
 *
 * Координаты — приблизительный географический центр страны (lon, lat).
 */

export interface Country {
  code: string;
  ru: string;
  en: string;
  lon: number;
  lat: number;
  /** Нестандартные варианты написания в именах серверов. */
  alias?: string[];
}

export const COUNTRIES: Country[] = [
  { code: 'RU', ru: 'Россия', en: 'Russia', lon: 90, lat: 61, alias: ['russia', 'россия', 'рф', 'moscow', 'москва', 'spb', 'санкт-петербург', 'saint-petersburg', 'novosibirsk', 'новосибирск', 'ekaterinburg', 'екатеринбург', 'kazan', 'казань'] },
  { code: 'US', ru: 'США', en: 'United States', lon: -98, lat: 39, alias: ['usa', 'us', 'america', 'сша', 'америка', 'new-york', 'new york', 'нью-йорк', 'los-angeles', 'los angeles', 'dallas', 'dallas-tx', 'miami', 'seattle', 'chicago', 'atlanta', 'ashburn', 'phoenix', 'san-jose', 'san jose', 'las-vegas', 'buffalo', 'denver', 'houston', 'boston'] },
  { code: 'DE', ru: 'Германия', en: 'Germany', lon: 10.4, lat: 51.1, alias: ['germany', 'германия', 'deutschland', 'frankfurt', 'франкфурт', 'berlin', 'берлин', 'munich', 'münchen', 'nuremberg', 'dusseldorf', 'düsseldorf', 'hamburg', 'гамбург', 'cologne'] },
  { code: 'NL', ru: 'Нидерланды', en: 'Netherlands', lon: 5.3, lat: 52.2, alias: ['netherlands', 'нидерланды', 'holland', 'голландия', 'amsterdam', 'амстердам', 'rotterdam', 'haag', 'the hague', 'meppel'] },
  { code: 'JP', ru: 'Япония', en: 'Japan', lon: 138, lat: 36.2, alias: ['japan', 'япония', 'tokyo', 'токио', 'osaka', 'осака', 'kyoto', 'saitama'] },
  { code: 'GB', ru: 'Великобритания', en: 'United Kingdom', lon: -2.5, lat: 54, alias: ['uk', 'gb', 'britain', 'great britain', 'великобритания', 'англия', 'england', 'london', 'лондон', 'manchester', 'coventry'] },
  { code: 'FR', ru: 'Франция', en: 'France', lon: 2.3, lat: 46.6, alias: ['france', 'франция', 'paris', 'париж', 'marseille', 'roubaix', 'gravelines'] },
  { code: 'FI', ru: 'Финляндия', en: 'Finland', lon: 25.7, lat: 62, alias: ['finland', 'финляндия', 'helsinki', 'хельсинки', 'espoo', 'tampere'] },
  { code: 'SE', ru: 'Швеция', en: 'Sweden', lon: 15.5, lat: 62, alias: ['sweden', 'швеция', 'stockholm', 'стокгольм', 'gothenburg'] },
  { code: 'NO', ru: 'Норвегия', en: 'Norway', lon: 9, lat: 61.5, alias: ['norway', 'норвегия', 'oslo', 'осло'] },
  { code: 'DK', ru: 'Дания', en: 'Denmark', lon: 10, lat: 56, alias: ['denmark', 'дания', 'copenhagen', 'копенгаген'] },
  { code: 'PL', ru: 'Польша', en: 'Poland', lon: 19.1, lat: 52, alias: ['poland', 'польша', 'warsaw', 'варшава', 'krakow', 'gdansk'] },
  { code: 'CZ', ru: 'Чехия', en: 'Czechia', lon: 15.3, lat: 49.8, alias: ['czech', 'czechia', 'чехия', 'prague', 'прага'] },
  { code: 'AT', ru: 'Австрия', en: 'Austria', lon: 14.1, lat: 47.5, alias: ['austria', 'австрия', 'vienna', 'вена'] },
  { code: 'CH', ru: 'Швейцария', en: 'Switzerland', lon: 8.2, lat: 46.8, alias: ['switzerland', 'швейцария', 'zurich', 'цюрих', 'geneva', 'жунева'] },
  { code: 'IT', ru: 'Италия', en: 'Italy', lon: 12.5, lat: 42.8, alias: ['italy', 'италия', 'milan', 'милан', 'rome', 'рим'] },
  { code: 'ES', ru: 'Испания', en: 'Spain', lon: -3.7, lat: 40.3, alias: ['spain', 'испания', 'madrid', 'мадрид', 'barcelona', 'барселона'] },
  { code: 'PT', ru: 'Португалия', en: 'Portugal', lon: -8.2, lat: 39.5, alias: ['portugal', 'португалия', 'lisbon', 'лиссабон'] },
  { code: 'IE', ru: 'Ирландия', en: 'Ireland', lon: -8, lat: 53.2, alias: ['ireland', 'ирландия', 'dublin', 'дублин'] },
  { code: 'BE', ru: 'Бельгия', en: 'Belgium', lon: 4.5, lat: 50.6, alias: ['belgium', 'бельгия', 'brussels', 'брюссель'] },
  { code: 'LU', ru: 'Люксембург', en: 'Luxembourg', lon: 6.1, lat: 49.8, alias: ['luxembourg', 'люксембург'] },
  { code: 'EE', ru: 'Эстония', en: 'Estonia', lon: 25.8, lat: 58.7, alias: ['estonia', 'эстония', 'tallinn', 'таллин', 'таллинн'] },
  { code: 'LV', ru: 'Латвия', en: 'Latvia', lon: 24.9, lat: 56.9, alias: ['latvia', 'латвия', 'riga', 'рига'] },
  { code: 'LT', ru: 'Литва', en: 'Lithuania', lon: 24, lat: 55.2, alias: ['lithuania', 'литва', 'vilnius', 'вильнюс'] },
  { code: 'UA', ru: 'Украина', en: 'Ukraine', lon: 31, lat: 49, alias: ['ukraine', 'украина', 'kyiv', 'киев', 'odesa'] },
  { code: 'BY', ru: 'Беларусь', en: 'Belarus', lon: 28, lat: 53.5, alias: ['belarus', 'беларусь', 'минск', 'minsk'] },
  { code: 'MD', ru: 'Молдова', en: 'Moldova', lon: 28.5, lat: 47.2, alias: ['moldova', 'молдова', 'кишинёв', 'chisinau'] },
  { code: 'RO', ru: 'Румыния', en: 'Romania', lon: 25, lat: 45.9, alias: ['romania', 'румыния', 'bucharest', 'бухарест'] },
  { code: 'BG', ru: 'Болгария', en: 'Bulgaria', lon: 25.2, lat: 42.7, alias: ['bulgaria', 'болгария', 'sofia', 'софия'] },
  { code: 'HU', ru: 'Венгрия', en: 'Hungary', lon: 19.5, lat: 47.2, alias: ['hungary', 'венгрия', 'budapest', 'будапешт'] },
  { code: 'GR', ru: 'Греция', en: 'Greece', lon: 22, lat: 39.5, alias: ['greece', 'греция', 'athens', 'афины'] },
  { code: 'TR', ru: 'Турция', en: 'Turkey', lon: 35.2, lat: 39, alias: ['turkey', 'türkiye', 'турция', 'istanbul', 'стамбул', 'ankara'] },
  { code: 'GE', ru: 'Грузия', en: 'Georgia', lon: 43.4, lat: 42.3, alias: ['georgia', 'грузия', 'tbilisi', 'тбилиси'] },
  { code: 'AM', ru: 'Армения', en: 'Armenia', lon: 45, lat: 40.2, alias: ['armenia', 'армения', 'yerevan', 'ереван'] },
  { code: 'AZ', ru: 'Азербайджан', en: 'Azerbaijan', lon: 47.5, lat: 40.4, alias: ['azerbaijan', 'азербайджан', 'baku', 'баку'] },
  { code: 'KZ', ru: 'Казахстан', en: 'Kazakhstan', lon: 67, lat: 48, alias: ['kazakhstan', 'казахстан', 'almaty', 'алматы', 'astana', 'астана'] },
  { code: 'UZ', ru: 'Узбекистан', en: 'Uzbekistan', lon: 64, lat: 41.4, alias: ['uzbekistan', 'узбекистан', 'tashkent', 'ташкент'] },
  { code: 'KG', ru: 'Кыргызстан', en: 'Kyrgyzstan', lon: 74.5, lat: 41.2, alias: ['kyrgyzstan', 'кыргызстан', 'киргизия', 'bishkek', 'бишкек'] },
  { code: 'AE', ru: 'ОАЭ', en: 'UAE', lon: 54.4, lat: 24, alias: ['uae', 'emirates', 'оаэ', 'dubai', 'дубай', 'abu-dhabi'] },
  { code: 'IL', ru: 'Израиль', en: 'Israel', lon: 35, lat: 31.4, alias: ['israel', 'израиль', 'tel-aviv', 'тель-авив'] },
  { code: 'IN', ru: 'Индия', en: 'India', lon: 79, lat: 22, alias: ['india', 'индия', 'mumbai', 'мумбаи', 'delhi', 'дели'] },
  { code: 'SG', ru: 'Сингапур', en: 'Singapore', lon: 103.8, lat: 1.35, alias: ['singapore', 'сингапур'] },
  { code: 'HK', ru: 'Гонконг', en: 'Hong Kong', lon: 114.2, lat: 22.3, alias: ['hongkong', 'hong-kong', 'гонконг', 'гон-конг'] },
  { code: 'TW', ru: 'Тайвань', en: 'Taiwan', lon: 121, lat: 23.7, alias: ['taiwan', 'тайвань', 'taipei', 'тайбэй'] },
  { code: 'KR', ru: 'Южная Корея', en: 'South Korea', lon: 127.8, lat: 36.5, alias: ['korea', 'корея', 'seoul', 'сеул'] },
  { code: 'CN', ru: 'Китай', en: 'China', lon: 104, lat: 35.8, alias: ['china', 'китай', 'beijing', 'пекин', 'shanghai', 'шанхай'] },
  { code: 'TH', ru: 'Таиланд', en: 'Thailand', lon: 101, lat: 15, alias: ['thailand', 'таиланд', 'bangkok', 'банкгok', 'бангкок', 'phuket'] },
  { code: 'VN', ru: 'Вьетнам', en: 'Vietnam', lon: 106, lat: 16, alias: ['vietnam', 'вьетнам', 'hanoi', 'ханой'] },
  { code: 'ID', ru: 'Индонезия', en: 'Indonesia', lon: 113, lat: -2, alias: ['indonesia', 'индонезия', 'jakarta', 'джакарта'] },
  { code: 'MY', ru: 'Малайзия', en: 'Malaysia', lon: 102, lat: 4.2, alias: ['malaysia', 'малайзия', 'kuala-lumpur'] },
  { code: 'PH', ru: 'Филиппины', en: 'Philippines', lon: 122, lat: 12.5, alias: ['philippines', 'филиппины', 'manila', 'манила'] },
  { code: 'AU', ru: 'Австралия', en: 'Australia', lon: 134, lat: -25.5, alias: ['australia', 'австралия', 'sydney', 'сидней', 'melbourne', 'мельбурн'] },
  { code: 'NZ', ru: 'Новая Зеландия', en: 'New Zealand', lon: 172, lat: -41.5, alias: ['new zealand', 'новая зеландия', 'auckland'] },
  { code: 'CA', ru: 'Канада', en: 'Canada', lon: -106, lat: 56, alias: ['canada', 'канада', 'toronto', 'торонто', 'montreal', 'vancouver', 'ванкувер', 'beauharnois'] },
  { code: 'MX', ru: 'Мексика', en: 'Mexico', lon: -102, lat: 23.6, alias: ['mexico', 'мексика', 'mexico-city'] },
  { code: 'BR', ru: 'Бразилия', en: 'Brazil', lon: -52, lat: -10, alias: ['brazil', 'бразилия', 'sao-paulo', 'сан-паулу'] },
  { code: 'AR', ru: 'Аргентина', en: 'Argentina', lon: -64, lat: -34, alias: ['argentina', 'аргентина', 'buenos-aires'] },
  { code: 'CL', ru: 'Чили', en: 'Chile', lon: -71, lat: -33, alias: ['chile', 'чили', 'santiago'] },
  { code: 'ZA', ru: 'ЮАР', en: 'South Africa', lon: 24, lat: -29, alias: ['south africa', 'юар', 'johannesburg'] },
  { code: 'EG', ru: 'Египет', en: 'Egypt', lon: 30, lat: 26.8, alias: ['egypt', 'египет', 'cairo', 'каир'] },
  { code: 'NG', ru: 'Нигерия', en: 'Nigeria', lon: 8, lat: 9.1, alias: ['nigeria', 'нигерия'] },
  { code: 'SA', ru: 'Саудовская Аравия', en: 'Saudi Arabia', lon: 45, lat: 24, alias: ['saudi', 'саудовская аравия', 'riyadh'] },
  { code: 'QA', ru: 'Катар', en: 'Qatar', lon: 51.2, lat: 25.3, alias: ['qatar', 'катар', 'doha', 'доха'] },
  { code: 'KW', ru: 'Кувейт', en: 'Kuwait', lon: 47.7, lat: 29.3, alias: ['kuwait', 'кувейт'] },
  { code: 'IS', ru: 'Исландия', en: 'Iceland', lon: -19, lat: 65, alias: ['iceland', 'исландия', 'reykjavik'] },
  { code: 'RS', ru: 'Сербия', en: 'Serbia', lon: 20.8, lat: 44, alias: ['serbia', 'сербия', 'belgrade', 'белград'] },
  { code: 'HR', ru: 'Хорватия', en: 'Croatia', lon: 16, lat: 45.3, alias: ['croatia', 'хорватия', 'zagreb'] },
  { code: 'SI', ru: 'Словения', en: 'Slovenia', lon: 14.8, lat: 46.1, alias: ['slovenia', 'словения'] },
  { code: 'SK', ru: 'Словакия', en: 'Slovakia', lon: 19.5, lat: 48.7, alias: ['slovakia', 'словакия', 'bratislava'] },
  { code: 'CY', ru: 'Кипр', en: 'Cyprus', lon: 33, lat: 35, alias: ['cyprus', 'кипр'] },
  { code: 'MT', ru: 'Мальта', en: 'Malta', lon: 14.4, lat: 35.9, alias: ['malta', 'мальта'] },
  { code: 'AL', ru: 'Албания', en: 'Albania', lon: 20, lat: 41.1, alias: ['albania', 'албания'] },
  { code: 'MK', ru: 'Македония', en: 'North Macedonia', lon: 21.7, lat: 41.6, alias: ['macedonia', 'македония'] },
  { code: 'BA', ru: 'Босния', en: 'Bosnia', lon: 17.8, lat: 44, alias: ['bosnia', 'босния'] },
  { code: 'ME', ru: 'Черногория', en: 'Montenegro', lon: 19.3, lat: 42.7, alias: ['montenegro', 'черногория'] },
  { code: 'PA', ru: 'Панама', en: 'Panama', lon: -80, lat: 8.5, alias: ['panama', 'панама'] },
  { code: 'CO', ru: 'Колумбия', en: 'Colombia', lon: -73, lat: 4, alias: ['colombia', 'колумбия', 'bogota'] },
  { code: 'PE', ru: 'Перу', en: 'Peru', lon: -75, lat: -10, alias: ['peru', 'перу', 'lima'] },
  { code: 'CR', ru: 'Коста-Рика', en: 'Costa Rica', lon: -84, lat: 10, alias: ['costa rica', 'коста-рика'] },
  { code: 'LK', ru: 'Шри-Ланка', en: 'Sri Lanka', lon: 81, lat: 7, alias: ['sri lanka', 'шри-ланка'] },
  { code: 'NP', ru: 'Непал', en: 'Nepal', lon: 84, lat: 28.4, alias: ['nepal', 'непал'] },
  { code: 'PK', ru: 'Пакистан', en: 'Pakistan', lon: 69, lat: 30, alias: ['pakistan', 'пакистан'] },
  { code: 'BD', ru: 'Бангладеш', en: 'Bangladesh', lon: 90, lat: 23.7, alias: ['bangladesh', 'бангладеш'] },
  { code: 'MN', ru: 'Монголия', en: 'Mongolia', lon: 103, lat: 46.8, alias: ['mongolia', 'монголия'] },
  { code: 'IR', ru: 'Иран', en: 'Iran', lon: 53, lat: 32.4, alias: ['iran', 'иран', 'tehran'] },
  { code: 'IQ', ru: 'Ирак', en: 'Iraq', lon: 43.7, lat: 33.2, alias: ['iraq', 'ирак'] },
  { code: 'JO', ru: 'Иордания', en: 'Jordan', lon: 36.5, lat: 31, alias: ['jordan', 'иордания'] },
  { code: 'LB', ru: 'Ливан', en: 'Lebanon', lon: 35.8, lat: 33.9, alias: ['lebanon', 'ливан'] },
  { code: 'MA', ru: 'Марокко', en: 'Morocco', lon: -6, lat: 31.8, alias: ['morocco', 'марокко'] },
  { code: 'TN', ru: 'Тунис', en: 'Tunisia', lon: 9.5, lat: 34, alias: ['tunisia', 'тунис'] },
  { code: 'DZ', ru: 'Алжир', en: 'Algeria', lon: 2.6, lat: 28, alias: ['algeria', 'алжир'] },
  { code: 'KE', ru: 'Кения', en: 'Kenya', lon: 37.9, lat: 0, alias: ['kenya', 'кения', 'nairobi'] },
  { code: 'TZ', ru: 'Танзания', en: 'Tanzania', lon: 34.9, lat: -6.4, alias: ['tanzania', 'танзания'] },
  { code: 'ET', ru: 'Эфиопия', en: 'Ethiopia', lon: 39, lat: 9, alias: ['ethiopia', 'эфиопия'] },
  { code: 'GH', ru: 'Гана', en: 'Ghana', lon: -1.2, lat: 7.9, alias: ['ghana', 'гана'] },
  { code: 'SN', ru: 'Сенегал', en: 'Senegal', lon: -14.5, lat: 14.5, alias: ['senegal', 'сенегал'] },
  { code: 'CU', ru: 'Куба', en: 'Cuba', lon: -79.5, lat: 21.5, alias: ['cuba', 'куба'] },
  { code: 'DO', ru: 'Доминикана', en: 'Dominican Republic', lon: -70.2, lat: 19, alias: ['dominican', 'доминикана'] },
  { code: 'GT', ru: 'Гватемала', en: 'Guatemala', lon: -90.2, lat: 15.8, alias: ['guatemala', 'гватемала'] },
  { code: 'UY', ru: 'Уругвай', en: 'Uruguay', lon: -56, lat: -33, alias: ['uruguay', 'уругвай'] },
  { code: 'PY', ru: 'Парагвай', en: 'Paraguay', lon: -58, lat: -23, alias: ['paraguay', 'парагвай'] },
  { code: 'BO', ru: 'Боливия', en: 'Bolivia', lon: -64, lat: -17, alias: ['bolivia', 'боливия'] },
  { code: 'VE', ru: 'Венесуэла', en: 'Venezuela', lon: -66, lat: 7, alias: ['venezuela', 'венесуэла'] },
  { code: 'EC', ru: 'Эквадор', en: 'Ecuador', lon: -78, lat: -1.5, alias: ['ecuador', 'эквадор'] },
  { code: 'PR', ru: 'Пуэрто-Рико', en: 'Puerto Rico', lon: -66.4, lat: 18.2, alias: ['puerto rico', 'пуэрто-рико'] },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Нормализация для сравнения: нижний регистр, без пунктуации. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ') // флаги-эмодзи
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function getCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function countryName(code: string | null | undefined, lang: 'ru' | 'en' = 'ru'): string {
  const c = getCountry(code);
  if (!c) return lang === 'ru' ? 'Неизвестно' : 'Unknown';
  return lang === 'ru' ? c.ru : c.en;
}

/** Преобразует emoji-флаг (🇩🇪) в код страны DE. */
export function flagEmojiToCode(input: string): string | null {
  const m = input.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
  if (!m) return null;
  const chars = [...m[0]];
  const base = 0x1f1e6;
  const a = chars[0].codePointAt(0)! - base;
  const b = chars[1].codePointAt(0)! - base;
  if (a < 0 || a > 25 || b < 0 || b > 25) return null;
  return String.fromCharCode(65 + a) + String.fromCharCode(65 + b);
}

/** Ключевые слова городов/стран -> код страны. Сортировано по длине, чтобы "new york" выигрывал у "york". */
const KEYWORDS: Array<{ code: string; kw: string }> = (() => {
  const out: Array<{ code: string; kw: string }> = [];
  for (const c of COUNTRIES) {
    out.push({ code: c.code, kw: norm(c.en) });
    out.push({ code: c.code, kw: norm(c.ru) });
    for (const a of c.alias ?? []) out.push({ code: c.code, kw: norm(a) });
  }
  return out.filter((x) => x.kw.length > 1).sort((a, b) => b.kw.length - a.kw.length);
})();

export interface DetectedLocation {
  country: string | null;
  city: string | null;
}

/**
 * Определяет страну и город по имени сервера.
 * Понимает форматы: "🇩🇪 Germany | Frankfurt", "DE-Frankfurt-01",
 * "Netherlands Amsterdam", "Германия Франкфурт" и т.п.
 */
export function detectLocation(rawName: string): DetectedLocation {
  const emoji = flagEmojiToCode(rawName);
  const cleaned = rawName
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    .replace(/[|_/\\]+/g, ' ')
    .trim();
  const n = norm(cleaned);
  const tokens = n.split(' ').filter(Boolean);

  let country = emoji;
  let city: string | null = null;

  // 1) двухбуквенный код в начале/конце ("DE-1", "fi helsinki")
  if (!country) {
    for (const t of tokens) {
      if (t.length === 2 && BY_CODE.has(t.toUpperCase())) {
        country = t.toUpperCase();
        break;
      }
    }
  }

  // 2) самое длинное совпадение по ключевым словам
  if (!country) {
    for (const { code, kw } of KEYWORDS) {
      if (n.includes(kw)) {
        country = code;
        city = kw;
        break;
      }
    }
  } else {
    // страна известна — попробуем вытащить город для отображения
    for (const { code, kw } of KEYWORDS) {
      if (code === country && kw !== norm(country) && n.includes(kw) && kw.length > 3) {
        city = kw;
        break;
      }
    }
  }

  if (city) city = titleCase(city);
  // если город не нашли — используем первый "человеческий" токен имени
  if (!city) {
    const guess = tokens.find((t) => t.length > 2 && !/^\d+$/.test(t) && t !== norm(country ?? '') && !COUNTRIES.some((c) => norm(c.en) === t || norm(c.ru) === t));
    if (guess) city = titleCase(guess);
  }
  return { country: country ?? null, city };
}

/** Страна только по ключевым словам (без правила «две буквы = код страны»). */
export function detectCountryByKeywords(text: string): string | null {
  const n = norm(text);
  for (const { code, kw } of KEYWORDS) {
    if (n.includes(kw)) return code;
  }
  return null;
}

export function titleCase(s: string): string {
  return s
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Приблизительные координаты точки по названию города — чтобы камера карты
 * наводилась не на центр страны, а именно на город, если он известен.
 */
export const CITY_COORDS: Record<string, [number, number]> = {
  moscow: [37.62, 55.75],
  'saint-petersburg': [30.31, 59.94],
  spb: [30.31, 59.94],
  novosibirsk: [82.93, 55.03],
  ekaterinburg: [60.6, 56.83],
  kazan: [49.11, 55.79],
  'new york': [-74.0, 40.71],
  'los angeles': [-118.24, 34.05],
  dallas: [-96.8, 32.78],
  miami: [-80.19, 25.76],
  seattle: [-122.33, 47.61],
  chicago: [-87.63, 41.88],
  atlanta: [-84.39, 33.75],
  ashburn: [-77.49, 39.04],
  phoenix: [-112.07, 33.45],
  'san jose': [-121.89, 37.34],
  'las vegas': [-115.14, 36.17],
  buffalo: [-78.88, 42.89],
  denver: [-104.99, 39.74],
  houston: [-95.37, 29.76],
  boston: [-71.06, 42.36],
  frankfurt: [8.68, 50.11],
  berlin: [13.4, 52.52],
  munich: [11.58, 48.14],
  nuremberg: [11.08, 49.45],
  dusseldorf: [6.77, 51.23],
  hamburg: [9.99, 53.55],
  cologne: [6.96, 50.94],
  amsterdam: [4.9, 52.37],
  rotterdam: [4.48, 51.92],
  meppel: [6.19, 52.7],
  tokyo: [139.69, 35.69],
  osaka: [135.5, 34.69],
  kyoto: [135.77, 35.01],
  london: [-0.13, 51.51],
  manchester: [-2.24, 53.48],
  coventry: [-1.51, 52.41],
  paris: [2.35, 48.86],
  marseille: [5.37, 43.3],
  roubaix: [3.17, 50.69],
  gravelines: [2.13, 50.99],
  helsinki: [24.94, 60.17],
  espoo: [24.65, 60.21],
  tampere: [23.76, 61.5],
  stockholm: [18.07, 59.33],
  gothenburg: [11.97, 57.71],
  oslo: [10.75, 59.91],
  copenhagen: [12.57, 55.68],
  warsaw: [21.01, 52.23],
  krakow: [19.94, 50.06],
  gdansk: [18.65, 54.35],
  prague: [14.42, 50.08],
  vienna: [16.37, 48.21],
  zurich: [8.54, 47.38],
  geneva: [6.14, 46.2],
  milan: [9.19, 45.46],
  rome: [12.5, 41.9],
  madrid: [-3.7, 40.42],
  barcelona: [2.17, 41.39],
  lisbon: [-9.14, 38.72],
  dublin: [-6.26, 53.35],
  brussels: [4.35, 50.85],
  tallinn: [24.75, 59.44],
  riga: [24.11, 56.95],
  vilnius: [25.28, 54.69],
  kyiv: [30.52, 50.45],
  minsk: [27.56, 53.9],
  chisinau: [28.86, 47.01],
  bucharest: [26.1, 44.43],
  sofia: [23.32, 42.7],
  budapest: [19.04, 47.5],
  athens: [23.73, 37.98],
  istanbul: [28.98, 41.01],
  ankara: [32.86, 39.93],
  tbilisi: [44.79, 41.72],
  yerevan: [44.51, 40.18],
  baku: [49.89, 40.41],
  almaty: [76.89, 43.24],
  astana: [71.43, 51.13],
  tashkent: [69.24, 41.3],
  bishkek: [74.6, 42.87],
  dubai: [55.27, 25.2],
  'abu dhabi': [54.37, 24.45],
  'tel aviv': [34.78, 32.08],
  mumbai: [72.88, 19.08],
  delhi: [77.21, 28.61],
  singapore: [103.82, 1.35],
  hongkong: [114.17, 22.32],
  'hong kong': [114.17, 22.32],
  taipei: [121.56, 25.03],
  seoul: [126.98, 37.57],
  beijing: [116.4, 39.9],
  shanghai: [121.47, 31.23],
  bangkok: [100.5, 13.76],
  phuket: [98.39, 7.88],
  hanoi: [105.83, 21.03],
  jakarta: [106.85, -6.21],
  'kuala lumpur': [101.69, 3.14],
  manila: [120.98, 14.6],
  sydney: [151.21, -33.87],
  melbourne: [144.96, -37.81],
  auckland: [174.76, -36.85],
  toronto: [-79.38, 43.65],
  montreal: [-73.57, 45.5],
  vancouver: [-123.12, 49.28],
  beauharnois: [-73.93, 45.31],
  'mexico city': [-99.13, 19.43],
  'sao paulo': [-46.63, -23.55],
  'buenos aires': [-58.38, -34.6],
  santiago: [-70.67, -33.45],
  johannesburg: [28.05, -26.2],
  cairo: [31.24, 30.04],
  riyadh: [46.72, 24.71],
  doha: [51.53, 25.29],
  reykjavik: [-21.94, 64.15],
  belgrade: [20.46, 44.79],
  zagreb: [15.98, 45.81],
  bratislava: [17.11, 48.15],
  bogota: [-74.07, 4.71],
  lima: [-77.04, -12.05],
  nairobi: [36.82, -1.29],
  tehran: [51.39, 35.69],
};

/** Координаты для наведения камеры: сначала город, потом страна. */
export function coordsFor(country: string | null, city: string | null): [number, number] | null {
  if (city) {
    const key = city.toLowerCase().replace(/\s+/g, ' ').trim();
    if (CITY_COORDS[key]) return CITY_COORDS[key];
    const dashed = key.replace(/\s+/g, '-');
    if (CITY_COORDS[dashed]) return CITY_COORDS[dashed];
  }
  const c = getCountry(country);
  return c ? [c.lon, c.lat] : null;
}
