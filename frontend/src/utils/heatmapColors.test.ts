import { describe, expect, it } from 'vitest';
import { getSunHoursGradientCss, sunHoursToColor } from './heatmapColors';

describe('sunHoursToColor', () => {
  it('returns red-ish for 0 hours (worst)', () => {
    const [r, g] = sunHoursToColor(0, 0, 16);
    expect(r).toBeGreaterThan(0.8);
    expect(g).toBeLessThan(0.3);
  });

  it('returns green-ish for max hours (best)', () => {
    const [r, g] = sunHoursToColor(16, 0, 16);
    expect(g).toBeGreaterThan(0.6);
    expect(r).toBeLessThan(0.4);
  });

  it('returns yellow-ish for middle values', () => {
    const [r, g] = sunHoursToColor(8, 0, 16);
    expect(r).toBeGreaterThan(0.5);
    expect(g).toBeGreaterThan(0.5);
  });

  it('clamps to [0,1] range', () => {
    const [r] = sunHoursToColor(-5, 0, 16);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('uses midpoint color when min and max are identical', () => {
    const color = sunHoursToColor(6, 6, 6);
    const midpoint = sunHoursToColor(8, 0, 16);
    expect(color).toEqual(midpoint);
  });

  it('clamps values above max to the best (green-ish) endpoint', () => {
    const above = sunHoursToColor(20, 0, 16);
    const atMax = sunHoursToColor(16, 0, 16);
    expect(above).toEqual(atMax);
  });

  it('handles 256 evaluation points without error and produces valid RGB', () => {
    const pointCount = 256;
    const min = 0;
    const max = 16;

    for (let i = 0; i < pointCount; i++) {
      const hours = (i / (pointCount - 1)) * max;
      const [r, g, b] = sunHoursToColor(hours, min, max);

      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('exposes a gradient CSS string that matches heatmap stops', () => {
    const gradient = getSunHoursGradientCss();
    expect(gradient).toContain('rgb(224 64 64)');
    expect(gradient).toContain('rgb(224 196 64)');
    expect(gradient).toContain('rgb(64 176 97)');
  });
});
