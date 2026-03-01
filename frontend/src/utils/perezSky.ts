export interface PerezCoefficients {
  a: number; b: number; c: number; d: number; e: number;
}

/** CIE clear sky type 12 — standard Perez coefficients. */
const CIE_CLEAR: PerezCoefficients = {
  a: -1.0, b: -0.32, c: 10.0, d: -3.0, e: 0.45,
};

/**
 * Angular distance between two sky points (great circle arc).
 *
 * cos(γ) = sin(a1)·sin(a2) + cos(a1)·cos(a2)·cos(Δaz)
 */
function angularDistance(
  alt1: number, az1: number,
  alt2: number, az2: number,
): number {
  const cosGamma =
    Math.sin(alt1) * Math.sin(alt2) +
    Math.cos(alt1) * Math.cos(alt2) * Math.cos(az1 - az2);
  return Math.acos(Math.max(-1, Math.min(1, cosGamma)));
}

/**
 * Perez all-weather sky luminance distribution.
 *
 * f(z, γ) = (1 + a·exp(b / cos z)) · (1 + c·exp(d·γ) + e·cos²γ)
 *
 * where z = zenith angle of the patch (π/2 - altitude),
 *       γ = angular distance between patch and sun.
 *
 * The result is normalized by f(0, θ_sun) so that the zenith value
 * provides a stable reference point.
 *
 * @param patchAlt - altitude of sky patch in radians [0, π/2]
 * @param patchAz  - azimuth of sky patch in radians [0, 2π)
 * @param sunAlt   - solar altitude in radians
 * @param sunAz    - solar azimuth in radians
 * @param coeffs   - Perez model coefficients (default: CIE clear sky type 12)
 * @returns Relative luminance (positive, dimensionless)
 */
export function perezLuminance(
  patchAlt: number,
  patchAz: number,
  sunAlt: number,
  sunAz: number,
  coeffs: PerezCoefficients = CIE_CLEAR,
): number {
  // Zenith angle of the patch
  const z = Math.PI / 2 - patchAlt;
  // Clamp cos(z) to avoid division by zero near horizon
  const cosZ = Math.max(0.01, Math.cos(z));

  // Angular distance between patch and sun
  const gamma = angularDistance(patchAlt, patchAz, sunAlt, sunAz);

  // Perez formula: f(z, γ)
  const f =
    (1 + coeffs.a * Math.exp(coeffs.b / cosZ)) *
    (1 + coeffs.c * Math.exp(coeffs.d * gamma) + coeffs.e * Math.cos(gamma) * Math.cos(gamma));

  // Normalization: evaluate f at zenith (z=0) looking toward the sun
  const sunZenithAngle = Math.PI / 2 - sunAlt;
  const gammaZenithSun = sunZenithAngle; // angular distance from zenith to sun
  const fZenith =
    (1 + coeffs.a * Math.exp(coeffs.b)) *
    (1 + coeffs.c * Math.exp(coeffs.d * gammaZenithSun) + coeffs.e * Math.cos(gammaZenithSun) * Math.cos(gammaZenithSun));

  const normalized = fZenith !== 0 ? f / fZenith : f;

  // Clamp to positive to maintain physical plausibility
  return Math.max(0.001, normalized);
}
