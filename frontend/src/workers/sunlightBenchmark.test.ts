import { describe, expect, it } from 'vitest';
import {
  generateRoofSamplePoints,
  DEFAULT_GRID_SPACING_METERS,
  DEFAULT_MAX_ROOF_POINTS,
  HIGH_DENSITY_GRID_SPACING,
  HIGH_DENSITY_MAX_POINTS,
} from '../utils/roofSampling';

/**
 * Structural benchmarks verifying point density scaling for Worker analysis.
 * Uses generateRoofSamplePoints with representative building footprints
 * to validate that density settings produce expected point counts.
 */

// 10x10m footprint (typical Dutch terraced house)
const HOUSE_FOOTPRINT = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

// 15x8m footprint (wider detached house)
const DETACHED_FOOTPRINT = [
  [0, 0],
  [15, 0],
  [15, 8],
  [0, 8],
];

const ROOF_Y = 8;

describe('roof point density benchmarks', () => {
  it('generates expected count at v1 baseline (64 points, 2m spacing)', () => {
    const points = generateRoofSamplePoints(HOUSE_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: DEFAULT_GRID_SPACING_METERS,
      maxPoints: DEFAULT_MAX_ROOF_POINTS,
    });

    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(DEFAULT_MAX_ROOF_POINTS);
  });

  it('generates more points at v2 Worker density (256 points, 1m spacing)', () => {
    const v1Points = generateRoofSamplePoints(HOUSE_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: DEFAULT_GRID_SPACING_METERS,
      maxPoints: DEFAULT_MAX_ROOF_POINTS,
    });

    const v2Points = generateRoofSamplePoints(HOUSE_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: HIGH_DENSITY_GRID_SPACING,
      maxPoints: HIGH_DENSITY_MAX_POINTS,
    });

    expect(v2Points.length).toBeGreaterThan(v1Points.length);
    expect(v2Points.length).toBeLessThanOrEqual(HIGH_DENSITY_MAX_POINTS);
  });

  it('generates points at upper bound (512 points, 0.5m spacing)', () => {
    const points = generateRoofSamplePoints(HOUSE_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: 0.5,
      maxPoints: 512,
    });

    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(512);
  });

  it('scales point count proportionally with density for detached house', () => {
    const coarse = generateRoofSamplePoints(DETACHED_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: 2,
      maxPoints: 64,
    });
    const medium = generateRoofSamplePoints(DETACHED_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: 1,
      maxPoints: 256,
    });
    const fine = generateRoofSamplePoints(DETACHED_FOOTPRINT, ROOF_Y, {
      gridSpacingMeters: 0.5,
      maxPoints: 512,
    });

    expect(medium.length).toBeGreaterThan(coarse.length);
    expect(fine.length).toBeGreaterThan(medium.length);
  });

  it('keeps raycast count ceiling below 150K for 256 points with 12 months × 20 samples', () => {
    // Use a larger footprint (25x15m) that actually produces close to 256 grid points
    // at 1m spacing, unlike the 10x10m house which only yields ~100.
    const largeFootprint = [[0, 0], [25, 0], [25, 15], [0, 15]];
    const points = generateRoofSamplePoints(largeFootprint, ROOF_Y, {
      gridSpacingMeters: HIGH_DENSITY_GRID_SPACING,
      maxPoints: HIGH_DENSITY_MAX_POINTS,
    });

    // 12 months × ~10 daylight time samples (30min interval over ~5h winter to ~16h summer avg ~10)
    // Conservative estimate: 12 months × 20 time samples = 240 time slots
    const conservativeTimeSlots = 240;
    const totalRaycasts = points.length * conservativeTimeSlots;

    expect(totalRaycasts).toBeLessThan(150_000);
    expect(points.length).toBeLessThanOrEqual(256);
  });

  it('exports HIGH_DENSITY constants matching expected values', () => {
    expect(HIGH_DENSITY_GRID_SPACING).toBe(1);
    expect(HIGH_DENSITY_MAX_POINTS).toBe(256);
    expect(DEFAULT_GRID_SPACING_METERS).toBe(2);
    expect(DEFAULT_MAX_ROOF_POINTS).toBe(64);
  });
});
