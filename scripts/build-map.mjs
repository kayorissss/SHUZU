/**
 * Генератор точечной карты мира для анимации на главном экране.
 * Берёт реальную геометрию (world-atlas) и превращает её в сетку точек.
 *
 * Запуск: node scripts/build-map.mjs
 * Результат: src/data/world-dots.json (компактно: индексы точек в сетке)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const STEP = 1.5; // градусов на точку
const LAT_MIN = -58; // Антарктиду не рисуем
const LAT_MAX = 80;

async function main() {
  const raw = await readFile(resolve(root, 'node_modules/world-atlas/land-110m.json'), 'utf8');
  const topo = JSON.parse(raw);
  const land = feature(topo, topo.objects.land);

  const cols = Math.round(360 / STEP);
  const rows = Math.round((LAT_MAX - LAT_MIN) / STEP);
  const pts = [];

  for (let r = 0; r < rows; r++) {
    const lat = LAT_MAX - (r + 0.5) * STEP;
    // компенсируем сжатие по долготе у полюсов — иначе точки «разъезжаются»
    const latScale = Math.cos((lat * Math.PI) / 180);
    for (let c = 0; c < cols; c++) {
      const lon = -180 + (c + 0.5) * STEP;
      if (!geoContains(land, [lon, lat])) continue;
      pts.push(r * cols + c);
      // в высоких широтах добавляем разрежение (визуально ровная сетка)
      if (latScale < 0.45 && c % 2 === 0) pts.pop();
    }
  }

  const out = {
    lon0: -180,
    lat0: LAT_MAX,
    step: STEP,
    cols,
    rows,
    count: pts.length,
    pts,
  };

  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeFile(resolve(root, 'src/data/world-dots.json'), JSON.stringify(out));
  console.log(`Точек: ${pts.length}, сетка ${cols}x${rows}, размер JSON: ${(JSON.stringify(out).length / 1024).toFixed(1)} КБ`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
