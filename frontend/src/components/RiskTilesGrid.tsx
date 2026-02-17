import RiskTile from './RiskTile';
import type { RiskCardsResponse, SunlightResult, SeverityLevel, RiskLevel } from '../types/api';
import './RiskTilesGrid.css';

interface RiskTilesGridProps {
  risks?: RiskCardsResponse;
  sunlight?: SunlightResult;
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

function normalizeSunlightScore(winterHours: number): number {
  return Math.max(0, Math.min(100, Math.round((winterHours / 6) * 100)));
}

export default function RiskTilesGrid({ risks, sunlight, onTileTap }: RiskTilesGridProps) {
  const sunlightScore = sunlight ? normalizeSunlightScore(sunlight.winter) : undefined;
  const sunlightSeverity: SeverityLevel = sunlightScore != null
    ? (sunlightScore >= 70 ? 'good' : sunlightScore >= 40 ? 'moderate' : sunlightScore >= 20 ? 'poor' : 'critical')
    : 'unavailable';

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
      <RiskTile
        category="sunlight"
        labelKey="sunlight.title"
        score={sunlightScore}
        severity={sunlightSeverity}
        onTap={() => onTileTap?.('sunlight')}
      />
    </div>
  );
}
