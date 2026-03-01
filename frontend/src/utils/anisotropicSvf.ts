import { getTregenzaPatches } from './tregenzaPatches';
import { perezLuminance } from './perezSky';

/**
 * Compute anisotropic Sky View Factor using Tregenza patches
 * weighted by Perez sky luminance distribution.
 *
 * Unlike isotropic SVF (uniform sky), this weights each sky patch
 * by how bright it actually is given the current sun position,
 * producing a more physically accurate estimate of diffuse irradiance
 * reaching a point on the surface.
 *
 * @param isVisible - callback returning true if a sky patch at the
 *   given (altitude, azimuth) in radians is visible from the evaluation point
 * @param sunAlt - solar altitude in radians
 * @param sunAz  - solar azimuth in radians
 * @returns SVF in [0, 1] — 1 = fully open sky, 0 = fully obstructed
 */
export function computeAnisotropicSvf(
  isVisible: (altitude: number, azimuth: number) => boolean,
  sunAlt: number,
  sunAz: number,
): number {
  const patches = getTregenzaPatches();
  let weightedVisible = 0;
  let totalWeight = 0;

  for (const patch of patches) {
    // cos(zenith) = cos(π/2 - alt) = sin(alt)
    const cosZenith = Math.sin(patch.altitude);
    const luminance = perezLuminance(patch.altitude, patch.azimuth, sunAlt, sunAz);
    const weight = luminance * patch.solidAngle * cosZenith;

    totalWeight += weight;
    if (isVisible(patch.altitude, patch.azimuth)) {
      weightedVisible += weight;
    }
  }

  return totalWeight > 0 ? weightedVisible / totalWeight : 0;
}
