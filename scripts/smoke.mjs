/**
 * Дымовой тест: собирает renderer через esbuild и монтирует его в jsdom.
 * Ловит ошибки импортов, хуков и падения компонентов, которые не видит tsc.
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const errors = [];
const outdir = await mkdtemp(join(tmpdir(), 'shuzu-smoke-'));

await build({
  entryPoints: ['src/smoke-entry.tsx'],
  bundle: true,
  outfile: join(outdir, 'bundle.cjs'),
  platform: 'browser',
  format: 'cjs',
  target: 'chrome120',
  jsx: 'automatic',
  loader: { '.css': 'empty', '.json': 'json', '.ttf': 'empty', '.svg': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent',
});

const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="root"></div></body></html>`, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true, writable: true });
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.MutationObserver = window.MutationObserver;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 16));
global.cancelAnimationFrame = window.cancelAnimationFrame || clearTimeout;
global.matchMedia = window.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Object.defineProperty(global, 'localStorage', { value: window.localStorage, configurable: true });


// jsdom-окружение целиком переносим в global — иначе браузерные классы (SVGElement и др.) недоступны
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in global) continue;
  try {
    const desc = Object.getOwnPropertyDescriptor(window, key);
    if (!desc) continue;
    Object.defineProperty(global, key, { ...desc, configurable: true });
  } catch {
    /* некоторые свойства защищены — пропускаем */
  }
}

// Node-версии этих классов несовместимы с jsdom-элементами — берём из window
for (const key of ['AbortController', 'AbortSignal', 'Event', 'EventTarget', 'CustomEvent', 'MessageChannel', 'Blob', 'File', 'FormData', 'URL', 'URLSearchParams']) {
  try {
    Object.defineProperty(global, key, { value: window[key], configurable: true, writable: true });
  } catch {
    /* ignore */
  }
}

const require = createRequire(import.meta.url);
const origError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(' '));
  origError(...args);
};
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));

try {
  require(join(outdir, 'bundle.cjs'));
} catch (e) {
  console.log('MOUNT FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 1500));

const text = document.body.textContent || '';
const html = document.body.innerHTML;

const checks = [
  ['SHUZU отрисован', text.includes('SHUZU')],
  ['блок статуса', text.includes('Отключено') || text.includes('Демо') || text.includes('Подключено')],
  ['список серверов', text.includes('Лучший сервер') || text.includes('Добавить подписку')],
  ['нет пустого DOM', html.length > 2000],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    failed++;
    console.log('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

const reactErrors = errors.filter((e) => !/not implemented|Not implemented|Could not parse CSS|getContext/i.test(e));
if (reactErrors.length) {
  console.log('\nОшибки в консоли:\n' + reactErrors.slice(0, 12).join('\n---\n'));
  failed++;
}

console.log(`\nТекст (${text.length} симв.):`, text.replace(/\s+/g, ' ').slice(0, 260));
process.exit(failed ? 1 : 0);
