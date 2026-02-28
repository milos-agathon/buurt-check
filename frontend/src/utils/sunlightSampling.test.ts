import { describe, expect, it } from 'vitest';
import { isPointInPolygon } from './roofSampling';
import {
  buildSunlightEvaluationPoints,
  generateFacadeProxyPoints,
  generateGroundProxyPoints,
} from './sunlightSampling';

const SQUARE_FOOTPRINT = [[0, 0], [8, 0], [8, 8], [0, 8]];
const VIEWER_POLYGON: [number, number][] = [[0, 0], [8, 0], [8, -8], [0, -8]];

describe('sunlight proxy sampling', () => {
  it('builds roof + facade + ground evaluation points', () => {
    const points = buildSunlightEvaluationPoints(
      SQUARE_FOOTPRINT,
      10,
      2,
      {
        includeFacadePoints: true,
        includeGroundPoints: true,
        facadePointCount: 2,
        groundPointCount: 1,
      },
    );

    expect(points.roofGridPoints.length).toBeGreaterThan(0);
    expect(points.facadeProxyPoints.length).toBe(2);
    expect(points.groundProxyPoints.length).toBe(1);
    expect(points.allPoints.length).toBe(
      points.roofGridPoints.length + points.facadeProxyPoints.length + points.groundProxyPoints.length,
    );
  });

  it('places facade proxies outside the footprint at facade height', () => {
    const facade = generateFacadeProxyPoints(
      SQUARE_FOOTPRINT,
      2,
      { facadePointCount: 2, facadeOffsetMeters: 0.75, facadeHeightMeters: 1.5 },
    );

    expect(facade.length).toBe(2);
    for (const [x, y, z] of facade) {
      expect(isPointInPolygon(x, z, VIEWER_POLYGON)).toBe(false);
      expect(y).toBeCloseTo(3.5, 6);
    }
  });

  it('places ground proxies outside the footprint close to ground', () => {
    const ground = generateGroundProxyPoints(
      SQUARE_FOOTPRINT,
      2,
      { groundPointCount: 1, groundOffsetMeters: 3, groundHeightOffsetMeters: 0.1 },
    );

    expect(ground.length).toBe(1);
    const [x, y, z] = ground[0];
    expect(isPointInPolygon(x, z, VIEWER_POLYGON)).toBe(false);
    expect(y).toBeCloseTo(2.1, 6);
  });

  it('returns no proxy points for invalid footprint', () => {
    expect(generateFacadeProxyPoints([], 2)).toEqual([]);
    expect(generateGroundProxyPoints([[0, 0], [1, 1]], 2)).toEqual([]);
  });
});
