import { describe, expect, it } from 'vitest';
import {
  generateFacadePoints,
  generateGroundProxyPoints,
  generateRoofSamplePoints,
  getEdgeOrientation,
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

describe('getEdgeOrientation', () => {
  it('returns south for edge facing south in CW footprint', () => {
    const orientation = getEdgeOrientation([0, 0], [10, 0]);
    expect(orientation).toBe('south');
  });

  it('returns east for edge facing east', () => {
    const orientation = getEdgeOrientation([0, 0], [0, 10]);
    expect(orientation).toBe('east');
  });
});

describe('generateFacadePoints', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('generates points at all specified heights on each edge', () => {
    const points = generateFacadePoints(square, 0, [1.5, 4.5]);
    expect(points.length).toBe(8);
  });

  it('sets y to groundHeight + windowHeight', () => {
    const points = generateFacadePoints(square, 2, [1.5]);
    points.forEach((entry) => {
      expect(entry.point[1]).toBeCloseTo(3.5, 6);
    });
  });

  it('labels points with all cardinal orientations', () => {
    const points = generateFacadePoints(square, 0, [1.5]);
    const orientations = points.map((entry) => entry.orientation);
    expect(orientations).toContain('north');
    expect(orientations).toContain('south');
    expect(orientations).toContain('east');
    expect(orientations).toContain('west');
  });

  it('handles CCW winding and yields same orientation set', () => {
    const cwSquare = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const ccwSquare = [[0, 10], [10, 10], [10, 0], [0, 0]];

    const cwOrientations = new Set(generateFacadePoints(cwSquare, 0, [1.5]).map((entry) => entry.orientation));
    const ccwOrientations = new Set(generateFacadePoints(ccwSquare, 0, [1.5]).map((entry) => entry.orientation));

    expect(ccwOrientations).toEqual(cwOrientations);
  });
});

describe('generateGroundProxyPoints', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it('generates a ring with requested point count', () => {
    const points = generateGroundProxyPoints(square, 0, 3, 4);
    expect(points.length).toBe(4);
  });

  it('places points at eye height (1.5m) above ground', () => {
    const points = generateGroundProxyPoints(square, 2, 3, 8);
    points.forEach((point) => {
      expect(point[1]).toBeCloseTo(3.5, 6);
    });
  });

  it('places points outside the footprint in viewer coordinates', () => {
    const points = generateGroundProxyPoints(square, 0, 3, 8);
    const polygon: PolygonPoint2D[] = [[0, 0], [10, 0], [10, -10], [0, -10]];
    points.forEach(([x, , z]) => {
      expect(isPointInPolygon(x, z, polygon)).toBe(false);
    });
  });
});
