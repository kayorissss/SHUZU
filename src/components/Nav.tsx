/** Навигация: нижние табы в компактном режиме и рельс на широком экране. */
import { motion } from 'framer-motion';
import { useApp } from '../store';
import type { Screen } from '../store';
import { IconGlobe, IconLogo, IconServer, IconSettings, IconUser } from './Icons';

const TABS: Array<{ screen: Screen; label: string; icon: JSX.Element }> = [
  { screen: 'home', label: 'VPN', icon: <IconGlobe /> },
  { screen: 'servers', label: 'Серверы', icon: <IconServer /> },
  { screen: 'profile', label: 'Профиль', icon: <IconUser /> },
  { screen: 'settings', label: 'Ещё', icon: <IconSettings /> },
];

const TAB_OF: Record<Screen, Screen> = {
  home: 'home',
  servers: 'servers',
  profile: 'profile',
  settings: 'settings',
  subscriptions: 'profile',
  diagnostics: 'settings',
  censor: 'servers',
  logs: 'settings',
};

export function TabBar() {
  const screen = useApp((s) => s.screen);
  const go = useApp((s) => s.go);
  const active = TAB_OF[screen];
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {TABS.map((t) => (
        <button
          key={t.screen}
          className={`tabbar__item${active === t.screen ? ' is-active' : ''}`}
          onClick={() => go(t.screen)}
          aria-current={active === t.screen}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Rail() {
  const screen = useApp((s) => s.screen);
  const go = useApp((s) => s.go);
  const active = TAB_OF[screen];
  const update = useApp((s) => s.update);
  const openModal = useApp((s) => s.openModal);
  return (
    <aside className="rail">
      <div className="rail__logo" aria-hidden>
        <IconLogo />
      </div>
      {TABS.map((t) => (
        <button
          key={t.screen}
          className={`rail__item${active === t.screen ? ' is-active' : ''}`}
          onClick={() => go(t.screen)}
          title={t.label}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
      <div className="rail__spacer" />
      {update?.available && (
        <motion.button
          className="rail__item rail__item--small"
          onClick={() => openModal({ name: 'update' })}
          title={`Доступно обновление ${update.version}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ color: 'var(--accent)' }}
        >
          <span style={{ fontSize: 10, fontWeight: 700 }}>new</span>
        </motion.button>
      )}
    </aside>
  );
}
