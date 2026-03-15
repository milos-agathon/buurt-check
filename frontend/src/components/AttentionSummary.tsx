import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttentionSummaryState } from '../utils/attentionSummary';
import './AttentionSummary.css';

interface Props {
  summary?: AttentionSummaryState | null;
  error?: string | null;
  onRetry?: () => void;
}

function AttentionSummary({ summary, error, onRetry }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (!summary && !error) return null;

  const flags = summary?.flags ?? [];
  const assessed = summary?.assessed ?? 0;
  const total = summary?.total ?? 0;
  const missing = Math.max(0, total - assessed);
  const count = flags.length;
  const badgeVariant = count === 0 ? 'green' : count === 1 ? 'amber' : 'red';

  const badgeText = count === 0
    ? t('warnings.attention.no_flags')
    : count === 1
      ? t('warnings.attention.one_item', { count: 1 })
      : t('warnings.attention.items_attention', { count });

  return (
    <div className={`attention-summary attention-summary--${badgeVariant}`} data-testid="attention-summary">
      <button
        type="button"
        className="attention-summary__toggle"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
        aria-controls="attention-details"
      >
        <span className={`attention-summary__badge attention-summary__badge--${badgeVariant}`}>
          {badgeText}
        </span>
        <svg
          className={`attention-summary__chevron${expanded ? ' attention-summary__chevron--expanded' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div id="attention-details" className="attention-summary__details">
          {error && (
            <div className="attention-summary__error" data-testid="attention-error">
              <span>{error}</span>
              {onRetry && (
                <button
                  type="button"
                  className="app__retry-button attention-summary__retry"
                  onClick={onRetry}
                >
                  {t('error.retry', 'Retry')}
                </button>
              )}
            </div>
          )}

          {flags.length > 0 && (
            <ul className="attention-summary__flags" data-testid="attention-flags">
              {flags.map((flag) => (
                <li
                  key={`${flag.category}-${flag.severity}`}
                  className={`attention-summary__flag attention-summary__flag--${flag.severity}`}
                >
                  {t(`risk.category.${flag.category}`, {
                    defaultValue: t(`warnings.attention.flag.${flag.category}`, {
                      defaultValue: flag.label,
                    }),
                  })}
                </li>
              ))}
            </ul>
          )}

          {flags.length === 0 && (assessed > 0 || total === 0) && (
            <span className="attention-summary__detail" data-testid="attention-detail">
              {t('warnings.attention.no_flags_detail')}
            </span>
          )}

          {missing > 0 && (
            <span className="attention-summary__missing" data-testid="attention-missing">
              {t('warnings.attention.missing_categories', { missing, total })}
            </span>
          )}

          {total > 0 && (
            <span className="attention-summary__completeness">
              {t('warnings.attention.based_on', { assessed, total })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(AttentionSummary);
