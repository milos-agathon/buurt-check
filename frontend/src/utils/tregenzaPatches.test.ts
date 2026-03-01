import { describe, expect, it } from 'vitest';
import { getTregenzaPatches } from './tregenzaPatches';

describe('getTregenzaPatches', () => {
  it('returns exactly 145 patches', () => {
    const patches = getTregenzaPatches();
    expect(patches).toHaveLength(145);
  });

  it('all altitudes are in [0, π/2]', () => {
    const patches = getTregenzaPatches();
    for (const patch of patches) {
      expect(patch.altitude).toBeGreaterThanOrEqual(0);
      expect(patch.altitude).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it('all azimuths are in [0, 2π)', () => {
    const patches = getTregenzaPatches();
    for (const patch of patches) {
      expect(patch.azimuth).toBeGreaterThanOrEqual(0);
      expect(patch.azimuth).toBeLessThan(2 * Math.PI + 1e-9);
    }
  });

  it('solid angles sum to approximately 2π (hemisphere)', () => {
    const patches = getTregenzaPatches();
    const totalSolidAngle = patches.reduce((sum, p) => sum + p.solidAngle, 0);
    // The upper hemisphere solid angle is 2π steradians
    expect(totalSolidAngle).toBeCloseTo(2 * Math.PI, 2);
  });

  it('last patch is zenith (altitude ≈ π/2)', () => {
    const patches = getTregenzaPatches();
    const zenith = patches[patches.length - 1];
    expect(zenith.altitude).toBeCloseTo(Math.PI / 2, 4);
  });

  it('module-level memoization returns same reference on second call', () => {
    const first = getTregenzaPatches();
    const second = getTregenzaPatches();
    expect(first).toBe(second);
  });

  it('row 0 has 30 patches at altitude ≈ 6°', () => {
    const patches = getTregenzaPatches();
    const row0 = patches.filter(
      (p) => Math.abs(p.altitude - (6 * Math.PI) / 180) < 0.001,
    );
    expect(row0).toHaveLength(30);
  });

  it('row 4 has 18 patches at altitude ≈ 54°', () => {
    const patches = getTregenzaPatches();
    const row4 = patches.filter(
      (p) => Math.abs(p.altitude - (54 * Math.PI) / 180) < 0.001,
    );
    expect(row4).toHaveLength(18);
  });

  it('all solid angles are positive', () => {
    const patches = getTregenzaPatches();
    for (const patch of patches) {
      expect(patch.solidAngle).toBeGreaterThan(0);
    }
  });

  it('azimuths within a row are evenly spaced', () => {
    const patches = getTregenzaPatches();
    // Check row 0 (30 patches at altitude ≈ 6°)
    const row0 = patches.filter(
      (p) => Math.abs(p.altitude - (6 * Math.PI) / 180) < 0.001,
    );
    const expectedSpacing = (2 * Math.PI) / 30;
    const azimuths = row0.map((p) => p.azimuth).sort((a, b) => a - b);
    for (let i = 1; i < azimuths.length; i++) {
      expect(azimuths[i] - azimuths[i - 1]).toBeCloseTo(expectedSpacing, 6);
    }
  });
});
