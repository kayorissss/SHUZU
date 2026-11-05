/**
 * Точечная карта мира.
 *
 * Пока отключено — статичная сетка точек (как на макете).
 * При подключении камера плавно приближается к стране сервера, а точки вокруг
 * загораются акцентным цветом с мягким пульсирующим свечением.
 *
 * Оптимизация: базовый слой точек рисуется один раз в offscreen-canvas,
 * в анимации перерисовывается только подсветка (десятки точек), а не все 6k.
 */
import { useEffect, useRef } from 'react';
import mapData from '../data/world-dots.json';
import { ACCENTS } from '../theme';
import type { Settings } from '../../shared/types';
import { clamp, easeInOutCubic } from '../../shared/util';

interface MapData {
  lon0: number;
  lat0: number;
  step: number;
  cols: number;
  rows: number;
  count: number;
  pts: number[];
}

interface Props {
  connected: boolean;
  connecting?: boolean;
  target: [number, number] | null;
  accent: Settings['accent'];
  animate: boolean;
}

interface Dot {
  nx: number;
  ny: number;
}

const LAT_TOP = 84;
const LAT_BOTTOM = -60;

const MAP = mapData as MapData;

let cachedDots: Dot[] | null = null;

function buildDots(): Dot[] {
  if (cachedDots) return cachedDots;
  const dots: Dot[] = [];
  const { cols, lon0, lat0, step, pts } = MAP;
  for (const idx of pts) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const lon = lon0 + (c + 0.5) * step;
    const lat = lat0 - (r + 0.5) * step;
    dots.push({
      nx: (lon + 180) / 360,
      ny: (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM),
    });
  }
  cachedDots = dots;
  return dots;
}

function projectPoint(lon: number, lat: number): Dot {
  return { nx: (lon + 180) / 360, ny: (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM) };
}

export default function WorldMap({ connected, connecting, target, accent, animate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef({ cx: 0.5, cy: 0.5, zoom: 1 });
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const startRef = useRef(0);
  const accentRef = useRef(ACCENTS[accent]);
  const renderRef = useRef<((now: number) => void) | null>(null);
  const lastFrameRef = useRef(0);

  accentRef.current = ACCENTS[accent] ?? ACCENTS.mint;

  /* ---------- базовый слой: рисуем точки один раз ---------- */
  const kick = () => {
    if (rafRef.current == null && (renderRef.current)) {
      rafRef.current = requestAnimationFrame(renderRef.current);
    }
  };

  const drawBase = () => {
    const { w, h, dpr } = sizeRef.current;
    if (!w || !h) return;
    let base = baseRef.current;
    if (!base) {
      base = document.createElement('canvas');
      baseRef.current = base;
    }
    base.width = Math.floor(w * dpr);
    base.height = Math.floor(h * dpr);
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dots = buildDots();
    const isLight = document.documentElement.dataset.theme === 'light';
    ctx.fillStyle = isLight ? 'rgba(20,30,45,0.16)' : 'rgba(255,255,255,0.135)';
    const r = Math.max(0.85, Math.min(1.35, w / 420));
    // точки рисуем прямоугольниками — быстрее, чем arc() на 6k элементах
    for (const d of dots) {
      const x = d.nx * w;
      const y = d.ny * h;
      if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  };

  const resize = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width !== sizeRef.current.w || rect.height !== sizeRef.current.h) {
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      drawBase();
      kick();
    }
  };

  /* ---------- анимация ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resize();
    const ro = new ResizeObserver(() => {
      resize();
    });
    if (wrapRef.current) ro.observe(wrapRef.current);

    const themeObserver = new MutationObserver(() => drawBase());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const t0 = performance.now();
    startRef.current = t0;

    const render = (now: number) => {
      // на телефоне рисуем ~30 кадров/с: анимация остаётся плавной, батарея — целее
      const isPhone = document.documentElement.dataset.platform === 'android';
      if (isPhone && now - lastFrameRef.current < 30) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameRef.current = now;

      const { w, h, dpr } = sizeRef.current;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const time = now - startRef.current;
      const tgt = target ? projectPoint(target[0], target[1]) : null;
      const wantZoom = connected ? 2.35 : connecting ? 1.25 : 1;
      const wantCx = connected && tgt ? tgt.nx : 0.5;
      const wantCy = connected && tgt ? tgt.ny : 0.42;

      const cam = camRef.current;
      const k = 0.055;
      cam.cx += (wantCx - cam.cx) * k;
      cam.cy += (wantCy - cam.cy) * k;
      cam.zoom += (wantZoom - cam.zoom) * k;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const zoom = cam.zoom;
      const ox = w / 2 - cam.cx * w * zoom;
      const oy = h / 2 - cam.cy * h * zoom;

      // базовый слой
      const base = baseRef.current;
      if (base) {
        ctx.save();
        ctx.globalAlpha = connected ? 0.55 : 1;
        ctx.drawImage(base, ox, oy, w * zoom, h * zoom);
        ctx.restore();
      }

      const ac = accentRef.current;
      const [ar, ag, ab] = ac.rgb;

      if (connected && tgt && animate) {
        // 1. свечение вокруг цели
        const gx = ox + tgt.nx * w * zoom;
        const gy = oy + tgt.ny * h * zoom;
        const pulse = 0.5 + 0.5 * Math.sin(time / 900);
        const glowR = Math.max(w, h) * (0.42 + pulse * 0.05);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
        grad.addColorStop(0, `rgba(${ar},${ag},${ab},0.20)`);
        grad.addColorStop(0.4, `rgba(${ar},${ag},${ab},0.07)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // 2. подсвеченные точки рядом с целью
        const dots = buildDots();
        const radius = 0.075; // в нормализованных координатах карты
        ctx.save();
        for (const d of dots) {
          const dx = (d.nx - tgt.nx) * 1;
          const dy = (d.ny - tgt.ny) * 0.75;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;
          const influence = 1 - dist / radius;
          const ease = easeInOutCubic(clamp(influence * 1.25, 0, 1));
          const px = ox + d.nx * w * zoom;
          const py = oy + d.ny * h * zoom;
          const size = 1.3 + ease * 2.1;
          const alpha = 0.25 + ease * 0.75 * (0.85 + 0.15 * pulse);
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, size / 2, 0, Math.PI * 2);
          ctx.fill();
          if (ease > 0.55) {
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${(ease * 0.14).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(px, py, size * 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        // 3. расходящиеся кольца из точки подключения
        for (let i = 0; i < 2; i++) {
          const p = ((time / 2400 + i * 0.5) % 1 + 1) % 1;
          const rr = 6 + p * Math.min(w, h) * 0.34;
          const alpha = (1 - p) * 0.4;
          ctx.beginPath();
          ctx.arc(gx, gy, rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }

        // 4. маркер
        ctx.beginPath();
        ctx.arc(gx, gy, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar},${ag},${ab},1)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, 8 + pulse * 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.35 - pulse * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Карта неподвижна и туннель выключен — гасим цикл, чтобы не жечь CPU вхолостую.
      // Любое изменение пропсов перезапустит анимацию через зависимость эффекта.
      const idleNow =
        !connected &&
        !connecting &&
        Math.abs(cam.zoom - 1) < 0.003 &&
        Math.abs(cam.cx - 0.5) < 0.003 &&
        Math.abs(cam.cy - 0.42) < 0.003;
      if (idleNow) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(render);
    };

    renderRef.current = render;
    rafRef.current = requestAnimationFrame(render);

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connecting, target?.[0], target?.[1], accent, animate]);

  return (
    <div className="stage__map" ref={wrapRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
