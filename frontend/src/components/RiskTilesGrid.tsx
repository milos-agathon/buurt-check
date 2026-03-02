import { memo } from 'react';
import RiskTile from './RiskTile';
import type { RiskCardsResponse, SeverityLevel, RiskLevel } from '../types/api';
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
  return (
    <div className="risk-tiles-grid">
      <RiskTile
        category="noise"
        labelKey="risk.noise.title"
        score={risks?.noise.score}
        severity={risks ? levelToSeverity(risks.noise.level, risks.noise.score) : 'unavailable'}
        onTap={() => onTileTap?.('noise')}
      />
      <RiskTile
        category="air"
        labelKey="risk.air.title"
        score={risks?.air_quality.score}
        severity={risks ? levelToSeverity(risks.air_quality.level, risks.air_quality.score) : 'unavailable'}
        onTap={() => onTileTap?.('air')}
      />
      <RiskTile
        category="climate"
        labelKey="risk.climate.title"
        score={risks?.climate_stress.score}
        severity={risks ? levelToSeverity(risks.climate_stress.level, risks.climate_stress.score) : 'unavailable'}
        onTap={() => onTileTap?.('climate')}
      />
    </div>
  );
}

export default memo(RiskTilesGrid);
