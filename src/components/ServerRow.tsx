/** Строка сервера в списке. */
import { motion } from 'framer-motion';
import type { Server } from '../../shared/types';
import { countryName } from '../../shared/countries';
import { qualityOf } from '../../shared/quality';
import { Flag, PingBadge, StarButton } from './ui';
import { IconChevronRight, IconZap } from './Icons';

interface Props {
  server: Server;
  selected: boolean;
  measuring?: boolean;
  onClick: () => void;
  onStar: () => void;
  onInfo?: () => void;
  showCountryName?: boolean;
  index?: number;
}

const PROTO_LABEL: Record<string, string> = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'SS',
  shadowsocksr: 'SSR',
  hysteria2: 'HY2',
  tuic: 'TUIC',
  wireguard: 'WG',
  socks: 'SOCKS',
  http: 'HTTP',
  unknown: '???',
};

export default function ServerRow({ server, selected, measuring, onClick, onStar, onInfo, showCountryName, index = 0 }: Props) {
  const ping = server.tunnelPing ?? server.ping;
  const q = qualityOf(server);
  const subtitle = [server.city, showCountryName ? countryName(server.country, 'ru') : null]
    .filter(Boolean)
    .join(', ') || countryName(server.country, 'ru');

  return (
    <motion.div
      className={`row${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.018, 0.25), duration: 0.22 }}
      style={{ cursor: 'pointer' }}
    >
      <Flag code={server.country} />
      <div className="row__main">
        <div className="row__title">
          {server.cleanName}
          {q.grade === 'excellent' && (
            <span title="Отличный сервер" style={{ marginLeft: 6, color: 'var(--accent)', display: 'inline-flex', verticalAlign: '-2px' }}>
              <IconZap width={12} height={12} />
            </span>
          )}
        </div>
        <div className="row__sub">
          {subtitle}
          {server.dead ? ' · недоступен' : ''}
        </div>
      </div>
      <div className="row__side">
        <span className="proto" title={PROTO_LABEL[server.protocol]}>
          {PROTO_LABEL[server.protocol] ?? server.protocol}
        </span>
        <PingBadge ping={ping} measuring={measuring} dead={server.dead} />
        <StarButton on={server.favorite} onClick={onStar} />
        {onInfo && (
          <button
            className="star"
            onClick={(e) => {
              e.stopPropagation();
              onInfo();
            }}
            aria-label="Подробнее"
          >
            <IconChevronRight />
          </button>
        )}
      </div>
    </motion.div>
  );
}
