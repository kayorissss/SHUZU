/**
 * Добавление подписки: две основные кнопки (буфер обмена, QR) и меню «⋮»
 * с ручным вводом, файлом и ссылкой.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { isSubscriptionUrl } from '../../shared/subscription';
import { Modal } from './ui';
import QrScanner from './QrScanner';
import { IconClipboard, IconDots, IconFile, IconKey, IconQr, IconSparkle, IconX } from './Icons';

type Mode = 'main' | 'manual' | 'url';

export default function AddSubscription() {
  const modal = useApp((s) => s.modal);
  const closeModal = useApp((s) => s.closeModal);
  const addSubscription = useApp((s) => s.addSubscription);
  const toast = useApp((s) => s.toast);

  const [mode, setMode] = useState<Mode>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const open = modal?.name === 'addSub';

  useEffect(() => {
    if (!open) {
      setMode('main');
      setText('');
      setUrl('');
      setMenuOpen(false);
      setScanning(false);
      setBusy(false);
    }
  }, [open]);

  const submit = async (payload: { name?: string; url?: string; content?: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      const { added } = await addSubscription(payload);
      if (added > 0) {
        toast({ kind: 'success', title: 'Подписка добавлена', body: `Серверов: ${added}` });
        closeModal();
      } else {
        toast({ kind: 'warn', title: 'Серверы не найдены', body: 'Проверьте формат: ссылки vless://, ss://, trojan:// или base64-подписка.' });
      }
    } catch (e) {
      toast({ kind: 'error', title: 'Не удалось добавить', body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handlePayload = async (payload: string, source: string) => {
    const value = payload.trim();
    if (!value) {
      toast({ kind: 'warn', title: 'Пусто', body: `${source}: нет данных.` });
      return;
    }
    if (isSubscriptionUrl(value)) {
      await submit({ url: value });
    } else {
      await submit({ content: value });
    }
  };

  const fromClipboard = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) {
        toast({ kind: 'warn', title: 'Буфер обмена пуст', body: 'Скопируйте ссылку подписки и попробуйте снова.' });
        return;
      }
      await handlePayload(value, 'Буфер обмена');
    } catch {
      setMode('manual');
      toast({ kind: 'info', title: 'Браузер не дал доступ к буферу', body: 'Вставьте содержимое вручную (Ctrl+V).' });
    }
  };

  const onFile = async (file: File) => {
    try {
      const value = await file.text();
      await handlePayload(value, file.name);
    } catch (e) {
      toast({ kind: 'error', title: 'Не удалось прочитать файл', body: String(e) });
    }
  };

  if (scanning) {
    return (
      <QrScanner
        onClose={() => setScanning(false)}
        onResult={(value) => {
          setScanning(false);
          if (/^https?:\/\//i.test(value) || /:\/\//.test(value)) void handlePayload(value, 'QR-код');
          else if (/^[A-Za-z0-9+/=_\-\s]{40,}$/.test(value)) void handlePayload(value, 'QR-код');
          else {
            setText(value);
            setMode('manual');
            toast({ kind: 'warn', title: 'Это не похоже на подписку', body: 'Проверьте содержимое и сохраните вручную.' });
          }
        }}
      />
    );
  }

  return (
    <Modal open={open} onClose={closeModal} title={mode === 'main' ? 'Добавить подписку' : mode === 'manual' ? 'Ссылки вручную' : 'Ссылка подписки'}>
      {mode === 'main' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
            <button className="btn btn--tall" onClick={() => void fromClipboard()} disabled={busy}>
              <IconClipboard />
              Из буфера обмена
            </button>
            <button className="btn btn--tall" onClick={() => setScanning(true)} disabled={busy}>
              <IconQr />
              QR-код
            </button>
            <button
              className="iconbtn"
              style={{ position: 'absolute', top: -46, right: 0, width: 34, height: 34 }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Другие способы"
            >
              <IconDots />
            </button>
            {menuOpen && (
              <div className="menu" style={{ top: -44, right: 40, left: 'auto', minWidth: 200 }}>
                <button
                  className="menu__item"
                  onClick={() => {
                    setMenuOpen(false);
                    setMode('manual');
                  }}
                >
                  <IconKey /> Вставить вручную
                </button>
                <button
                  className="menu__item"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  <IconFile /> Из файла
                </button>
                <button
                  className="menu__item"
                  onClick={() => {
                    setMenuOpen(false);
                    setMode('url');
                  }}
                >
                  <IconSparkle /> По ссылке
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".txt,.json,.yaml,.yml,.conf,.ovpn,text/plain,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />

          <div className="card card--pad" style={{ background: 'var(--surface)' }}>
            <div className="small dim" style={{ lineHeight: 1.55 }}>
              Поддерживаются ссылки <b>vless</b>, <b>vmess</b>, <b>trojan</b>, <b>shadowsocks</b>, <b>hysteria2</b>, <b>tuic</b>,
              а также Clash/YAML и sing-box JSON. Можно вставить как готовую ссылку подписки, так и список серверов.
            </div>
          </div>

          <button className="btn btn--sm" onClick={() => setScanning(true)}>
            <IconQr width={15} height={15} />
            Сканировать QR с экрана другого устройства
          </button>
        </>
      )}

      {mode === 'manual' && (
        <>
          <div className="field">
            <label className="field__label" htmlFor="sub-manual">
              Ссылки на серверы
            </label>
            <textarea
              id="sub-manual"
              className="textarea"
              placeholder={'vless://uuid@server:443?…#Название\nss://…\ntrojan://…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="row-gap-8">
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => void handlePayload(text, 'Ручной ввод')} disabled={busy || !text.trim()}>
              Добавить
            </button>
            <button className="btn" onClick={() => setMode('main')}>
              <IconX width={15} height={15} />
            </button>
          </div>
        </>
      )}

      {mode === 'url' && (
        <>
          <div className="field">
            <label className="field__label" htmlFor="sub-url">
              Ссылка подписки
            </label>
            <input
              id="sub-url"
              className="input"
              placeholder="https://provider.example/sub/xxxxxxxx"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              inputMode="url"
            />
          </div>
          <div className="small dim">SHUZU будет периодически обновлять подписку и забирать новые серверы.</div>
          <div className="row-gap-8">
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => void submit({ url: url.trim() })} disabled={busy || !url.trim()}>
              Добавить по ссылке
            </button>
            <button className="btn" onClick={() => setMode('main')}>
              <IconX width={15} height={15} />
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
