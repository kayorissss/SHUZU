/** Профиль: подписки, обслуживание, обновления, сведения о программе. */
import { useMemo } from 'react';
import { useApp } from '../store';
import { countryName } from '../../shared/countries';
import { daysLeft, formatBytes, formatDate, formatDateTime } from '../../shared/util';
import ScreenHeader from '../components/ScreenHeader';
import { Flag } from '../components/ui';
import {
  IconAlert,
  IconBell,
  IconBug,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconExternal,
  IconInfo,
  IconPlus,
  IconRadar,
  IconRefresh,
  IconServer,
  IconSettings,
  IconShield,
  IconSparkle,
  IconStethoscope,
  IconTrash,
  IconZap,
} from '../components/Icons';

export default function Profile() {
  const info = useApp((s) => s.info);
  const subs = useApp((s) => s.subs);
  const servers = useApp((s) => s.servers);
  const conn = useApp((s) => s.conn);
  const update = useApp((s) => s.update);
  const updateChecking = useApp((s) => s.updateChecking);
  const go = useApp((s) => s.go);
  const openModal = useApp((s) => s.openModal);
  const updateSubscriptions = useApp((s) => s.updateSubscriptions);
  const removeSubscription = useApp((s) => s.removeSubscription);
  const toggleSubscription = useApp((s) => s.toggleSubscription);
  const checkUpdate = useApp((s) => s.checkUpdate);

  const currentServer = servers.find((s) => s.id === conn.serverId);
  const totalTraffic = useMemo(() => {
    const used = subs.reduce((a, s) => a + (s.trafficUsed ?? 0), 0);
    const total = subs.reduce((a, s) => a + (s.trafficTotal ?? 0), 0);
    return { used, total };
  }, [subs]);

  return (
    <>
      <ScreenHeader
        title="Профиль"
        actions={
          <button className="iconbtn" onClick={() => go('settings')} aria-label="Настройки">
            <IconSettings />
          </button>
        }
      />

      <div className="profile-head">
        <div className="avatar">SZU</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="profile-head__name">
            SHUZU{' '}
            <span className="badge" style={{ marginLeft: 4 }}>
              v{info.version}
            </span>
          </div>
          <div className="profile-head__sub">
            {info.coreReady ? `ядро sing-box ${info.coreVersion ?? ''}` : info.demo ? 'демо-режим (браузер)' : 'ядро не найдено'}
            {info.isAdmin ? ' · права администратора' : ''}
          </div>
        </div>
      </div>

      {/* Статус соединения */}
      <div className="card card--pad" style={{ marginTop: 14 }}>
        <div className="row-gap-8" style={{ justifyContent: 'space-between' }}>
          <div className="row-gap-8">
            {currentServer ? <Flag code={currentServer.country} /> : <IconShield width={20} height={20} />}
            <div className="col">
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {conn.status === 'connected' ? currentServer?.cleanName ?? 'Подключено' : 'Соединение не активно'}
              </div>
              <div className="small dim">
                {conn.status === 'connected'
                  ? `Выход: ${countryName(conn.exitCountry, 'ru')}${conn.exitIp ? ` · ${conn.exitIp}` : ''}`
                  : 'Нажмите на кнопку питания на главном экране'}
              </div>
            </div>
          </div>
          {conn.status === 'connected' && <span className="badge badge--ok">защищено</span>}
        </div>
      </div>

      {/* Подписки */}
      <div className="section" style={{ marginTop: 18 }}>
        <div className="section__head">
          <div className="section__title">Подписки</div>
          <div className="section__spacer" />
          {subs.length > 0 && (
            <button className="linkbtn" onClick={() => void updateSubscriptions()}>
              <IconRefresh width={12} height={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              Обновить
            </button>
          )}
          <button className="iconbtn" onClick={() => openModal({ name: 'addSub' })} aria-label="Добавить подписку">
            <IconPlus />
          </button>
        </div>

        {subs.length === 0 ? (
          <div className="card card--pad" style={{ textAlign: 'center' }}>
            <div className="empty__title" style={{ marginBottom: 6 }}>
              Нет подписок
            </div>
            <div className="small dim" style={{ marginBottom: 12 }}>
              Добавьте ссылку от вашего провайдера — SHUZU сам подтянет серверы.
            </div>
            <button className="btn btn--primary btn--sm" onClick={() => openModal({ name: 'addSub' })}>
              <IconSparkle width={15} height={15} />
              Добавить подписку
            </button>
          </div>
        ) : (
          <div className="col" style={{ gap: 9 }}>
            {subs.map((sub) => {
              const percent = sub.trafficTotal ? Math.min(100, ((sub.trafficUsed ?? 0) / sub.trafficTotal) * 100) : null;
              const left = daysLeft(sub.expiresAt);
              return (
                <div className="sub-card" key={sub.id}>
                  <div className="sub-card__head">
                    <IconServer width={17} height={17} />
                    <div className="sub-card__name" title={sub.url ?? sub.name}>
                      {sub.name}
                    </div>
                    {sub.lastError && (
                      <span className="badge badge--danger" title={sub.lastError}>
                        <IconAlert width={11} height={11} />
                      </span>
                    )}
                    {left != null && left < 5 && <span className="badge badge--warn">{left >= 0 ? `${left} дн.` : 'истекла'}</span>}
                  </div>

                  {percent != null && (
                    <div className="traffic">
                      <div className="traffic__head">
                        <span>
                          {formatBytes(sub.trafficUsed)} из {formatBytes(sub.trafficTotal)}
                        </span>
                        <span>{Math.round(percent)}%</span>
                      </div>
                      <div className="progress">
                        <div className="progress__bar" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="sub-card__meta">
                    <span className="row-gap-6">
                      <IconServer width={12} height={12} /> {sub.serverCount} серверов
                    </span>
                    <span className="row-gap-6">
                      <IconClock width={12} height={12} /> {formatDateTime(sub.updatedAt)}
                    </span>
                    {sub.expiresAt && (
                      <span className="row-gap-6">
                        <IconBell width={12} height={12} /> до {formatDate(sub.expiresAt)}
                      </span>
                    )}
                  </div>

                  <div className="row-gap-8">
                    <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => void updateSubscriptions(sub.id)}>
                      <IconRefresh width={14} height={14} />
                      Обновить
                    </button>
                    <button
                      className={`btn btn--sm${sub.enabled ? '' : ' btn--ghost'}`}
                      onClick={() => void toggleSubscription(sub.id, !sub.enabled)}
                      title={sub.enabled ? 'Скрыть серверы подписки' : 'Показывать серверы подписки'}
                    >
                      {sub.enabled ? 'Вкл' : 'Выкл'}
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() =>
                        openModal({
                          name: 'confirm',
                          title: 'Удалить подписку?',
                          body: `Будут удалены все серверы подписки «${sub.name}».`,
                          confirmLabel: 'Удалить',
                          danger: true,
                          onConfirm: () => void removeSubscription(sub.id),
                        })
                      }
                      aria-label="Удалить подписку"
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalTraffic.total > 0 && (
          <div className="small faint" style={{ padding: '2px 4px' }}>
            Всего по подпискам: {formatBytes(totalTraffic.used)} / {formatBytes(totalTraffic.total)}
          </div>
        )}
      </div>

      {/* Сервис */}
      <div className="section" style={{ marginTop: 20 }}>
        <div className="section__title" style={{ padding: '0 2px 7px' }}>
          Обслуживание
        </div>
        <div className="settings-group">
          <button className="settings-row" onClick={() => go('diagnostics')}>
            <IconStethoscope width={18} height={18} style={{ color: 'var(--accent)' }} />
            <div className="settings-row__text">
              <div className="settings-row__title">Диагностика</div>
              <div className="settings-row__sub">Проверить ядро, сеть, DNS и найти причину, почему VPN не работает</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
          <button className="settings-row" onClick={() => go('censor')}>
            <IconRadar width={18} height={18} style={{ color: 'var(--accent)' }} />
            <div className="settings-row__text">
              <div className="settings-row__title">Анализ блокировок</div>
              <div className="settings-row__sub">Определить, глушат ли провайдер трафик и что именно режут</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
          <button className="settings-row" onClick={() => void checkUpdate()}>
            <IconDownload width={18} height={18} style={{ color: update?.available ? 'var(--accent)' : undefined }} />
            <div className="settings-row__text">
              <div className="settings-row__title">Обновления</div>
              <div className="settings-row__sub">
                {updateChecking
                  ? 'Проверяем…'
                  : update?.available
                    ? `Доступна версия ${update.version}`
                    : `Версия ${info.version} — последняя`}
              </div>
            </div>
            {update?.available ? <span className="badge badge--accent">new</span> : <ChevronRight />}
          </button>
          <button className="settings-row" onClick={() => openModal({ name: 'addSub' })}>
            <IconZap width={18} height={18} />
            <div className="settings-row__text">
              <div className="settings-row__title">Добавить серверы</div>
              <div className="settings-row__sub">Подписка, QR-код, файл или ручной ввод</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
        </div>
      </div>

      {/* О программе */}
      <div className="section" style={{ marginTop: 20 }}>
        <div className="section__title" style={{ padding: '0 2px 7px' }}>
          О программе
        </div>
        <div className="settings-group">
          <button className="settings-row" onClick={() => go('settings')}>
            <IconSettings width={18} height={18} />
            <div className="settings-row__text">
              <div className="settings-row__title">Настройки</div>
              <div className="settings-row__sub">Режим подключения, DNS, обход локальных сайтов, оформление</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
          <button className="settings-row" onClick={() => go('logs')}>
            <IconBug width={18} height={18} />
            <div className="settings-row__text">
              <div className="settings-row__title">Журнал ядра</div>
              <div className="settings-row__sub">Технический лог для разбора проблем</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
          <button className="settings-row" onClick={() => window.open(`https://github.com/${info.repo}`, '_blank', 'noopener')}>
            <IconExternal width={18} height={18} />
            <div className="settings-row__text">
              <div className="settings-row__title">Исходный код</div>
              <div className="settings-row__sub">github.com/{info.repo}</div>
            </div>
            <IconChevronRight width={16} height={16} className="settings-row__value" />
          </button>
        </div>
      </div>

      <div className="center faint tiny" style={{ padding: '22px 0 8px', lineHeight: 1.6 }}>
        SHUZU v{info.version} · {info.platform}/{info.arch}
        <br />
        Трафик шифруется на устройстве. Мы не ведём логи и не собираем статистику.
      </div>
    </>
  );
}

function ChevronRight() {
  return <IconChevronRight width={16} height={16} className="settings-row__value" />;
}
