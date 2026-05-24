import { describe, expect, it } from 'vitest';
import { computeRoofNormal, incidenceAngle } from './surfaceNormals';

describe('computeRoofNormal', () => {
  it('returns upward normal for flat roof polygon', () => {
    const normal = computeRoofNormal([
      [0, 10, 0],
      [5, 10, 0],
      [5, 10, -5],
      [0, 10, -5],
    ]);
    expect(normal[0]).toBeCloseTo(0, 5);
    expect(normal[1]).toBeCloseTo(1, 5);
    expect(normal[2]).toBeCloseTo(0, 5);
  });

  it('flips downward normal to face upward', () => {
    const normal = computeRoofNormal([
      [0, 10, 0],
      [0, 10, -5],
      [5, 10, -5],
      [5, 10, 0],
    ]);
    expect(normal[1]).toBeGreaterThan(0);
  });

  it('returns fallback up vector for invalid polygons', () => {
    expect(computeRoofNormal([])).toEqual([0, 1, 0]);
    expect(computeRoofNormal([[0, 0, 0], [1, 0, 0]])).toEqual([0, 1, 0]);
  });
});

describe('incidenceAngle', () => {
  it('returns 0 for perfectly aligned vectors', () => {
    expect(incidenceAngle([0, 1, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it('returns pi/2 for orthogonal vectors', () => {
    expect(incidenceAngle([0, 1, 0], [1, 0, 0])).toBeCloseTo(Math.PI / 2, 6);
  });
});
