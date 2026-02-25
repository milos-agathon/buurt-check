import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './ContextualTooltip.css';

interface ContextualTooltipProps {
  message: string;
  onDismiss: () => void;
  position?: 'above' | 'below';
}

const AUTO_DISMISS_MS = 8000;

export default function ContextualTooltip({
  message,
  onDismiss,
  position = 'below',
}: ContextualTooltipProps) {
  const { t } = useTranslation();
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    timeoutRef.current = window.setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [onDismiss]);

  return (
    <div
      className={`contextual-tooltip contextual-tooltip--${position}`}
      role="status"
      aria-live="polite"
    >
      <span className={`contextual-tooltip__arrow contextual-tooltip__arrow--${position}`} aria-hidden="true" />
      <span className="contextual-tooltip__message">{message}</span>
      <button
        type="button"
        className="contextual-tooltip__dismiss"
        onClick={onDismiss}
        aria-label={t('tooltip.dismiss', 'Dismiss')}
      >
        &times;
      </button>
    </div>
  );
}
