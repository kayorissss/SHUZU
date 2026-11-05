/** Журнал ядра — для разбора проблем. */
import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { getEngine } from '../engine';
import type { LogLine } from '../../shared/types';
import ScreenHeader from '../components/ScreenHeader';
import { Empty } from '../components/ui';
import { IconBug, IconCopy, IconRefresh } from '../components/Icons';

export default function Logs() {
  const info = useApp((s) => s.info);
  const toast = useApp((s) => s.toast);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');

  const load = async () => {
    try {
      setLines(await getEngine().logs());
    } catch {
      setLines([]);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, []);

  const filtered = lines.filter((l) => (level === 'all' ? true : level === 'warn' ? l.level === 'warn' || l.level === 'error' : l.level === 'error'));

  return (
    <>
      <ScreenHeader
        title="Журнал"
        back="profile"
        actions={
          <>
            <button
              className="iconbtn"
              onClick={() => void load()}
              aria-label="Обновить"
            >
              <IconRefresh />
            </button>
            <button
              className="iconbtn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(filtered.map((l) => `${new Date(l.t).toISOString()} [${l.level}] ${l.msg}`).join('\n'));
                  toast({ kind: 'success', title: 'Журнал скопирован' });
                } catch {
                  toast({ kind: 'warn', title: 'Не удалось скопировать' });
                }
              }}
              aria-label="Копировать"
            >
              <IconCopy />
            </button>
          </>
        }
      />

      <div className="chips" style={{ marginBottom: 10 }}>
        {(['all', 'warn', 'error'] as const).map((v) => (
          <button key={v} className={`chip${level === v ? ' is-active' : ''}`} onClick={() => setLevel(v)}>
            {v === 'all' ? 'Всё' : v === 'warn' ? 'Важное' : 'Ошибки'}
          </button>
        ))}
        <div className="spacer" />
        <span className="small faint" style={{ alignSelf: 'center' }}>
          {info.platform} · ядро {info.coreVersion ?? 'нет'}
        </span>
      </div>

      {!filtered.length ? (
        <Empty icon={<IconBug />} title="Журнал пуст" text="Здесь появятся сообщения ядра sing-box, когда вы подключаетесь." />
      ) : (
        <div className="code selectable" style={{ maxHeight: 'none', fontSize: 11, lineHeight: 1.6 }}>
          {filtered.map((l, i) => (
            <div
              key={i}
              style={{
                color: l.level === 'error' ? '#ff6b6b' : l.level === 'warn' ? '#ffc14d' : 'var(--text-dim)',
                marginBottom: 3,
              }}
            >
              {new Date(l.t).toLocaleTimeString('ru-RU')} {l.msg}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
