/** Сканер QR-кода с камеры (телефон и веб-камера ПК). */
import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { IconCamera, IconX } from './Icons';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Камера недоступна в этом окружении');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) return;

        const tick = () => {
          if (doneRef.current) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            const w = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              doneRef.current = true;
              stop();
              onResult(code.data.trim());
              return;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg =
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Доступ к камере запрещён. Разрешите его в настройках или вставьте текст вручную.'
            : e instanceof Error
              ? e.message
              : 'Не удалось открыть камеру';
        setError(msg);
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onResult, stop]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          color: '#fff',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
          zIndex: 2,
        }}
      >
        <IconCamera width={18} height={18} />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Наведите камеру на QR-код</div>
        <button className="iconbtn" onClick={onClose} aria-label="Закрыть" style={{ color: '#fff' }}>
          <IconX />
        </button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 1 : 0, transition: 'opacity .3s' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* рамка сканирования */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 'min(68vw, 260px)',
              aspectRatio: '1',
              borderRadius: 24,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              border: '2px solid var(--accent)',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              textAlign: 'center',
              color: '#fff',
              fontSize: 13.5,
              lineHeight: 1.5,
              background: 'rgba(0,0,0,0.75)',
            }}
          >
            <div>
              {error}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn--sm" onClick={onClose}>
                  Вставить вручную
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
