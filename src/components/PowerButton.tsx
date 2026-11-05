/** Большая кнопка подключения с кольцами и свечением. */
import { motion } from 'framer-motion';
import type { ConnStatus } from '../../shared/types';
import { IconPower } from './Icons';

interface Props {
  status: ConnStatus;
  onClick: () => void;
  label: string;
}

export default function PowerButton({ status, onClick, label }: Props) {
  const connected = status === 'connected';
  const busy = status === 'connecting' || status === 'disconnecting';
  return (
    <motion.button
      type="button"
      className={`power${connected ? ' is-connected' : ''}${busy ? ' is-busy' : ''}`}
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.965 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      <span className="power__glow" />
      <span className="power__ring" />
      {connected && (
        <>
          <span className="power__pulse" />
          <span className="power__pulse" />
        </>
      )}
      {busy && <span className="power__spinner" />}
      <span className="power__icon">
        <IconPower width={56} height={56} strokeWidth={1.5} />
      </span>
    </motion.button>
  );
}
