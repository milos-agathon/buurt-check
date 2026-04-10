export type EN17037Level = 'high' | 'medium' | 'minimum' | 'below';
export type WinterExposureRatioLevel = 'high' | 'medium' | 'below';

/**
 * EN 17037 daylight exposure bands for March 21 (informational only).
 * Never present these as compliance claims.
 */
export function getEN17037Level(equinoxHours: number): EN17037Level {
  if (equinoxHours >= 4) return 'high';
  if (equinoxHours >= 3) return 'medium';
  if (equinoxHours >= 1.5) return 'minimum';
  return 'below';
}

/**
 * Internal winter roof exposure ratio using actual vs possible clear-sky roof sun hours.
 * This is an indicative ratio, not a compliance assessment.
 */
export function getWinterExposureRatioLevel(
  actualHours: number,
  possibleHours: number,
): WinterExposureRatioLevel {
  if (possibleHours <= 0) return 'below';

  const fraction = actualHours / possibleHours;
  if (fraction >= 0.8) return 'high';
  if (fraction >= 0.5) return 'medium';
  return 'below';
}

