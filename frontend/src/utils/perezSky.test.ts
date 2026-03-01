import { describe, expect, it } from 'vitest';
import { perezLuminance } from './perezSky';
import type { PerezCoefficients } from './perezSky';

describe('perezLuminance', () => {
  const sunAlt = 60 * (Math.PI / 180); // 60° altitude
  const sunAz = Math.PI; // sun due south

  it('circumsolar: luminance near sun > luminance far from sun', () => {
    // Patch near sun
    const nearSun = perezLuminance(
      sunAlt,
      sunAz,
      sunAlt,
      sunAz,
    );
    // Patch on opposite side of sky
    const farFromSun = perezLuminance(
      sunAlt,
      0, // due north, opposite the sun
      sunAlt,
      sunAz,
    );
    expect(nearSun).toBeGreaterThan(farFromSun);
  });

  it('all output values are positive for any sky position', () => {
    const altitudes = [0.05, 0.2, 0.5, 1.0, Math.PI / 2 - 0.01];
    const azimuths = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

    for (const alt of altitudes) {
      for (const az of azimuths) {
        const lum = perezLuminance(alt, az, sunAlt, sunAz);
        expect(lum).toBeGreaterThan(0);
      }
    }
  });

  it('horizon brightening: low patches brighter than mid-sky on opposite side', () => {
    // On the opposite side of the sky from the sun,
    // low-altitude patches should be brighter than mid-altitude
    // due to the exp(b/cosZ) horizon brightening term
    const oppAz = 0; // opposite from sun at south
    const lowPatch = perezLuminance(
      5 * (Math.PI / 180), // 5° above horizon
      oppAz,
      sunAlt,
      sunAz,
    );
    const midPatch = perezLuminance(
      45 * (Math.PI / 180), // 45° above horizon
      oppAz,
      sunAlt,
      sunAz,
    );
    expect(lowPatch).toBeGreaterThan(midPatch);
  });

  it('custom coefficients change the output', () => {
    const customCoeffs: PerezCoefficients = {
      a: -0.5, b: -0.1, c: 5.0, d: -1.5, e: 0.2,
    };
    const defaultLum = perezLuminance(
      Math.PI / 4,
      0,
      sunAlt,
      sunAz,
    );
    const customLum = perezLuminance(
      Math.PI / 4,
      0,
      sunAlt,
      sunAz,
      customCoeffs,
    );
    expect(customLum).not.toBeCloseTo(defaultLum, 2);
  });

  it('zenith patch returns a positive value', () => {
    const lum = perezLuminance(
      Math.PI / 2,
      0,
      sunAlt,
      sunAz,
    );
    expect(lum).toBeGreaterThan(0);
  });

  it('luminance is symmetric for equal angular distances on each side of sun', () => {
    // Two patches equidistant from the sun should have similar luminance
    // (Same altitude, symmetric azimuth offsets from sun)
    const offset = Math.PI / 6; // 30° offset
    const lum1 = perezLuminance(
      sunAlt,
      sunAz + offset,
      sunAlt,
      sunAz,
    );
    const lum2 = perezLuminance(
      sunAlt,
      sunAz - offset,
      sunAlt,
      sunAz,
    );
    expect(lum1).toBeCloseTo(lum2, 6);
  });

  it('handles sun at low altitude without errors', () => {
    const lowSunAlt = 5 * (Math.PI / 180);
    const lum = perezLuminance(
      Math.PI / 4,
      Math.PI / 2,
      lowSunAlt,
      0,
    );
    expect(lum).toBeGreaterThan(0);
    expect(Number.isFinite(lum)).toBe(true);
  });

  it('handles patch near horizon without errors', () => {
    const lum = perezLuminance(
      0.01, // nearly at horizon
      0,
      sunAlt,
      sunAz,
    );
    expect(lum).toBeGreaterThan(0);
    expect(Number.isFinite(lum)).toBe(true);
  });
});
