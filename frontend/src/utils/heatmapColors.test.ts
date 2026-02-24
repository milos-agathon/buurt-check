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

  it('exposes a gradient CSS string that matches heatmap stops', () => {
    const gradient = getSunHoursGradientCss();
    expect(gradient).toContain('rgb(224 64 64)');
    expect(gradient).toContain('rgb(224 196 64)');
    expect(gradient).toContain('rgb(64 176 97)');
  });
});
