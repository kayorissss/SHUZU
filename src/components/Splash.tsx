/** Плавная, недолгая заставка при запуске. */
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { LogoMark } from './Icons';
import { useApp } from '../store';

export default function Splash() {
  const finish = useApp((s) => s.finishSplash);
  const booted = useApp((s) => s.booted);

  useEffect(() => {
    const minTime = 1250;
    const started = performance.now();
    const tick = setInterval(() => {
      if (booted && performance.now() - started >= minTime) {
        clearInterval(tick);
        finish();
      }
      // страховка: не держим заставку дольше 4 секунд даже при ошибке инициализации
      if (performance.now() - started > 4000) {
        clearInterval(tick);
        finish();
      }
    }, 60);
    return () => clearInterval(tick);
  }, [booted, finish]);

  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="splash__inner">
        <motion.div
          className="splash__logo"
          initial={{ scale: 0.82, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        >
          <LogoMark size={92} />
        </motion.div>
        <motion.div
          className="splash__word"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5 }}
        >
          SHUZU
        </motion.div>
        <motion.div
          className="splash__sub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.34, duration: 0.4 }}
        >
          secure tunnel
        </motion.div>
        <div className="splash__bar">
          <i />
        </div>
      </div>
    </motion.div>
  );
}
