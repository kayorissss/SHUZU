/** Настройки SHUZU. */
import { useState } from 'react';
import { useApp } from '../store';
import { getEngine, isDesktop } from '../engine';
import type { Settings as SettingsType } from '../../shared/types';
import ScreenHeader from '../components/ScreenHeader';
import { Segmented, SettingRow, Switch } from '../components/ui';
import { IconChevronRight, IconDownload, IconKey, IconLogout, IconPalette, IconRefresh, IconShield, IconSpeed, IconWifi } from '../components/Icons';

const ACCENT_LABELS: Array<{ value: SettingsType['accent']; label: string; color: string }> = [
  { value: 'mint', label: 'Мята', color: '#3EE0A8' },
  { value: 'ice', label: 'Лёд', color: '#58C7FF' },
  { value: 'violet', label: 'Фиалка', color: '#A98BFF' },
  { value: 'amber', label: 'Янтарь', color: '#FFC14D' },
];

export default function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const conn = useApp((s) => s.conn);
  const save = useApp((s) => s.saveSettings);
  const toast = useApp((s) => s.toast);
  const openModal = useApp((s) => s.openModal);
  const go = useApp((s) => s.go);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const api = getEngine();

  const set = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => void save({ [key]: value } as Partial<SettingsType>);

  const changeMode = async (mode: SettingsType['mode']) => {
    await save({ mode });
    if (conn.status === 'connected') {
      toast({ kind: 'info', title: 'Режим изменён', body: 'Переподключите туннель, чтобы применить режим.' });
    }
  };

  return (
    <>
      <ScreenHeader title="Настройки" back="profile" />

      <div className="section">
        <div className="settings-title">Подключение</div>
        <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-gap-8" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13.4, fontWeight: 500 }}>Режим работы</div>
              <div className="small dim" style={{ maxWidth: 300, marginTop: 2, lineHeight: 1.4 }}>
                {settings.mode === 'tun'
                  ? 'TUN — весь трафик компьютера идёт через туннель. Нужны права администратора.'
                  : 'Системный прокси — без прав администратора, охватывает программы, использующие настройки Windows.'}
              </div>
            </div>
          </div>
          <Segmented
            value={settings.mode}
            onChange={(v) => void changeMode(v)}
            options={[
              { value: 'tun', label: 'TUN' },
              { value: 'proxy', label: 'Системный прокси' },
            ]}
          />
        </div>

        <div className="settings-group" style={{ marginTop: 9 }}>
          <SettingRow title="Подключаться автоматически" sub="При запуске программы" right={<Switch checked={settings.autoConnect} onChange={(v) => set('autoConnect', v)} label="Автоподключение" />} />
          <SettingRow
            title="Автоматически выбирать лучший сервер"
            sub="По пингу и стабильности соединения"
            right={<Switch checked={settings.autoSelectFastest} onChange={(v) => set('autoSelectFastest', v)} label="Автовыбор" />}
          />
          <SettingRow
            title="Автопереключение при сбоях"
            sub="Если сервер перестал отвечать, SHUZU переключится на другой"
            right={<Switch checked={settings.autoSwitch} onChange={(v) => set('autoSwitch', v)} label="Автопереключение" />}
          />
          <SettingRow
            title="Kill Switch"
            sub="Блокировать интернет, если туннель оборвался (режим TUN)"
            right={<Switch checked={settings.killSwitch} onChange={(v) => set('killSwitch', v)} label="Kill switch" />}
          />
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="settings-title">Сеть и DNS</div>
        <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-gap-8">
            <IconWifi width={17} height={17} style={{ color: 'var(--muted)' }} />
            <div style={{ flex: 1, fontSize: 13.4, fontWeight: 500 }}>DNS-запросы</div>
          </div>
          <Segmented
            value={settings.dns}
            onChange={(v) => set('dns', v)}
            options={[
              { value: 'tunnel', label: 'Через туннель' },
              { value: 'system', label: 'Системный' },
              { value: 'custom', label: 'Свой' },
            ]}
          />
          {settings.dns === 'custom' && (
            <input
              className="input"
              value={settings.customDns}
              onChange={(e) => set('customDns', e.target.value)}
              placeholder="1.1.1.1 или https://dns.google/dns-query"
              spellCheck={false}
            />
          )}
          <div className="small dim" style={{ lineHeight: 1.45 }}>
            «Через туннель» надёжнее при блокировках: провайдер не видит и не подменяет DNS-ответы.
          </div>
        </div>

        <div className="settings-group" style={{ marginTop: 9 }}>
          <SettingRow
            title="Обходить локальные сайты"
            sub="Госуслуги, банки, ВК, Яндекс, Ozon — напрямую, мимо туннеля"
            right={<Switch checked={settings.bypassLocal} onChange={(v) => set('bypassLocal', v)} label="Обход локальных сайтов" />}
          />
          <SettingRow
            title="Блокировать рекламу и трекеры"
            sub="DNS-фильтрация внутри туннеля"
            right={<Switch checked={settings.blockAds} onChange={(v) => set('blockAds', v)} label="Блокировка рекламы" />}
          />
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="settings-title">Оформление</div>
        <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-gap-8">
            <IconPalette width={17} height={17} style={{ color: 'var(--muted)' }} />
            <div style={{ flex: 1, fontSize: 13.4, fontWeight: 500 }}>Тема</div>
          </div>
          <Segmented
            value={settings.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'dark', label: 'Тёмная' },
              { value: 'graphite', label: 'Графит' },
              { value: 'light', label: 'Светлая' },
            ]}
          />
          <div className="row-gap-8" style={{ justifyContent: 'space-between', marginTop: 2 }}>
            <div style={{ fontSize: 13.4, fontWeight: 500 }}>Акцент</div>
            <div className="row-gap-8">
              {ACCENT_LABELS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => set('accent', a.value)}
                  title={a.label}
                  aria-label={a.label}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 9,
                    background: a.color,
                    boxShadow: settings.accent === a.value ? `0 0 0 2px var(--bg-2), 0 0 0 4px ${a.color}` : 'none',
                    transition: 'box-shadow .2s',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="settings-group" style={{ marginTop: 9 }}>
          <SettingRow
            title="Анимация карты"
            sub="Приближение к стране сервера при подключении"
            right={<Switch checked={settings.mapAnimation} onChange={(v) => set('mapAnimation', v)} label="Анимация карты" />}
          />
          <SettingRow
            title="Язык интерфейса"
            right={
              <Segmented
                value={settings.language}
                onChange={(v) => set('language', v)}
                options={[
                  { value: 'ru', label: 'RU' },
                  { value: 'en', label: 'EN' },
                ]}
              />
            }
          />
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="settings-title">Приложение</div>
        <div className="settings-group">
          {isDesktop && (
            <>
              <SettingRow title="Запускать при входе в систему" right={<Switch checked={settings.launchAtLogin} onChange={(v) => set('launchAtLogin', v)} label="Автозапуск" />} />
              <SettingRow title="Свёрнутым в трей" sub="Не показывать окно при автозапуске" right={<Switch checked={settings.startMinimized} onChange={(v) => set('startMinimized', v)} label="Старт свёрнутым" />} />
              <SettingRow title="Сворачивать в трей при закрытии" sub="Программа продолжит работать в фоне" right={<Switch checked={settings.minimizeToTray} onChange={(v) => set('minimizeToTray', v)} label="Сворачивать в трей" />} />
            </>
          )}
          <SettingRow title="Уведомления" sub="Показывать статус подключения" right={<Switch checked={settings.notifications} onChange={(v) => set('notifications', v)} label="Уведомления" />} />
          <SettingRow title="Проверять обновления автоматически" sub="При запуске и раз в 6 часов" right={<Switch checked={settings.autoUpdateCheck} onChange={(v) => set('autoUpdateCheck', v)} label="Автообновления" />} />
          <SettingRow title="Тихий режим" sub="Не показывать всплывающие уведомления о подключении" right={<Switch checked={settings.quietMode} onChange={(v) => set('quietMode', v)} label="Тихий режим" />} />
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="settings-title">Проверки</div>
        <div className="settings-group">
          <SettingRow
            title="Автоматически проверять пинг"
            sub={`Раз в ${settings.pingIntervalSec} с, когда туннель выключен`}
            right={<Switch checked={settings.autoPing} onChange={(v) => set('autoPing', v)} label="Авто-пинг" />}
          />
          <SettingRow
            title="Интервал проверки пинга"
            value={
              <Segmented
                value={String(settings.pingIntervalSec) as '30' | '60' | '300' | '0'}
                onChange={(v) => set('pingIntervalSec', Number(v))}
                options={[
                  { value: '30', label: '30с' },
                  { value: '60', label: '1м' },
                  { value: '300', label: '5м' },
                  { value: '0', label: 'выкл' },
                ]}
              />
            }
          />
          <SettingRow
            title="Анализ блокировок при подключении"
            sub="Определять DPI-фильтрацию автоматически"
            right={<Switch checked={settings.autoCensorCheck} onChange={(v) => set('autoCensorCheck', v)} label="Авто-анализ" />}
          />
          <SettingRow title="Диагностика системы" sub="Найти причину, почему VPN не работает" value={<IconChevronRight width={15} height={15} />} onClick={() => go('diagnostics')} />
          <SettingRow title="Анализ блокировок" value={<IconChevronRight width={15} height={15} />} onClick={() => go('censor')} />
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="settings-title">Дополнительно</div>
        <div className="settings-group">
          <SettingRow
            title="Порты ядра"
            sub={`SOCKS ${settings.socksPort} · HTTP ${settings.httpPort} · Clash API внутренний`}
            value={<IconSpeed width={15} height={15} />}
          />
          {isDesktop && info.platform === 'win32' && (
            <SettingRow
              title="Перезапустить от администратора"
              sub={info.isAdmin ? 'Уже запущено с правами администратора' : 'Нужно для режима TUN и Kill Switch'}
              right={<Switch checked={info.isAdmin} onChange={() => void api.app.restartAsAdmin()} label="Права администратора" />}
            />
          )}
          <SettingRow
            title="Проверить обновления"
            sub={`Текущая версия ${info.version}`}
            value={<IconDownload width={15} height={15} />}
            onClick={() => void useApp.getState().checkUpdate()}
          />
          <SettingRow
            title="Резервная копия"
            sub="Сохранить серверы и настройки в файл"
            value={<IconKey width={15} height={15} />}
            onClick={async () => {
              const json = await api.app.exportBackup();
              if (json) {
                try {
                  await navigator.clipboard.writeText(json);
                  toast({ kind: 'success', title: 'Копия скопирована', body: 'JSON сохранён в буфер обмена.' });
                } catch {
                  toast({ kind: 'warn', title: 'Не удалось скопировать', body: 'Буфер обмена недоступен.' });
                }
              }
            }}
          />
          <SettingRow title="Восстановить из копии" value={<IconRefresh width={15} height={15} />} onClick={() => setImportOpen((v) => !v)} />
          {importOpen && (
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <textarea className="textarea" placeholder="Вставьте JSON резервной копии" value={importText} onChange={(e) => setImportText(e.target.value)} />
              <button
                className="btn btn--sm btn--primary"
                onClick={async () => {
                  const ok = await api.app.importBackup(importText);
                  toast(ok ? { kind: 'success', title: 'Восстановлено' } : { kind: 'error', title: 'Некорректный файл' });
                  setImportOpen(false);
                  setImportText('');
                  void useApp.getState().init();
                }}
              >
                Восстановить
              </button>
            </div>
          )}
          <SettingRow
            title="Выход"
            sub="Завершить работу SHUZU и отключить туннель"
            right={<IconLogout width={16} height={16} />}
            onClick={() =>
              openModal({
                name: 'confirm',
                title: 'Завершить SHUZU?',
                body: 'Туннель будет отключён, и трафик пойдёт напрямую.',
                confirmLabel: 'Завершить',
                danger: true,
                onConfirm: () => api.app.quit(),
              })
            }
          />
        </div>
      </div>

      <div className="center faint tiny" style={{ padding: '22px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <IconShield width={12} height={12} />
        SHUZU не ведёт журналов посещений и не собирает телеметрию
      </div>
    </>
  );
}
