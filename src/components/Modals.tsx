/** Модальные окна: детали сервера, обновление, подтверждение, первый запуск. */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../store';
import { getEngine, isDesktop } from '../engine';
import { countryName } from '../../shared/countries';
import { qualityOf } from '../../shared/quality';
import { formatBytes, formatDate, formatDateTime } from '../../shared/util';
import { Flag, Modal, PingBadge, Segmented, Switch } from './ui';
import {
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconExternal,
  IconGlobe,
  IconLock,
  IconQr,
  IconRefresh,
  IconShield,
  IconSparkle,
  IconTrash,
  IconX,
  IconZap,
  LogoMark,
} from './Icons';

/* --------------------------- Детали сервера --------------------------- */
export function ServerDetailsModal() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const servers = useApp((s) => s.servers);
  const conn = useApp((s) => s.conn);
  const pingServer = useApp((s) => s.pingServer);
  const pingingIds = useApp((s) => s.pingingIds);
  const selectServer = useApp((s) => s.selectServer);
  const removeServer = useApp((s) => s.removeServer);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const toast = useApp((s) => s.toast);
  const openModal = useApp((s) => s.openModal);

  const server = servers.find((s) => s.id === modal?.serverId) ?? null;
  const open = modal?.name === 'serverDetails' && !!server;
  if (!server) return <Modal open={false} onClose={closeModal} title="" children={null} />;

  const q = qualityOf(server);
  const p = server.params;
  const rows: Array<[string, string]> = [
    ['Протокол', server.protocol.toUpperCase()],
    ['Адрес', `${server.host}:${server.port}`],
    ['Страна', server.country ? countryName(server.country, 'ru') : 'не определена'],
    ['Транспорт', p.transport.toUpperCase()],
  ];
  if (p.security) rows.push(['Шифрование', p.security.toUpperCase()]);
  if (p.flow) rows.push(['Flow', p.flow]);
  if (p.sni) rows.push(['SNI', p.sni]);
  if (p.fingerprint) rows.push(['Отпечаток', p.fingerprint]);
  if (p.publicKey) rows.push(['Reality pbk', `${p.publicKey.slice(0, 14)}…`]);
  if (p.alpn?.length) rows.push(['ALPN', p.alpn.join(', ')]);
  if (p.path) rows.push(['Path', p.path]);
  if (p.host) rows.push(['Host', p.host]);
  if (p.method) rows.push(['Метод', p.method]);
  if (server.pingedAt) rows.push(['Замер', formatDateTime(server.pingedAt)]);

  return (
    <Modal open={open} onClose={closeModal} title="Сервер" center>
      <div className="row-gap-8" style={{ gap: 12 }}>
        <Flag code={server.country} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{server.cleanName}</div>
          <div className="small dim">
            {server.city ?? countryName(server.country, 'ru')} · {server.protocol.toUpperCase()}
          </div>
        </div>
        <span className="badge badge--accent" title="Оценка качества">
          {q.grade === 'unknown' ? '—' : `${q.score}/100`}
        </span>
      </div>

      <div className="row-gap-8">
        <PingBadge ping={server.ping} measuring={pingingIds.includes(server.id)} dead={server.dead} />
        <button className="btn btn--sm btn--ghost" onClick={() => void pingServer(server.id)} disabled={pingingIds.includes(server.id)}>
          <IconRefresh width={14} height={14} />
          Замерить
        </button>
        {server.jitter != null && server.jitter > 0 && <span className="badge">джиттер {server.jitter} мс</span>}
        {server.favorite && <span className="badge badge--accent">избранное</span>}
      </div>

      <div className="kv">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div className="kv__k">{k}</div>
            <div className="kv__v">{v}</div>
          </div>
        ))}
      </div>

      <div className="field">
        <div className="field__label">Ссылка</div>
        <div className="code selectable">{server.uri.length > 260 ? `${server.uri.slice(0, 260)}…` : server.uri}</div>
      </div>

      <div className="row-gap-8">
        <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => void toggleFavorite(server.id)}>
          <IconSparkle width={14} height={14} />
          {server.favorite ? 'Убрать' : 'В избранное'}
        </button>
        <button
          className="btn btn--sm"
          style={{ flex: 1 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(server.uri);
              toast({ kind: 'success', title: 'Ссылка скопирована' });
            } catch {
              toast({ kind: 'warn', title: 'Буфер обмена недоступен' });
            }
          }}
        >
          <IconCopy width={14} height={14} />
          Копировать
        </button>
        <button
          className="btn btn--sm btn--danger"
          onClick={() =>
            openModal({
              name: 'confirm',
              title: 'Удалить сервер?',
              body: `«${server.cleanName}» будет удалён из списка. При обновлении подписки он вернётся.`,
              confirmLabel: 'Удалить',
              danger: true,
              onConfirm: () => void removeServer(server.id),
            })
          }
          aria-label="Удалить"
        >
          <IconTrash width={14} height={14} />
        </button>
      </div>

      <button
        className="btn btn--primary btn--block"
        onClick={() => {
          closeModal();
          void selectServer(server.id);
        }}
        disabled={conn.serverId === server.id && conn.status === 'connected'}
      >
        <IconZap width={16} height={16} />
        {conn.serverId === server.id && conn.status === 'connected' ? 'Уже подключено' : 'Подключиться'}
      </button>
    </Modal>
  );
}

