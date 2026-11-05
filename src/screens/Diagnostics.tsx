/**
 * Диагностика: почему VPN не работает именно на этом устройстве.
 * Показывает проверки по группам, объясняет причину и что делать.
 */
import { motion } from 'framer-motion';
import { useApp } from '../store';
import { getEngine, isDesktop } from '../engine';
import { formatDateTime } from '../../shared/util';
import type { DiagCheck } from '../../shared/types';
import ScreenHeader from '../components/ScreenHeader';
import { Empty, ScoreRing } from '../components/ui';
import { IconAlert, IconCheck, IconCopy, IconInfo, IconRadar, IconRefresh, IconShield, IconStethoscope, IconX } from '../components/Icons';

const GROUP_TITLES: Record<DiagCheck['group'], string> = {
  core: 'Ядро и туннель',
  network: 'Сеть',
  system: 'Система',
  dns: 'DNS',
  security: 'Безопасность',
};

const GROUP_ORDER: Array<DiagCheck['group']> = ['core', 'network', 'system', 'dns', 'security'];

function StatusIcon({ status }: { status: DiagCheck['status'] }) {
  if (status === 'ok') return <IconCheck />;
  if (status === 'warn') return <IconAlert />;
  if (status === 'fail') return <IconX />;
  if (status === 'running') return <IconRefresh className="spin" />;
  return <IconInfo />;
}

export default function Diagnostics() {
  const diag = useApp((s) => s.diag);
  const running = useApp((s) => s.diagRunning);
  const run = useApp((s) => s.runDiagnostics);
  const go = useApp((s) => s.go);
  const info = useApp((s) => s.info);
  const toast = useApp((s) => s.toast);

  const copyReport = async () => {
    if (!diag) return;
    const lines = [
      `SHUZU ${info.version} · ${info.platform}/${info.arch} · ${formatDateTime(diag.createdAt)}`,
      `Оценка: ${diag.score}/100 (${diag.verdict})`,
      diag.summary,
      '',
      ...diag.checks.map((c) => `[${c.status.toUpperCase()}] ${c.title}: ${c.detail}${c.fix ? ` → ${c.fix}` : ''}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ kind: 'success', title: 'Отчёт скопирован' });
    } catch {
      toast({ kind: 'warn', title: 'Не удалось скопировать отчёт' });
    }
  };

  const checksByGroup = (group: DiagCheck['group']) => diag?.checks.filter((c) => c.group === group) ?? [];
  const fails = diag?.checks.filter((c) => c.status === 'fail') ?? [];

  return (
    <>
      <ScreenHeader
        title="Диагностика"
        back="profile"
        actions={
          <button className={`iconbtn${running ? ' is-accent' : ''}`} onClick={() => void run()} disabled={running} aria-label="Запустить проверку">
            <IconRefresh />
          </button>
        }
      />

      {!diag && !running && (
        <Empty
          icon={<IconStethoscope />}
          title="Проверим, что мешает VPN"
          text="SHUZU проверит ядро, сеть, DNS, маршруты, брандмауэр, время и конфликты с другими VPN — и объяснит, что именно исправить."
          action={
            <button className="btn btn--primary btn--sm" onClick={() => void run()} style={{ marginTop: 8 }}>
              Начать проверку
            </button>
          }
        />
      )}

      {running && (
        <div className="col" style={{ gap: 10, paddingTop: 6 }}>
          <div className="score">
            <div className="score__ring" style={{ display: 'grid', placeItems: 'center' }}>
              <IconRefresh width={26} height={26} className="spin" />
            </div>
            <div className="score__text">
              <div className="score__title">Проверяем систему…</div>
              <div className="score__sub">Проверки сети и ядра занимают несколько секунд</div>
            </div>
          </div>
          <div className="card">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="check check--running" key={i}>
                <div className="check__dot">
                  <IconInfo />
                </div>
                <div className="check__body">
                  <div className="check__title" style={{ opacity: 0.5 - i * 0.07 }}>
                    Проверка {i + 1}…
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diag && !running && (
        <>
          <div className="score">
            <ScoreRing score={diag.score} />
            <div className="score__text">
              <div className="score__title">
                {diag.verdict === 'healthy' ? 'Проблем не найдено' : diag.verdict === 'degraded' ? 'Есть замечания' : 'Найдена причина'}
              </div>
              <div className="score__sub">{diag.summary}</div>
            </div>
          </div>

          {fails.length > 0 && (
            <div className="card card--pad" style={{ marginTop: 10, borderColor: 'rgba(255,107,107,.3)', background: 'rgba(255,107,107,.06)' }}>
              <div className="row-gap-8" style={{ marginBottom: 8 }}>
                <IconAlert width={16} height={16} style={{ color: '#ff6b6b' }} />
                <div style={{ fontSize: 13.3, fontWeight: 600 }}>Что делать прямо сейчас</div>
              </div>
              <div className="advice">
                {fails.slice(0, 4).map((c, i) => (
                  <div className="advice__item" key={c.id}>
                    <div className="advice__num">{i + 1}</div>
                    <div>
                      <b>{c.title}.</b> {c.fix ?? c.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {GROUP_ORDER.map((group) => {
            const list = checksByGroup(group);
            if (!list.length) return null;
            return (
              <div className="section" key={group} style={{ marginTop: 16 }}>
                <div className="settings-title">{GROUP_TITLES[group]}</div>
                <div className="card">
                  {list.map((c, i) => (
                    <motion.div
                      className={`check check--${c.status}`}
                      key={c.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="check__dot">
                        <StatusIcon status={c.status} />
                      </div>
                      <div className="check__body">
                        <div className="check__title">{c.title}</div>
                        <div className="check__detail">{c.detail}</div>
                        {c.fix && (c.status === 'fail' || c.status === 'warn') && <div className="check__fix">{c.fix}</div>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="row-gap-8" style={{ marginTop: 16 }}>
            {isDesktop && info.platform === 'win32' && !info.isAdmin && (
              <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => void getEngine().app.restartAsAdmin()}>
                <IconShield width={15} height={15} />
                От администратора
              </button>
            )}
            <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => go('censor')}>
              <IconRadar width={15} height={15} />
              Блокировки
            </button>
            <button className="btn btn--sm" onClick={() => void copyReport()}>
              <IconCopy width={15} height={15} />
            </button>
          </div>

          <div className="center faint tiny" style={{ padding: '16px 0 6px' }}>
            Проверка выполнена {formatDateTime(diag.createdAt)}
          </div>
        </>
      )}
    </>
  );
}
