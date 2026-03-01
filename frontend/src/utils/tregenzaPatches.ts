export interface TregenzaPatch {
  altitude: number;   // radians, 0 = horizon, π/2 = zenith
  azimuth: number;    // radians, 0 = north, clockwise
  solidAngle: number; // steradians
  row: number;        // row index (0 = lowest, 7 = zenith)
}

// Module-level memoized — patches are pure constants
let _cachedPatches: TregenzaPatch[] | null = null;

/**
 * Generate the standard Tregenza 145-patch sky discretization.
 *
 * 7 rows + 1 zenith patch = 8 altitude bands.
 * Patch counts: [30, 30, 24, 24, 18, 12, 6, 1] = 145 total.
 * Row center altitudes (degrees): 6, 18, 30, 42, 54, 66, 78, 90.
 * Band width: 12 degrees each.
 *
 * Results are memoized at module level since patches are pure constants.
 */
export function getTregenzaPatches(): TregenzaPatch[] {
  if (_cachedPatches) return _cachedPatches;

  const DEG_TO_RAD = Math.PI / 180;

  const rows = [
    { altDeg: 6,  count: 30, bandDeg: 12 },
    { altDeg: 18, count: 30, bandDeg: 12 },
    { altDeg: 30, count: 24, bandDeg: 12 },
    { altDeg: 42, count: 24, bandDeg: 12 },
    { altDeg: 54, count: 18, bandDeg: 12 },
    { altDeg: 66, count: 12, bandDeg: 12 },
    { altDeg: 78, count: 6,  bandDeg: 12 },
    { altDeg: 90, count: 1,  bandDeg: 12 },
  ];

  const patches: TregenzaPatch[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const rowDef = rows[rowIdx];
    const altRad = rowDef.altDeg * DEG_TO_RAD;
    const halfBand = (rowDef.bandDeg / 2) * DEG_TO_RAD;

    // Band edges
    const altLow = Math.max(0, altRad - halfBand);
    const altHigh = Math.min(Math.PI / 2, altRad + halfBand);

    // Band solid angle = 2π(sin(altHigh) - sin(altLow))
    const bandSolidAngle = 2 * Math.PI * (Math.sin(altHigh) - Math.sin(altLow));
    const patchSolidAngle = bandSolidAngle / rowDef.count;

    // Azimuths: evenly spaced within each row
    const azStep = (2 * Math.PI) / rowDef.count;
    for (let i = 0; i < rowDef.count; i++) {
      patches.push({
        altitude: altRad,
        azimuth: i * azStep,
        solidAngle: patchSolidAngle,
        row: rowIdx,
      });
    }
  }

  _cachedPatches = patches;
  return _cachedPatches;
}
