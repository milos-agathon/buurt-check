import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import RiskTile from './RiskTile';
import type {
  RiskCardsResponse,
  SeverityLevel,
  RiskLevel,
} from '../types/api';
import './RiskTilesGrid.css';

interface RiskTilesGridProps {
  risks?: RiskCardsResponse;
  onTileTap?: (category: string) => void;
}

function levelToSeverity(level: RiskLevel, score?: number): SeverityLevel {
  if (score != null) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'poor';
    return 'critical';
  }
  switch (level) {
    case 'low': return 'good';
    case 'medium': return 'moderate';
    case 'high': return 'poor';
    default: return 'unavailable';
  }
}

function RiskTilesGrid({ risks, onTileTap }: RiskTilesGridProps) {
  const { i18n, t } = useTranslation();
  const isNl = i18n.language === 'nl';
  const unavailableSummary = t('risk.tileUnavailable');

  const cards = [
    {
      category: 'noise',
      labelKey: 'risk.noise.title',
      score: risks?.noise.score,
      severity: risks ? levelToSeverity(risks.noise.level, risks.noise.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.noise.summary_nl : risks.noise.summary)
        : unavailableSummary,
      warnings: risks?.noise.warnings ?? (risks?.noise.message ? [risks.noise.message] : []),
      unavailable: !risks || risks.noise.level === 'unavailable' || risks.noise.score == null,
    },
    {
      category: 'air',
      labelKey: 'risk.air.title',
      score: risks?.air_quality.score,
      severity: risks ? levelToSeverity(risks.air_quality.level, risks.air_quality.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.air_quality.summary_nl : risks.air_quality.summary)
        : unavailableSummary,
      warnings: risks?.air_quality.warnings ?? (risks?.air_quality.message ? [risks.air_quality.message] : []),
      unavailable: !risks || risks.air_quality.level === 'unavailable' || risks.air_quality.score == null,
    },
    {
      category: 'climate',
      labelKey: 'risk.climate.title',
      score: risks?.climate_stress.score,
      severity: risks ? levelToSeverity(risks.climate_stress.level, risks.climate_stress.score) : 'unavailable',
      summary: risks
        ? (isNl ? risks.climate_stress.summary_nl : risks.climate_stress.summary)
        : unavailableSummary,
      warnings: risks?.climate_stress.warnings ?? (risks?.climate_stress.message ? [risks.climate_stress.message] : []),
      unavailable: !risks || risks.climate_stress.level === 'unavailable' || risks.climate_stress.score == null,
    },
  ] as const;

  return (
    <div className="risk-tiles-grid">
      {cards.map((card) => (
        <RiskTile
          key={card.category}
          category={card.category}
          labelKey={card.labelKey}
          score={card.score}
          severity={card.severity}
          summary={card.unavailable ? unavailableSummary : card.summary}
          warnings={card.warnings}
          unavailable={card.unavailable}
          onTap={card.unavailable ? undefined : () => onTileTap?.(card.category)}
        />
      ))}
    </div>
  );
}

export default memo(RiskTilesGrid);
