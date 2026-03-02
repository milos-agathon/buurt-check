import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RiskCardsResponse } from '../types/api';
import './AttentionSummary.css';

interface Props {
  riskCards?: RiskCardsResponse;
}

interface Flag {
  category: string;
  severity: 'critical' | 'elevated' | 'high' | 'medium' | 'info';
}

function computeFlags(
  riskCards: RiskCardsResponse | undefined,
): { flags: Flag[]; assessed: number } {
  const flags: Flag[] = [];
  let assessed = 0;

  const scores: Record<string, number | undefined> = {};
  if (riskCards) {
    scores.noise = riskCards.noise.score;
    scores.air_quality = riskCards.air_quality.score;
    scores.climate = riskCards.climate_stress.score;
  }

  for (const [cat, score] of Object.entries(scores)) {
    if (score == null) continue;
    assessed += 1;
    if (score < 30) {
      flags.push({ category: cat, severity: 'critical' });
    } else if (score < 50) {
      flags.push({ category: cat, severity: 'elevated' });
    }
  }

  return { flags, assessed };
}

function AttentionSummary({
  riskCards,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const { flags, assessed } = useMemo(
    () => computeFlags(riskCards),
    [riskCards],
  );

  // Don't render if no data at all
  if (!riskCards) return null;

  const total = 3;
  const missing = total - assessed;
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
          {flags.length > 0 && (
            <ul className="attention-summary__flags" data-testid="attention-flags">
              {flags.map((f) => (
                <li key={f.category} className={`attention-summary__flag attention-summary__flag--${f.severity}`}>
                  {t(`risk.category.${f.category}`, {
                    defaultValue: t(`warnings.attention.flag.${f.category}`, {
                      defaultValue: f.category,
                    }),
                  })}
                </li>
              ))}
            </ul>
          )}

          {flags.length === 0 && assessed > 0 && (
            <span className="attention-summary__detail" data-testid="attention-detail">
              {t('warnings.attention.no_flags_detail')}
            </span>
          )}

          {missing > 0 && (
            <span className="attention-summary__missing" data-testid="attention-missing">
              {t('warnings.attention.missing_categories', { missing, total })}
            </span>
          )}

          <span className="attention-summary__completeness">
            {t('warnings.attention.based_on', { assessed, total })}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(AttentionSummary);