/* ----------------------------- Обновление ----------------------------- */
export function UpdateModal() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const update = useApp((s) => s.update);
  const progress = useApp((s) => s.updateProgress);
  const downloadUpdate = useApp((s) => s.downloadUpdate);
  const installUpdate = useApp((s) => s.installUpdate);
  const info = useApp((s) => s.info);

  const open = modal?.name === 'update';
  const downloading = progress?.stage === 'downloading';
  const ready = progress?.stage === 'ready';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={update?.available ? `Обновление ${update.version}` : 'Обновления'}
      center
      icon={
        <div className="banner__icon" style={{ marginRight: 4 }}>
          <IconDownload />
        </div>
      }
      footer={
        update?.available ? (
          <>
            <button className="btn" style={{ flex: 1 }} onClick={closeModal}>
              Позже
            </button>
            {ready ? (
              <button className="btn btn--primary" style={{ flex: 1.3 }} onClick={() => void installUpdate()}>
                Установить и перезапустить
              </button>
            ) : (
              <button className="btn btn--primary" style={{ flex: 1.3 }} onClick={() => void downloadUpdate()} disabled={downloading}>
                {downloading ? `Загрузка ${Math.round(progress?.percent ?? 0)}%` : 'Скачать и установить'}
              </button>
            )}
          </>
        ) : (
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={closeModal}>
            Закрыть
          </button>
        )
      }
    >
      <div className="row-gap-8 small dim">
        <span>Установлено: v{info.version}</span>
        {update?.available && (
          <>
            <span className="dotsep" />
            <span className="accent">доступно: v{update.version}</span>
          </>
        )}
        {update?.size ? (
          <>
            <span className="dotsep" />
            <span>{formatBytes(update.size)}</span>
          </>
        ) : null}
      </div>

      {update?.publishedAt && <div className="small faint">Опубликовано {formatDate(Date.parse(update.publishedAt))}</div>}

      {update?.notes && (
        <div className="field">
          <div className="field__label">Что нового</div>
          <div className="card card--pad" style={{ maxHeight: 220, overflow: 'auto' }}>
            <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--text-dim)' }}>
              {update.notes.slice(0, 4000)}
            </div>
          </div>
        </div>
      )}

      {progress && progress.stage !== 'idle' && (
        <div className="col" style={{ gap: 6 }}>
          <div className="progress">
            <div className="progress__bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="small dim">{progress.message}</div>
        </div>
      )}

      {!update?.available && <div className="small dim">У вас последняя версия. Проверка выполняется автоматически при запуске.</div>}

      <div className="small faint">
        Обновления скачиваются напрямую с GitHub Releases и проверяются по размеру файла. Настройки и подписки сохраняются.
      </div>
    </Modal>
  );
}

/* --------------------------- Подтверждение --------------------------- */
export function ConfirmModal() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const open = modal?.name === 'confirm';
  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={modal?.title ?? 'Подтвердите действие'}
      center
      footer={
        <>
          <button className="btn" style={{ flex: 1 }} onClick={closeModal}>
            Отмена
          </button>
          <button
            className={`btn ${modal?.danger ? 'btn--danger' : 'btn--primary'}`}
            style={{ flex: 1 }}
            onClick={async () => {
              await modal?.onConfirm?.();
              closeModal();
            }}
          >
            {modal?.confirmLabel ?? 'ОК'}
          </button>
        </>
      }
    >
      <div className="small dim" style={{ lineHeight: 1.55 }}>
        {modal?.body}
      </div>
    </Modal>
  );
}

