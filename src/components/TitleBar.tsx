/** Стилизованная под программу оболочка окна Windows/Linux (frameless). */
import { useEffect, useState } from 'react';
import { getEngine, isDesktop } from '../engine';
import { useApp } from '../store';
import { countryName } from '../../shared/countries';
import { IconDownload, IconLogo, IconMinus, IconRestore, IconSquare, IconX } from './Icons';

export default function TitleBar() {
  const info = useApp((s) => s.info);
  const conn = useApp((s) => s.conn);
  const servers = useApp((s) => s.servers);
  const update = useApp((s) => s.update);
  const openModal = useApp((s) => s.openModal);
  const [maximized, setMaximized] = useState(false);

  const showChrome = isDesktop && info.platform !== 'darwin' && info.platform !== 'android';

  useEffect(() => {
    if (!showChrome) return;
    const api = getEngine();
    void api.window.isMaximized().then(setMaximized);
    return api.window.onMaximizeChange(setMaximized);
  }, [showChrome]);

  if (!showChrome) return null;

  const server = servers.find((s) => s.id === conn.serverId);
  const connected = conn.status === 'connected';
  const statusText =
    conn.status === 'connected'
      ? `Подключено${server ? ` · ${server.cleanName}` : conn.exitCountry ? ` · ${countryName(conn.exitCountry, 'ru')}` : ''}`
      : conn.status === 'connecting'
        ? 'Подключение…'
        : conn.status === 'disconnecting'
          ? 'Отключение…'
          : 'Отключено';

  const api = getEngine();

  return (
    <div
      className="titlebar"
      onDoubleClick={() => api.window.toggleMaximize()}
    >
      <div className="titlebar__brand">
        <IconLogo />
        SHUZU
      </div>
      <div className="titlebar__status">
        <span className={`titlebar__dot${connected ? ' is-connected' : ''}`} />
        {statusText}
      </div>
      <div className="titlebar__spacer" />
      {update?.available && (
        <button className="titlebar__pill" onClick={() => openModal({ name: 'update' })}>
          <IconDownload />
          {update.version}
        </button>
      )}
      <div className="titlebar__actions">
        <button className="winbtn" onClick={() => api.window.minimize()} aria-label="Свернуть" title="Свернуть">
          <IconMinus />
        </button>
        <button
          className="winbtn"
          onClick={() => api.window.toggleMaximize()}
          aria-label={maximized ? 'Восстановить' : 'Развернуть'}
          title={maximized ? 'Восстановить' : 'Развернуть'}
        >
          {maximized ? <IconRestore /> : <IconSquare />}
        </button>
        <button className="winbtn winbtn--close" onClick={() => api.window.close()} aria-label="Закрыть" title="Закрыть">
          <IconX />
        </button>
      </div>
    </div>
  );
}
