/** Главный экран: подключение, карта мира, быстрый выбор сервера. */
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useApp } from '../store';
import { useMediaQuery, useTicker } from '../hooks';
import { coordsFor, countryName } from '../../shared/countries';
import { pickBest, qualityOf } from '../../shared/quality';
import { formatBytes, formatDuration, formatSpeed } from '../../shared/util';
import { getEngine, isDesktop } from '../engine';
import WorldMap from '../components/WorldMap';
import PowerButton from '../components/PowerButton';
import ScreenHeader from '../components/ScreenHeader';
import ServerRow from '../components/ServerRow';
import { Flag } from '../components/ui';
import {
  IconAlert,
  IconChevronRight,
  IconDownload,
  IconGlobe,
  IconInfo,
  IconSettings,
  IconShield,
  IconSparkle,
  IconX,
  IconZap,
} from '../components/Icons';

export default function Home() {
  const conn = useApp((s) => s.conn);
  const servers = useApp((s) => s.servers);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const speed = useApp((s) => s.speed);
  const uptime = useApp((s) => s.uptime);
  const pinging = useApp((s) => s.pinging);
  const pingingIds = useApp((s) => s.pingingIds);
  const update = useApp((s) => s.update);
  const censor = useApp((s) => s.censor);
  const hideDemoNotice = useApp((s) => s.hideDemoNotice);
  const toggleConnection = useApp((s) => s.toggleConnection);
  const go = useApp((s) => s.go);
  const openModal = useApp((s) => s.openModal);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const selectServer = useApp((s) => s.selectServer);

  const wide = useMediaQuery('(min-width: 940px)');
  useTicker(conn.status === 'connected');

  const best = useMemo(() => pickBest(servers), [servers]);
  const current = useMemo(() => {
    if (conn.serverId) return servers.find((s) => s.id === conn.serverId) ?? null;
    return conn.auto ? best : null;
  }, [conn.serverId, conn.auto, servers, best]);

  const target = useMemo(() => (current ? coordsFor(current.country, current.city) : null), [current]);

  const quickList = useMemo(() => {
    const sorted = [...servers].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const pa = a.tunnelPing ?? a.ping ?? 9999;
      const pb = b.tunnelPing ?? b.ping ?? 9999;
      if (pa !== pb) return pa - pb;
      return a.cleanName.localeCompare(b.cleanName);
    });
    return sorted.slice(0, wide ? 8 : 5);
  }, [servers, wide]);

  const busy = conn.status === 'connecting' || conn.status === 'disconnecting';
  const connected = conn.status === 'connected';

  const statusTitle =
    conn.status === 'connected'
      ? 'Подключено'
      : conn.status === 'connecting'
        ? 'Подключение…'
        : conn.status === 'disconnecting'
          ? 'Отключение…'
          : conn.status === 'error'
            ? 'Ошибка'
            : 'Отключено';

  const statusSub = (() => {
    if (conn.status === 'connected') {
      const parts: Array<React.ReactNode> = [];
      if (current) parts.push(<b key="name">{current.cleanName}</b>);
      const ping = current?.tunnelPing ?? current?.ping;
      if (ping != null) parts.push(<span key="p">{ping} мс</span>);
      parts.push(<span key="mode">{settings.mode === 'tun' ? 'TUN' : 'Прокси'}</span>);
      return parts;
    }
    if (conn.status === 'connecting') return <span>Проверяем сервер и поднимаем туннель</span>;
    if (conn.status === 'disconnecting') return <span>Закрываем соединение</span>;
    if (conn.status === 'error') return <span style={{ color: '#ff6b6b' }}>{conn.error ?? 'Не удалось подключиться'}</span>;
    if (!servers.length) return <span>Добавьте подписку, чтобы начать</span>;
    return <span>Нажмите, чтобы подключиться</span>;
  })();

  const exitCountryName = conn.exitCountry ? countryName(conn.exitCountry, 'ru') : null;

  const stage = (
    <div className="stage">
      <WorldMap
        connected={connected}
        connecting={conn.status === 'connecting'}
        target={target}
        accent={settings.accent}
        animate={settings.mapAnimation}
      />
      <div className="stage__content">
        <PowerButton
          status={conn.status}
          onClick={() => void toggleConnection()}
          label={connected ? 'Отключиться' : 'Подключиться'}
        />
        <div className="status">
          <motion.div
            key={statusTitle}
            className={`status__title${connected ? ' is-accent' : ''}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {statusTitle}
          </motion.div>
          <div className="status__sub">{statusSub}</div>
        </div>

        {conn.status === 'error' && info.platform === 'win32' && settings.mode === 'tun' && !info.isAdmin && (
          <div className="row-gap-6" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => {
              void getEngine().app.restartAsAdmin().then((ok) => {
                if (!ok) useApp.getState().toast({ kind: 'warn', title: 'Перезапуск отменён', body: 'Можно подключиться через системный прокси без прав администратора.' });
              }).catch(() => useApp.getState().toast({ kind: 'error', title: 'Не удалось перезапустить приложение' }));
            }}>Запустить от администратора</button>
            <button className="btn" onClick={() => {
              void useApp.getState().saveSettings({ mode: 'proxy' }).then(() => useApp.getState().connect());
            }}>Использовать системный прокси</button>
          </div>
        )}

        {connected && (
          <motion.div
            className="metrics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{ width: wide ? 380 : '100%', maxWidth: wide ? 380 : 300 }}
          >
            <div className="metric">
              <span className="metric__label">Загрузка</span>
              <span className="metric__value">{formatSpeed(speed.rx)}</span>
            </div>
            <div className="metric">
              <span className="metric__label">Отдача</span>
              <span className="metric__value">{formatSpeed(speed.tx)}</span>
            </div>
            <div className="metric">
              <span className="metric__label">Время</span>
              <span className="metric__value">{formatDuration(uptime)}</span>
            </div>
          </motion.div>
        )}

        {connected && exitCountryName && (
          <div className="row-gap-6 small dim" style={{ justifyContent: 'center' }}>
            <IconGlobe width={13} height={13} />
            <span>
              Выход: {exitCountryName}
              {conn.exitIp ? ` · ${conn.exitIp}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const panel = (
    <div className="home__panel">
      {!hideDemoNotice && info.demo && (
        <div className="banner" style={{ marginBottom: 2 }}>
          <div className="banner__icon">
            <IconInfo />
          </div>
          <div className="banner__text">
            <div className="banner__title">Демо-режим предпросмотра</div>
            <div className="banner__sub">
              В браузере туннель недоступен. В приложении для Windows и Android всё работает по-настоящему.
            </div>
          </div>
          <button
            className="iconbtn"
            style={{ width: 28, height: 28 }}
            onClick={() => {
              localStorage.setItem('shuzu.demoNotice', 'hidden');
              useApp.setState({ hideDemoNotice: true });
            }}
            aria-label="Скрыть"
          >
            <IconX width={14} height={14} />
          </button>
        </div>
      )}

      {update?.available && (
        <button
          className="banner"
          style={{ marginBottom: 2, width: '100%', textAlign: 'left' }}
          onClick={() => openModal({ name: 'update' })}
        >
          <div className="banner__icon">
            <IconDownload />
          </div>
          <div className="banner__text">
            <div className="banner__title">Доступно обновление {update.version}</div>
            <div className="banner__sub">Нажмите, чтобы скачать и установить</div>
          </div>
          <IconChevronRight width={16} height={16} />
        </button>
      )}

      <button className="fastrow" onClick={() => go('servers')}>
        <div className="fastrow__icon">
          <IconZap />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fastrow__title">Лучший сервер</div>
          <div className="fastrow__sub">
            {conn.auto && current
              ? `Авто-выбор · ${current.cleanName}${(current.ping ?? 0) ? ` · ${current.ping} мс` : ''}`
              : 'Автоматический выбор по пингу'}
          </div>
        </div>
        {conn.auto && current && <Flag code={current.country} />}
        <span className="fastrow__chev">
          <IconChevronRight />
        </span>
      </button>

      <div className="section">
        <div className="section__head">
          <div className="section__title">Все серверы</div>
          <div className="section__spacer" />
          {pinging && <span className="badge badge--accent">замер…</span>}
          {!pinging && censor?.verdict === 'filtered' && (
            <span className="badge badge--warn" title="Обнаружена фильтрация трафика">
              <IconAlert width={11} height={11} /> DPI
            </span>
          )}
          <button className="linkbtn" onClick={() => go('servers')}>
            Все ({servers.length})
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
            <div className="empty__title" style={{ marginBottom: 6 }}>
              Пока нет серверов
            </div>
            <div className="small dim" style={{ marginBottom: 14 }}>
              Добавьте подписку — из буфера обмена, по QR-коду или файлом.
            </div>
            <button className="btn btn--primary btn--sm" onClick={() => openModal({ name: 'addSub' })}>
              <IconSparkle width={15} height={15} />
              Добавить подписку
            </button>
          </div>
        ) : wide ? (
          <div className="card">
            {quickList.map((s, i) => (
              <ServerRow
                key={s.id}
                index={i}
                server={s}
                selected={s.id === conn.serverId}
                measuring={pingingIds.includes(s.id)}
                onClick={() => void selectServer(s.id)}
                onStar={() => void toggleFavorite(s.id)}
                onInfo={() => openModal({ name: 'serverDetails', serverId: s.id })}
              />
            ))}
          </div>
        ) : (
          <div className="card">
            {quickList.map((s, i) => (
              <ServerRow
                key={s.id}
                index={i}
                server={s}
                selected={s.id === conn.serverId}
                measuring={pingingIds.includes(s.id)}
                onClick={() => void selectServer(s.id)}
                onStar={() => void toggleFavorite(s.id)}
              />
            ))}
          </div>
        )}

        {servers.length > 0 && (
          <div className="row-gap-8" style={{ marginTop: 2 }}>
            <button className="btn btn--sm btn--ghost" style={{ flex: 1 }} onClick={() => go('censor')}>
              <IconShield width={15} height={15} />
              Анализ блокировок
            </button>
            <button className="btn btn--sm btn--ghost" style={{ flex: 1 }} onClick={() => go('diagnostics')}>
              <IconInfo width={15} height={15} />
              Диагностика
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <ScreenHeader
        wordmark
        actions={
          <>
            {conn.status === 'connected' && current && (
              <span className="badge badge--ok" title="Качество соединения">
                {qualityOf(current).score}/100
              </span>
            )}
            <button className="iconbtn" onClick={() => go('settings')} aria-label="Настройки">
              <IconSettings />
            </button>
          </>
        }
      />
      <div className={`home${wide ? ' home--wide' : ''}`}>
        {stage}
        {panel}
      </div>
      {isDesktop && !connected && servers.length > 0 && (
        <div className="faint tiny center" style={{ padding: '4px 0 8px' }}>
          {settings.mode === 'tun'
            ? 'Режим TUN: весь трафик устройства идёт через туннель'
            : 'Режим системного прокси: трафик приложений, использующих системные настройки'}
          {' · '}
          {formatBytes(conn.rx + conn.tx)} за сессию
        </div>
      )}
    </>
  );
}
