/** Липкая шапка экрана с заголовком, «назад» и действиями. */
import type { ReactNode } from 'react';
import { useApp } from '../store';
import { IconChevronLeft } from './Icons';

export default function ScreenHeader({
  title,
  wordmark,
  back,
  actions,
  onBack,
}: {
  title?: string;
  wordmark?: boolean;
  back?: string;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  const go = useApp((s) => s.go);
  return (
    <div className="header">
      {back && (
        <button
          className="iconbtn"
          onClick={() => (onBack ? onBack() : go(back as never))}
          aria-label="Назад"
          style={{ marginLeft: -8 }}
        >
          <IconChevronLeft />
        </button>
      )}
      {wordmark ? <div className="header__wordmark">SHUZU</div> : <div className="header__title">{title}</div>}
      <div className="header__spacer" />
      {actions}
    </div>
  );
}