/* ---------------------------- Первый запуск --------------------------- */
export function Onboarding() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const settings = useApp((s) => s.settings);
  const save = useApp((s) => s.saveSettings);
  const openModal = useApp((s) => s.openModal);
  const [step, setStep] = useState(0);
  const open = modal?.name === 'onboarding';

  const finish = () => {
    localStorage.setItem('shuzu.onboarded', '1');
    closeModal();
  };

  return (
    <Modal
      open={open}
      onClose={finish}
      title={['Добро пожаловать', 'Источники серверов', 'Как подключаться'][step]}
      center
      footer={
        step < 2 ? (
          <>
            <button className="btn" style={{ flex: 1 }} onClick={finish}>
              Пропустить
            </button>
            <button className="btn btn--primary" style={{ flex: 1.2 }} onClick={() => setStep(step + 1)}>
              Далее
            </button>
          </>
        ) : (
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              finish();
              openModal({ name: 'addSub' });
            }}
          >
            Добавить подписку
          </button>
        )
      }
    >
      {step === 0 && (
        <div className="col center" style={{ alignItems: 'center', gap: 14, padding: '8px 0' }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 18 }}>
            <LogoMark size={78} />
          </motion.div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '0.16em' }}>SHUZU</div>
          <div className="small dim" style={{ maxWidth: 300, lineHeight: 1.55 }}>
            Быстрый и лёгкий VPN-клиент. Ядро уже внутри — ничего скачивать и настраивать не нужно.
          </div>
          <div className="col" style={{ gap: 8, width: '100%', marginTop: 4 }}>
            {[
              [<IconShield key="a" />, 'Поддержка VLESS, Reality, Hysteria2, Trojan, Shadowsocks'],
              [<IconZap key="b" />, 'Автовыбор самого быстрого сервера по пингу'],
              [<IconGlobe key="c" />, 'Диагностика и анализ блокировок провайдера'],
            ].map(([icon, text], i) => (
              <div className="row-gap-8" key={i} style={{ textAlign: 'left', fontSize: 12.5, color: 'var(--text-dim)' }}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="small dim" style={{ lineHeight: 1.55 }}>
            Серверы берутся из подписки вашего провайдера. Это может быть ссылка, QR-код или файл со списком серверов.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="btn btn--tall" style={{ opacity: 0.9, cursor: 'default' }}>
              <IconCopy />
              Буфер обмена
            </div>
            <div className="btn btn--tall" style={{ opacity: 0.9, cursor: 'default' }}>
              <IconQr />
              QR-код
            </div>
          </div>
          <div className="small faint">Дальше можно добавить вручную, файлом или по ссылке — через меню «⋮».</div>
        </div>
      )}

      {step === 2 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="field">
            <div className="field__label">Режим подключения</div>
            <Segmented
              value={settings.mode}
              onChange={(v) => void save({ mode: v })}
              options={[
                { value: 'tun', label: 'TUN (весь трафик)' },
                { value: 'proxy', label: 'Прокси' },
              ]}
            />
            <div className="small faint" style={{ marginTop: 2 }}>
              {settings.mode === 'tun'
                ? 'Нужны права администратора. Захватывает трафик всех программ.'
                : 'Работает без прав администратора, но только для программ, использующих системный прокси.'}
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-row__text">
                <div className="settings-row__title">Показывать уведомления</div>
                <div className="settings-row__sub">Статус подключения и ошибки</div>
              </div>
              <Switch checked={settings.notifications} onChange={(v) => void save({ notifications: v })} />
            </div>
            <div className="settings-row">
              <div className="settings-row__text">
                <div className="settings-row__title">Обходить локальные сайты</div>
                <div className="settings-row__sub">Банки и госуслуги — напрямую</div>
              </div>
              <Switch checked={settings.bypassLocal} onChange={(v) => void save({ bypassLocal: v })} />
            </div>
          </div>
          {isDesktop && (
            <div className="small faint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <IconLock width={13} height={13} style={{ marginTop: 3, flex: '0 0 auto' }} />
              Для режима TUN приложение может попросить перезапуск с правами администратора.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Демо-info ---------------------------- */
export function AboutModal() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const info = useApp((s) => s.info);
  const open = modal?.name === 'modePicker';
  return (
    <Modal open={open} onClose={closeModal} title="О SHUZU" center>
      <div className="kv">
        <div className="kv__k">Версия</div>
        <div className="kv__v">{info.version}</div>
        <div className="kv__k">Платформа</div>
        <div className="kv__v">
          {info.platform} / {info.arch}
        </div>
        <div className="kv__k">Ядро</div>
        <div className="kv__v">{info.coreVersion ?? 'нет'}</div>
        <div className="kv__k">Репозиторий</div>
        <div className="kv__v">{info.repo}</div>
      </div>
      <button className="btn btn--sm" onClick={() => window.open(`https://github.com/${info.repo}`, '_blank', 'noopener')}>
        <IconExternal width={14} height={14} />
        Открыть GitHub
      </button>
    </Modal>
  );
}
