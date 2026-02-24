import { describe, expect, it } from 'vitest';
import {
  generateRoofSamplePoints,
  isPointInPolygon,
  type PolygonPoint2D,
} from './roofSampling';

function hasPoint(
  points: [number, number, number][],
  expectedX: number,
  expectedY: number,
  expectedZ: number,
): boolean {
  return points.some(([x, y, z]) =>
    Math.abs(x - expectedX) < 1e-6
    && Math.abs(y - expectedY) < 1e-6
    && Math.abs(z - expectedZ) < 1e-6
  );
}

describe('isPointInPolygon', () => {
  const square: PolygonPoint2D[] = [[0, 0], [4, 0], [4, -4], [0, -4]];

  it('returns true for points inside polygon', () => {
    expect(isPointInPolygon(2, -2, square)).toBe(true);
  });

  it('returns false for points outside polygon', () => {
    expect(isPointInPolygon(6, -2, square)).toBe(false);
  });
});

describe('generateRoofSamplePoints', () => {
  it('maps footprint dy to negative viewer Z and includes centroid', () => {
    const footprint = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const points = generateRoofSamplePoints(footprint, 10, { gridSpacingMeters: 2, maxPoints: 64 });

    expect(hasPoint(points, 4, 10, -4)).toBe(true);
    expect(hasPoint(points, 0, 10, 0)).toBe(true);
    expect(hasPoint(points, 2, 10, -2)).toBe(true);
  });

  it('caps point count while preserving representative samples', () => {
    const footprint = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const points = generateRoofSamplePoints(footprint, 8, { gridSpacingMeters: 1, maxPoints: 16 });

    expect(points.length).toBeLessThanOrEqual(16);
    expect(hasPoint(points, 0, 8, 0)).toBe(true);
    expect(hasPoint(points, 20, 8, -20)).toBe(true);
  });

  it('returns empty array for invalid footprint', () => {
    expect(generateRoofSamplePoints([], 8)).toEqual([]);
    expect(generateRoofSamplePoints([[0, 0], [1, 1]], 8)).toEqual([]);
  });
});
