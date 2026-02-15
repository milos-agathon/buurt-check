import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RiskCardsResponse, PropertyWarningsResponse } from '../types/api';
import './AttentionSummary.css';

interface Props {
  riskCards?: RiskCardsResponse;
  warnings?: PropertyWarningsResponse;
  sunlightScore?: number;
}

interface Flag {
  category: string;
  severity: 'critical' | 'elevated' | 'high' | 'medium' | 'info';
  label: string;
}

function computeFlags(
  riskCards: RiskCardsResponse | undefined,
  warnings: PropertyWarningsResponse | undefined,
  sunlightScore: number | undefined,
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

  const categoryLabels: Record<string, string> = {
    noise: 'noise risk',
    air_quality: 'air quality risk',
    climate: 'climate risk',
    sunlight: 'sunlight risk',
  };

  for (const [cat, score] of Object.entries(scores)) {
    if (score == null) continue;
    assessed += 1;
    if (score < 30) {
      flags.push({ category: cat, severity: 'critical', label: `Critical ${categoryLabels[cat]}` });
    } else if (score < 50) {
      flags.push({ category: cat, severity: 'elevated', label: `Elevated ${categoryLabels[cat]}` });
    }
  }

  if (warnings) {
    // Foundation risk
    if (warnings.foundation_risk.level === 'high') {
      flags.push({ category: 'foundation', severity: 'high', label: 'High foundation risk' });
    } else if (warnings.foundation_risk.level === 'medium') {
      flags.push({ category: 'foundation', severity: 'medium', label: 'Foundation risk needs verification' });
    }

    // Erfpacht
    if (warnings.erfpacht.detected) {
      flags.push({ category: 'erfpacht', severity: 'info', label: 'Erfpacht detected' });
    }

    // VvE
    if (warnings.vve.is_apartment) {
      flags.push({ category: 'vve', severity: 'info', label: 'VvE — review financials' });
    }

    // Asbestos — only flag for pre-1980 (extensive structural use)
    const year = warnings.asbestos.construction_year;
    if (warnings.asbestos.flagged && year != null && year < 1980) {
      flags.push({ category: 'asbestos', severity: 'info', label: 'Pre-1980 asbestos risk' });
    }
  }

  return { flags, assessed };
}

export default function AttentionSummary({ riskCards, warnings, sunlightScore }: Props) {
  const { t } = useTranslation();

  const { flags, assessed } = useMemo(
    () => computeFlags(riskCards, warnings, sunlightScore),
    [riskCards, warnings, sunlightScore],
  );

  // Don't render if no data at all
  if (!riskCards && !warnings) return null;

  const total = 4;
  const count = flags.length;
  const badgeVariant = count === 0 ? 'green' : count === 1 ? 'amber' : 'red';

  const badgeText = count === 0
    ? t('warnings.attention.no_flags')
    : count === 1
      ? t('warnings.attention.one_item', { count: 1 })
      : t('warnings.attention.items_attention', { count });

  return (
    <div className={`attention-summary attention-summary--${badgeVariant}`} data-testid="attention-summary">
      <span className={`attention-summary__badge attention-summary__badge--${badgeVariant}`}>
        {badgeText}
      </span>
      <span className="attention-summary__completeness">
        {t('warnings.attention.based_on', { assessed, total })}
      </span>
    </div>
  );
}
