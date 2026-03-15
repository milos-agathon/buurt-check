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

  const environmentalScores: Array<{ category: string; score?: number }> = riskCards
    ? [
        { category: 'noise', score: riskCards.noise.score },
        { category: 'air_quality', score: riskCards.air_quality.score },
        { category: 'climate', score: riskCards.climate_stress.score },
        { category: 'sunlight', score: riskCards.sunlight?.score },
      ]
    : [];

  if (environmentalScores.length > 0) {
    total += environmentalScores.length;
  }

  for (const item of environmentalScores) {
    if (item.score == null) continue;
    assessed += 1;
    if (item.score < 30) {
      flags.push({
        category: item.category,
        severity: 'critical',
        label: item.category,
      });
    } else if (item.score < 50) {
      flags.push({
        category: item.category,
        severity: 'elevated',
        label: item.category,
      });
    }
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
