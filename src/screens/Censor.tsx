/**
 * Анализ «глушилок»: доступны ли локальные и глобальные сервисы,
 * есть ли DPI-фильтрация и что с этим делать.
 */
import { motion } from 'framer-motion';
import { useApp } from '../store';
import { censorAdvice } from '../../shared/censor';
import { formatDateTime } from '../../shared/util';
import ScreenHeader from '../components/ScreenHeader';
import { Empty } from '../components/ui';
import { IconAlert, IconCheck, IconInfo, IconRadar, IconRefresh, IconShield, IconX, IconZap } from '../components/Icons';

const VERDICT_LABEL: Record<string, { title: string; color: string }> = {
  open: { title: 'Фильтрации нет', color: '#3ee0a8' },
  partial: { title: 'Частичная фильтрация', color: '#ffc14d' },
  filtered: { title: 'Трафик глушат', color: '#ff6b6b' },
  unknown: { title: 'Не удалось определить', color: '#85888f' },
};

export default function Censor() {
  const report = useApp((s) => s.censor);
  const running = useApp((s) => s.censorRunning);
  const run = useApp((s) => s.runCensor);
  const go = useApp((s) => s.go);
  const servers = useApp((s) => s.servers);
  const settings = useApp((s) => s.settings);

  const advice = report ? censorAdvice(report) : [];
  const verdict = report ? VERDICT_LABEL[report.verdict] : null;
  const score = report?.dpiScore ?? 0;

  return (
    <>
      <ScreenHeader
        title="Анализ блокировок"
        back="home"
        actions={
          <button className={`iconbtn${running ? ' is-accent' : ''}`} onClick={() => void run()} disabled={running} aria-label="Повторить проверку">
            <IconRefresh />
          </button>
        }
      />

      {!report && !running && (
        <Empty
          icon={<IconRadar />}
          title="Проверим, глушат ли интернет"
          text="SHUZU проверит доступность ВКонтакте, Госуслуг, Яндекса, а затем Google, Cloudflare, Apple, MIUI и других. Если работают только локальные — значит трафик фильтруют."
          action={
            <button className="btn btn--primary btn--sm" onClick={() => void run()} style={{ marginTop: 8 }}>
              Запустить анализ
            </button>
          }
        />
      )}

      {running && (
        <div className="col" style={{ gap: 12, paddingTop: 8 }}>
          <div className="gauge">
            <div className="gauge__head">
              <div className="gauge__num">—</div>
              <div className="gauge__label">Проверяем доступность сервисов…</div>
            </div>
            <div className="progress">
              <motion.div className="progress__bar" initial={{ width: '5%' }} animate={{ width: '92%' }} transition={{ duration: 4, ease: 'easeOut' }} />
            </div>
          </div>
          <div className="card">
            {['ВКонтакте', 'Госуслуги', 'Яндекс', 'Google', 'Cloudflare', 'Apple'].map((label, i) => (
              <div className="check check--running" key={label}>
                <div className="check__dot">
                  <IconInfo />
                </div>
                <div className="check__body">
                  <div className="check__title" style={{ opacity: 0.6 - i * 0.06 }}>
                    {label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && !running && verdict && (
        <>
          <div className="gauge">
            <div className="gauge__head">
              <div className="gauge__num" style={{ color: verdict.color }}>
                {score}
              </div>
              <div className="gauge__label">
                индекс фильтрации · <b style={{ color: verdict.color }}>{verdict.title}</b>
              </div>
            </div>
            <div className="gauge__bar">
              <motion.div
                className="gauge__fill"
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: `linear-gradient(90deg, #3ee0a8, ${score > 50 ? '#ff6b6b' : '#ffc14d'})` }}
              />
            </div>
            <div className="gauge__scale">
              <span>0 — открыто</span>
              <span>50 — DPI</span>
              <span>100 — блокировка</span>
            </div>
          </div>

          <div
            className="card card--pad"
            style={{
              marginTop: 10,
              borderColor: report.verdict === 'filtered' ? 'rgba(255,107,107,.32)' : undefined,
              background: report.verdict === 'filtered' ? 'rgba(255,107,107,.06)' : undefined,
            }}
          >
            <div className="row-gap-8" style={{ marginBottom: 7 }}>
              {report.verdict === 'open' ? (
                <IconCheck width={16} height={16} style={{ color: '#3ee0a8' }} />
              ) : (
                <IconAlert width={16} height={16} style={{ color: verdict.color }} />
              )}
              <div style={{ fontSize: 13.3, fontWeight: 600 }}>Вывод</div>
            </div>
            <div className="small" style={{ color: 'var(--text-dim)', lineHeight: 1.55 }}>
              {report.summary}
            </div>
          </div>

          <div className="section" style={{ marginTop: 16 }}>
            <div className="section__title" style={{ padding: '0 2px 8px' }}>
              Проверенные сервисы
            </div>
            <div className="probe-grid">
              {report.probes.map((p, i) => (
                <motion.div
                  className={`probe probe--${p.ok ? 'ok' : 'fail'}`}
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  title={p.error ?? (p.ok ? 'Доступен' : 'Недоступен')}
                >
                  <span className="probe__dot" />
                  <span className="probe__label">{p.label}</span>
                  <span className="probe__ms">{p.ok ? `${p.ms ?? '—'} мс` : '—'}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {advice.length > 0 && (
            <div className="section" style={{ marginTop: 16 }}>
              <div className="section__title" style={{ padding: '0 2px 8px' }}>
                Что делать
              </div>
              <div className="advice">
                {advice.map((a, i) => (
                  <div className="advice__item" key={i}>
                    <div className="advice__num">{i + 1}</div>
                    <div>{a}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.verdict === 'filtered' && (
            <div className="card card--pad" style={{ marginTop: 12 }}>
              <div className="row-gap-8" style={{ marginBottom: 6 }}>
                <IconZap width={15} height={15} style={{ color: 'var(--accent)' }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Почему «Запрет + Варп» работают, а обычный VPN — нет</div>
              </div>
              <div className="small dim" style={{ lineHeight: 1.55 }}>
                WARP маскируется под обычный HTTPS-трафик Cloudflare, а «Запрет» обходит DPI на уровне фрагментации TLS.
                Классические OpenVPN/WireGuard (и многие клиенты по умолчанию) палятся по сигнатуре и порту. В SHUZU выбирайте
                серверы с <b>VLESS + Reality</b> или <b>Hysteria2</b>: они неотличимы от обычного сайта.
              </div>
            </div>
          )}

          <div className="row-gap-8" style={{ marginTop: 16 }}>
            <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => go('servers')}>
              <IconShield width={15} height={15} />
              Выбрать сервер
            </button>
            <button className="btn btn--sm" style={{ flex: 1 }} onClick={() => go('settings')}>
              <IconInfo width={15} height={15} />
              DNS: {settings.dns === 'tunnel' ? 'через туннель' : settings.dns === 'system' ? 'системный' : 'свой'}
            </button>
          </div>

          <div className="center faint tiny" style={{ padding: '16px 0 6px', lineHeight: 1.6 }}>
            Проверено {formatDateTime(report.createdAt)} · серверов в списке: {servers.length}
            <br />
            Анализ выполняется с вашего устройства и не отправляет данные на наши серверы.
          </div>
        </>
      )}

      {!report && running && (
        <div className="center faint tiny" style={{ padding: 20 }}>
          <IconX width={14} height={14} /> Не закрывайте экран — проверка занимает несколько секунд
        </div>
      )}
    </>
  );
}
