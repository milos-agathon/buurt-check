import { describe, it, expect } from 'vitest';
import { SpatialHashGrid, buildRoofPointGrid } from './spatialHashGrid';

describe('SpatialHashGrid', () => {
  it('returns null when no points are inserted', () => {
    const grid = new SpatialHashGrid(5);
    const points: [number, number, number][] = [];
    expect(grid.findNearest(0, 0, points)).toBeNull();
  });

  it('finds the single inserted point', () => {
    const grid = new SpatialHashGrid(5);
    const points: [number, number, number][] = [[3, 10, 4]];
    grid.insert(0, 3, 4);
    const result = grid.findNearest(3, 4, points);
    expect(result).toEqual({ index: 0, distSq: 0 });
  });

  it('finds nearest among multiple points', () => {
    const grid = new SpatialHashGrid(5);
    const points: [number, number, number][] = [
      [0, 10, 0],   // index 0 — dist to (3,3) = sqrt(18)
      [10, 10, 10],  // index 1 — dist to (3,3) = sqrt(98)
      [2, 10, 2],    // index 2 — dist to (3,3) = sqrt(2), closest
    ];
    for (let i = 0; i < points.length; i++) {
      grid.insert(i, points[i][0], points[i][2]);
    }
    const result = grid.findNearest(3, 3, points);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(2);
    // Distance: sqrt((2-3)^2 + (2-3)^2) = sqrt(2), distSq = 2
    expect(result!.distSq).toBe(2);
  });

  it('handles points at cell boundaries correctly', () => {
    const cellSize = 5;
    const grid = new SpatialHashGrid(cellSize);
    // Place point exactly at cell boundary
    const points: [number, number, number][] = [
      [5, 10, 5],   // on cell boundary
      [4.9, 10, 4.9], // just inside cell (0,0)
    ];
    grid.insert(0, 5, 5);
    grid.insert(1, 4.9, 4.9);

    // Query from neighboring cell — should find nearest across boundary
    const result = grid.findNearest(5.1, 5.1, points);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0); // point at (5,5) is closer to (5.1, 5.1)
  });

  it('handles negative coordinates', () => {
    const grid = new SpatialHashGrid(5);
    const points: [number, number, number][] = [
      [-3, 10, -4],
      [-10, 10, -10],
    ];
    grid.insert(0, -3, -4);
    grid.insert(1, -10, -10);

    const result = grid.findNearest(-2, -3, points);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
  });

  it('reports correct cell count', () => {
    const grid = new SpatialHashGrid(10);
    // Points in the same cell
    grid.insert(0, 1, 1);
    grid.insert(1, 2, 2);
    expect(grid.size).toBe(1);

    // Point in a different cell
    grid.insert(2, 15, 15);
    expect(grid.size).toBe(2);
  });

  it('handles query point far from all points (beyond 3x3 neighborhood)', () => {
    const grid = new SpatialHashGrid(5);
    const points: [number, number, number][] = [[0, 10, 0]];
    grid.insert(0, 0, 0);

    // Query far away — still checks 3x3 around query cell, point is not in those cells
    const result = grid.findNearest(100, 100, points);
    // The point at (0,0) is in cell (0,0), query at (100,100) is in cell (20,20)
    // 3x3 neighborhood of (20,20) won't include (0,0)
    expect(result).toBeNull();
  });

  it('produces same results as brute force for dense point sets', () => {
    // Dense grid of points within a small area — guarantees brute-force
    // nearest is always within the 3x3 cell neighborhood.
    const cellSize = 5;
    const points: [number, number, number][] = [];
    // Place points on a 1m grid over a 20x20m area — 441 points, very dense
    for (let x = 0; x <= 20; x += 1) {
      for (let z = 0; z <= 20; z += 1) {
        points.push([x, 10, z]);
      }
    }

    const grid = buildRoofPointGrid(points, cellSize);

    // Query at fractional positions — brute-force nearest is always < 1m away,
    // well within the 3x3 neighborhood (15m radius).
    const queries = [
      [0.3, 0.7],
      [5.5, 5.5],
      [10.1, 9.9],
      [19.8, 0.2],
      [0.0, 20.0],
      [7.3, 13.8],
      [15.4, 2.6],
    ];

    for (const [qx, qz] of queries) {
      // Brute force
      let bruteIdx = -1;
      let bruteDistSq = Infinity;
      for (let j = 0; j < points.length; j++) {
        const dx = points[j][0] - qx;
        const dz = points[j][2] - qz;
        const d = dx * dx + dz * dz;
        if (d < bruteDistSq) {
          bruteDistSq = d;
          bruteIdx = j;
        }
      }

      const gridResult = grid.findNearest(qx, qz, points);
      expect(gridResult).not.toBeNull();
      expect(gridResult!.index).toBe(bruteIdx);
      expect(gridResult!.distSq).toBeCloseTo(bruteDistSq, 10);
    }
  });
});

describe('buildRoofPointGrid', () => {
  it('builds grid from roof points using x and z coordinates', () => {
    const points: [number, number, number][] = [
      [1, 20, 3],
      [6, 20, 8],
      [11, 20, 13],
    ];
    const grid = buildRoofPointGrid(points);
    expect(grid.size).toBeGreaterThan(0);

    const result = grid.findNearest(1, 3, points);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
    expect(result!.distSq).toBe(0);
  });

  it('respects custom cell size', () => {
    const points: [number, number, number][] = [
      [0, 10, 0],
      [1, 10, 1],
    ];
    // Very large cell — all points in one cell
    const grid = buildRoofPointGrid(points, 100);
    expect(grid.size).toBe(1);

    // Very small cell — each point in its own cell
    const gridSmall = buildRoofPointGrid(points, 0.5);
    expect(gridSmall.size).toBe(2);
  });

  it('handles empty array', () => {
    const grid = buildRoofPointGrid([]);
    expect(grid.size).toBe(0);
  });
});
