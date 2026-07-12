import type { TFunction } from 'i18next';
import type {
  LivabilityAvailableResponse,
  LivabilityComparisonRow,
  LivabilityDimension,
  LivabilityTrendPoint,
} from '../types/api';

export type LivabilityLegendKey =
  | 'address'
  | 'district'
  | 'municipality'
  | 'national';

type DeviationTone = 'positive' | 'negative' | 'neutral';

const DEVIATION_RANGE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getLivabilityClassValue(
  value: Pick<LivabilityAvailableResponse, 'overall_score' | 'overall_class'>,
): number {
  return value.overall_class ?? value.overall_score;
}

export function getLivabilityTrendClassValue(point: LivabilityTrendPoint): number {
  return point.overall_class ?? point.overall_score;
}

export function getLivabilityComparisonClassValue(row: LivabilityComparisonRow): number {
  return row.overall_class ?? row.overall_score;
}

export function getLivabilityDimensionClassValue(dim: LivabilityDimension): number {
  return dim.raw_score;
}

export function getLivabilityClassLabel(
  classValue: number,
  t: TFunction,
  fallback?: string | null,
): string {
  return t(`livability.class.${classValue}`, fallback ?? String(classValue));
}

export function formatLivabilityClass(
  classValue: number,
  t: TFunction,
): string {
  return t('livability.classValue', { value: classValue });
}

function formatLivabilityDeviationValue(
  deviation: number,
  language: string,
): string {
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  return deviation.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  });
}

export function describeLivabilityDeviation(
  deviation: number | null | undefined,
  t: TFunction,
  language: string,
): string | null {
  if (deviation == null) {
    return null;
  }

  const absolute = Math.abs(deviation);
  const key = absolute < 0.15
    ? 'livability.deviation.aroundAverage'
    : deviation > 0
      ? absolute < 0.75
        ? 'livability.deviation.slightlyAbove'
        : absolute < 1.5
          ? 'livability.deviation.above'
          : 'livability.deviation.wellAbove'
      : absolute < 0.75
        ? 'livability.deviation.slightlyBelow'
        : absolute < 1.5
          ? 'livability.deviation.below'
          : 'livability.deviation.wellBelow';

  return t('livability.deviation.withValue', {
    description: t(key),
    value: formatLivabilityDeviationValue(deviation, language),
  });
}

export function getLivabilityDeviationVisual(
  deviation: number | null | undefined,
): { left: string; width: string; tone: DeviationTone } | null {
  if (deviation == null) {
    return null;
  }

  const clamped = clamp(deviation, -DEVIATION_RANGE, DEVIATION_RANGE);
  const center = 50;
  const offset = center + (clamped / DEVIATION_RANGE) * 50;
  const delta = Math.abs(offset - center);
  const width = Math.max(delta, 2);
  const left = offset >= center ? center : center - width;
  const tone: DeviationTone = Math.abs(clamped) < 0.15
    ? 'neutral'
    : clamped > 0
      ? 'positive'
      : 'negative';

  return {
    left: `${left}%`,
    width: `${width}%`,
    tone,
  };
}

export function livabilityLegendKey(level: string): LivabilityLegendKey {
  if (level === 'buurt') return 'address';
  if (level === 'wijk') return 'district';
  if (level === 'gemeente') return 'municipality';
  return 'national';
}

export function getLivabilityClassBarPercent(classValue: number): number {
  return Math.max(12, (classValue / 9) * 100);
}
