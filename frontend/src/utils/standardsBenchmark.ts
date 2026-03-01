export type EN17037Level = 'high' | 'medium' | 'minimum' | 'below';
export type TNOLevel = 'streng' | 'licht' | 'below';

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
 * Dutch TNO bezonningsnorm-style benchmark using actual vs possible sun hours.
 * Never present these as compliance claims.
 */
export function getTNOBenchmark(
  actualHours: number,
  possibleHours: number,
): TNOLevel {
  if (possibleHours <= 0) return 'below';

  const fraction = actualHours / possibleHours;
  if (fraction >= 0.8) return 'streng';
  if (fraction >= 0.5) return 'licht';
  return 'below';
}

