import { describe, expect, it } from 'vitest';
import { computeAnisotropicSvf } from './anisotropicSvf';

describe('computeAnisotropicSvf', () => {
  const sunAlt = 60 * (Math.PI / 180); // 60° altitude
  const sunAz = Math.PI; // sun due south

  it('returns 1.0 for completely open sky (all visible)', () => {
    const allVisible = () => true;
    const svf = computeAnisotropicSvf(allVisible, sunAlt, sunAz);
    expect(svf).toBeCloseTo(1.0, 6);
  });

  it('returns 0.0 for completely obstructed sky (none visible)', () => {
    const noneVisible = () => false;
    const svf = computeAnisotropicSvf(noneVisible, sunAlt, sunAz);
    expect(svf).toBeCloseTo(0.0, 6);
  });

  it('sun-facing half visible yields higher SVF than opposite half', () => {
    // Sun is due south (azimuth = π), so the south-facing half
    // should have higher weight than the north-facing half
    const southHalf = (altitude: number, azimuth: number) => {
      void altitude;
      // South half: azimuth in [π/2, 3π/2]
      return azimuth >= Math.PI / 2 && azimuth <= (3 * Math.PI) / 2;
    };
    const northHalf = (altitude: number, azimuth: number) => {
      void altitude;
      // North half: azimuth outside [π/2, 3π/2]
      return azimuth < Math.PI / 2 || azimuth > (3 * Math.PI) / 2;
    };

    const svfSouth = computeAnisotropicSvf(southHalf, sunAlt, sunAz);
    const svfNorth = computeAnisotropicSvf(northHalf, sunAlt, sunAz);
    expect(svfSouth).toBeGreaterThan(svfNorth);
  });

  it('returns value in [0, 1] for partial visibility', () => {
    // Every other patch visible
    let idx = 0;
    const alternating = () => {
      idx++;
      return idx % 2 === 0;
    };
    const svf = computeAnisotropicSvf(alternating, sunAlt, sunAz);
    expect(svf).toBeGreaterThan(0);
    expect(svf).toBeLessThan(1);
  });

  it('returns value in [0, 1] for random visibility', () => {
    // Deterministic pseudo-random based on azimuth
    const randomIsh = (_alt: number, az: number) => Math.sin(az * 17) > 0;
    const svf = computeAnisotropicSvf(randomIsh, sunAlt, sunAz);
    expect(svf).toBeGreaterThanOrEqual(0);
    expect(svf).toBeLessThanOrEqual(1);
  });

  it('only zenith visible gives small but positive SVF', () => {
    // Only the zenith patch (altitude ≈ π/2) is visible
    const onlyZenith = (altitude: number) => altitude > (80 * Math.PI) / 180;
    const svf = computeAnisotropicSvf(onlyZenith, sunAlt, sunAz);
    expect(svf).toBeGreaterThan(0);
    expect(svf).toBeLessThan(0.5); // Zenith alone is a small fraction
  });

  it('works with low sun angle', () => {
    const lowSunAlt = 10 * (Math.PI / 180);
    const allVisible = () => true;
    const svf = computeAnisotropicSvf(allVisible, lowSunAlt, 0);
    expect(svf).toBeCloseTo(1.0, 6);
  });

  it('isVisible receives altitude and azimuth in radians', () => {
    const receivedArgs: Array<[number, number]> = [];
    const collector = (altitude: number, azimuth: number) => {
      receivedArgs.push([altitude, azimuth]);
      return true;
    };
    computeAnisotropicSvf(collector, sunAlt, sunAz);
    // Should be called 145 times (once per Tregenza patch)
    expect(receivedArgs).toHaveLength(145);
    // All altitudes should be in radians [0, π/2]
    for (const [alt, az] of receivedArgs) {
      expect(alt).toBeGreaterThanOrEqual(0);
      expect(alt).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      expect(az).toBeGreaterThanOrEqual(0);
      expect(az).toBeLessThan(2 * Math.PI + 1e-9);
    }
  });
});
