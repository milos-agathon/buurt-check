import type {
  AttentionFlag,
  PropertyWarningsResponse,
  RiskCardsResponse,
} from '../types/api';

export interface AttentionSummaryState {
  flags: AttentionFlag[];
  assessed: number;
  total: number;
}

type AttentionSeverity = AttentionFlag['severity'];

function severityFromScore(score: number): AttentionSeverity | null {
  if (score >= 70) return null;
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'poor';
  return 'critical';
}

function uniqueFlags(flags: AttentionFlag[]): AttentionFlag[] {
  const seen = new Set<string>();
  const deduped: AttentionFlag[] = [];

  for (const flag of flags) {
    const key = `${flag.category}:${flag.severity}:${flag.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}

export function buildAttentionSummary(
  riskCards?: RiskCardsResponse | null,
  propertyWarnings?: PropertyWarningsResponse | null,
): AttentionSummaryState | null {
  const flags: AttentionFlag[] = [];
  let assessed = 0;
  let total = 0;

  const environmentalScores: Array<{
    category: string;
    score?: number;
    severity?: RiskCardsResponse['noise']['severity'];
  }> = riskCards
    ? [
        { category: 'noise', score: riskCards.noise.score, severity: riskCards.noise.severity },
        { category: 'air_quality', score: riskCards.air_quality.score, severity: riskCards.air_quality.severity },
        { category: 'climate', score: riskCards.climate_stress.score, severity: riskCards.climate_stress.severity },
        { category: 'sunlight', score: riskCards.sunlight?.score, severity: riskCards.sunlight?.severity },
      ]
    : [];

  if (environmentalScores.length > 0) {
    total += environmentalScores.length;
  }

  for (const item of environmentalScores) {
    if (item.score == null) continue;
    assessed += 1;
    const severity: AttentionSeverity | null =
      item.severity === 'critical' || item.severity === 'poor' || item.severity === 'moderate'
        ? item.severity
        : severityFromScore(item.score);
    if (!severity) continue;
    flags.push({
      category: item.category,
      severity,
      label: item.category,
    });
  }

  if (propertyWarnings?.attention_summary.flags?.length) {
    flags.push(...propertyWarnings.attention_summary.flags);
  }

  if (total === 0 && flags.length === 0) {
    return null;
  }

  return {
    flags: uniqueFlags(flags),
    assessed,
    total,
  };
}
