/**
 * Генерация иконок приложения из resources/logo/icon.svg.
 * Результат: resources/icon.png, icon-512.png, icon-256.png, tray.png,
 * public/icon.png (для favicon) и Android mipmap-*.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(resolve(root, 'resources/logo/icon.svg'));

async function png(size, outPath) {
  const buf = await sharp(svg, { density: 512 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`${outPath.replace(root + '/', '')} — ${size}px, ${(buf.length / 1024).toFixed(1)} КБ`);
}

// Основные размеры
await png(1024, resolve(root, 'resources/icon.png'));
await png(512, resolve(root, 'resources/icon-512.png'));
await png(256, resolve(root, 'resources/icon-256.png'));
await png(180, resolve(root, 'resources/icon-180.png'));
await png(512, resolve(root, 'public/icon.png'));
await png(120, resolve(root, 'public/icon-120.png'));

// Трей: монохромная версия на прозрачном фоне
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M32 6 52 15v14c0 11-7.2 19.5-20 23-12.8-3.5-20-12-20-23V15z" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linejoin="round"/>
  <path d="M32 22v9.5" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M25.5 27a9 9 0 1 0 13 0" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round"/>
</svg>`;
const trayBuf = await sharp(Buffer.from(traySvg), { density: 384 }).resize(32, 32).png().toBuffer();
await writeFile(resolve(root, 'resources/tray.png'), trayBuf);
const tray2x = await sharp(Buffer.from(traySvg), { density: 384 }).resize(64, 64).png().toBuffer();
await writeFile(resolve(root, 'resources/tray@2x.png'), tray2x);
console.log('resources/tray.png — 32px');

// Windows .ico (многоразмерный, PNG-внутри-ICO)
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const s of icoSizes) {
  icoImages.push({ size: s, data: await sharp(svg, { density: 512 }).resize(s, s).png().toBuffer() });
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
const entries = [];
let offset = 6 + icoImages.length * 16;
for (const img of icoImages) {
  const e = Buffer.alloc(16);
  const s = img.size >= 256 ? 0 : img.size;
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.data.length;
  entries.push(e);
}
const ico = Buffer.concat([header, ...entries, ...icoImages.map((i) => i.data)]);
await writeFile(resolve(root, 'resources/icon.ico'), ico);
console.log(`resources/icon.ico — ${icoSizes.length} размеров, ${(ico.length / 1024).toFixed(1)} КБ`);

// ---------------------------------------------------------------- Android
const androidRes = resolve(root, 'android/app/src/main/res');
if (!existsSync(androidRes)) {
  console.log('android/ ещё нет — mipmap-иконки пропущены');
} else {
  const source = svg.toString('utf8');
  const defsEnd = source.indexOf('</defs>') + '</defs>'.length;
  const head = source.slice(0, defsEnd);
  let body = source.slice(defsEnd, source.lastIndexOf('</svg>'));
  // убираем плитку и блик — остаются щит и глиф
  body = body.replace(/<!-- плитка -->[\s\S]*?<!-- щит -->/, '<!-- щит -->');

  // foreground адаптивной иконки: логотип в безопасной зоне (66%)
  const fgSvg = `${head}<g transform="translate(256,256) scale(0.66) translate(-256,-256)">${body}</g></svg>`;
  // фон адаптивной иконки: градиент на всю плитку, без скруглений
  const bgSvg = `${head}<rect x="0" y="0" width="512" height="512" fill="url(#bg)"/></svg>`;

  // legacy-иконки (Android 7): скруглённая плитка
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [dpi, size] of Object.entries(legacy)) {
    const dir = resolve(androidRes, `mipmap-${dpi}`);
    await mkdir(dir, { recursive: true });
    const square = await sharp(svg, { density: 512 }).resize(size, size).png().toBuffer();
    await writeFile(resolve(dir, 'ic_launcher.png'), square);
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    const round = await sharp(square).composite([{ input: circleMask, blend: 'dest-in' }]).png().toBuffer();
    await writeFile(resolve(dir, 'ic_launcher_round.png'), round);
  }

  // foreground: 108dp
  const fgSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dpi, size] of Object.entries(fgSizes)) {
    const dir = resolve(androidRes, `mipmap-${dpi}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(dir, 'ic_launcher_foreground.png'),
      await sharp(Buffer.from(fgSvg), { density: 512 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    );
  }

  // фон адаптивной иконки — градиентная плитка без скруглений
  const nodpi = resolve(androidRes, 'drawable-nodpi');
  await mkdir(nodpi, { recursive: true });
  await writeFile(resolve(nodpi, 'ic_launcher_bg.png'), await sharp(Buffer.from(bgSvg), { density: 512 }).resize(512, 512).png().toBuffer());

  // ссылка адаптивной иконки на градиентный фон
  const anydpi = resolve(androidRes, 'mipmap-anydpi-v26');
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    await writeFile(
      resolve(anydpi, `${name}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_bg" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
    );
  }
  await writeFile(
    resolve(androidRes, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#34D9C0</color>
</resources>
`,
  );
  console.log('android mipmap-*, adaptive-icon и фон готовы');
}
