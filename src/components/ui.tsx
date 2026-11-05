/** Базовые UI-примитивы SHUZU. */
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { pingTone } from '../../shared/quality';
import { formatSpeed } from '../../shared/util';
import {
  IconAlert,
  IconCheck,
  IconGlobe,
  IconInfo,
  IconStar,
  IconX,
} from './Icons';

/* ----------------------------- Флаг ----------------------------- */
export function Flag({ code, round }: { code: string | null; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [code]);
  if (!code || broken) {
    return (
      <span className="flag-fallback" aria-hidden>
        <IconGlobe />
      </span>
    );
  }
  return (
    <img
      className={round ? 'flag flag--round' : 'flag'}
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

/* --------------------------- Пинг-бейдж -------------------------- */
export function PingBadge({ ping, measuring, dead }: { ping: number | null; measuring?: boolean; dead?: boolean }) {
  if (dead) return <span className="ping ping--bad">недоступен</span>;
  if (ping == null) {
    return <span className={`ping ping--none${measuring ? ' is-measuring' : ''}`}>{measuring ? 'замер' : '— мс'}</span>;
  }
  return <span className={`ping ping--${pingTone(ping)}`}>{ping} мс</span>;
}

/* --------------------------- Переключатель ----------------------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ------------------------- Сегментированный ---------------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`seg__item${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Модалка --------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  center,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  center?: boolean;
  icon?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`overlay${center ? ' overlay--center' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="modal"
            initial={{ y: center ? 12 : 60, opacity: 0, scale: center ? 0.98 : 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: center ? 8 : 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grabber" />
            <div className="modal__head">
              {icon}
              <div className="modal__title">{title}</div>
              <button className="iconbtn" onClick={onClose} aria-label="Закрыть">
                <IconX />
              </button>
            </div>
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- Тосты ----------------------------- */
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast--${t.kind}`}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => dismiss(t.id)}
            role="status"
          >
            <div className="toast__icon">
              {t.kind === 'success' ? <IconCheck /> : t.kind === 'error' ? <IconX /> : t.kind === 'warn' ? <IconAlert /> : <IconInfo />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="toast__title">{t.title}</div>
              {t.body && <div className="toast__body">{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- Пустое состояние -------------------- */
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      {text && <div className="empty__text">{text}</div>}
      {action}
    </div>
  );
}

/* --------------------------- Строка настройки -------------------- */
export function SettingRow({
  title,
  sub,
  value,
  right,
  onClick,
}: {
  title: string;
  sub?: string;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="settings-row__text">
        <div className="settings-row__title">{title}</div>
        {sub && <div className="settings-row__sub">{sub}</div>}
      </div>
      {value && <div className="settings-row__value">{value}</div>}
      {right}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="settings-row" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="settings-row">{content}</div>;
}

/* --------------------------- Кольцо-оценка ---------------------- */
export function ScoreRing({ score, color }: { score: number; color?: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const stroke = color ?? (score >= 80 ? '#3ee0a8' : score >= 50 ? '#ffc14d' : '#ff6b6b');
  return (
    <div className="score__ring">
      <svg viewBox="0 0 78 78" aria-hidden>
        <circle cx="39" cy="39" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <motion.circle
          cx="39"
          cy="39"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(100, score)) / 100) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="score__num">{score}</div>
    </div>
  );
}

/* --------------------------- Скорость в шапке ------------------- */
export function SpeedPill({ rx, tx }: { rx: number; tx: number }) {
  if (!rx && !tx) return null;
  return (
    <span className="badge" title="Текущая скорость">
      ↓ {formatSpeed(rx)} · ↑ {formatSpeed(tx)}
    </span>
  );
}

/* --------------------------- Звёздочка -------------------------- */
export function StarButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`star${on ? ' is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={on ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={on}
    >
      <IconStar />
    </button>
  );
}
