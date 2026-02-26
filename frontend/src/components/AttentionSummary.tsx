import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LivabilityResponse, RiskCardsResponse, PropertyWarningsResponse } from '../types/api';
import './AttentionSummary.css';

interface Props {
  riskCards?: RiskCardsResponse;
  warnings?: PropertyWarningsResponse;
  sunlightScore?: number;
  livability?: LivabilityResponse | null;
}

interface Flag {
  category: string;
  severity: 'critical' | 'elevated' | 'high' | 'medium' | 'info';
}

function computeFlags(
  riskCards: RiskCardsResponse | undefined,
  warnings: PropertyWarningsResponse | undefined,
  sunlightScore: number | undefined,
  _livability: LivabilityResponse | null | undefined,
): { flags: Flag[]; assessed: number } {
  const flags: Flag[] = [];
  let assessed = 0;

  // Risk scores
  const scores: Record<string, number | undefined> = {};
  if (riskCards) {
    scores.noise = riskCards.noise.score;
    scores.air_quality = riskCards.air_quality.score;
    scores.climate = riskCards.climate_stress.score;
  }
  scores.sunlight = sunlightScore;

  for (const [cat, score] of Object.entries(scores)) {
    if (score == null) continue;
    assessed += 1;
    if (score < 30) {
      flags.push({ category: cat, severity: 'critical' });
    } else if (score < 50) {
      flags.push({ category: cat, severity: 'elevated' });
    }
  }

  if (warnings) {
    // Foundation risk
    if (warnings.foundation_risk.level === 'high') {
      flags.push({ category: 'foundation', severity: 'high' });
    } else if (warnings.foundation_risk.level === 'medium') {
      flags.push({ category: 'foundation', severity: 'medium' });
    }

    // Erfpacht
    if (warnings.erfpacht.detected) {
      flags.push({ category: 'erfpacht', severity: 'info' });
    }

    // VvE
    if (warnings.vve.is_apartment) {
      flags.push({ category: 'vve', severity: 'info' });
    }

    // Asbestos — only flag for pre-1980 (extensive structural use)
    const year = warnings.asbestos.construction_year;
    if (warnings.asbestos.flagged && year != null && year < 1980) {
      flags.push({ category: 'asbestos', severity: 'info' });
    }

    // Lead pipe — pre-1960 construction
    if (warnings.lead_pipe?.flagged) {
      flags.push({ category: 'lead_pipe', severity: 'info' });
    }
  }

  // Livability — deliberately NOT flagged per v7 design spec (lines 254-261).
  // The livability prop is accepted for future use but does not contribute to flags.

  return { flags, assessed };
}

function AttentionSummary({ riskCards, warnings, sunlightScore, livability }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const { flags, assessed } = useMemo(
    () => computeFlags(riskCards, warnings, sunlightScore, livability),
    [riskCards, warnings, sunlightScore, livability],
  );

  // Don't render if no data at all
  if (!riskCards && !warnings) return null;

  const total = 4;
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
