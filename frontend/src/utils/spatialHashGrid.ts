/**
 * Spatial hash grid for fast 2D nearest-neighbor queries.
 *
 * Reduces heatmap vertex coloring from O(n*m) brute-force to O(n) amortized
 * by bucketing roof points into a grid. For each query, only the 3x3
 * neighborhood of cells around the query point is searched.
 *
 * Typical usage: ~10,000 ground vertices x ~500 roof points.
 * Brute-force: 5,000,000 distance checks.
 * With grid (cell ~5m, roof spacing ~2m): ~9 cells x ~4 pts = ~36 checks per vertex.
 */

export interface NearestResult {
  index: number;
  distSq: number;
}

export class SpatialHashGrid {
  private readonly invCellSize: number;
  private readonly cells: Map<string, number[]>;

  constructor(cellSize: number) {
    this.invCellSize = 1.0 / cellSize;
    this.cells = new Map();
  }

  /** Insert a point index at (x, z) into the grid. */
  insert(index: number, x: number, z: number): void {
    const key = this.cellKey(x, z);
    const cell = this.cells.get(key);
    if (cell) {
      cell.push(index);
    } else {
      this.cells.set(key, [index]);
    }
  }

  /**
   * Find the nearest inserted point to (qx, qz).
   * Searches the 3x3 neighborhood of cells around the query point.
   * Returns null if no points have been inserted.
   */
  findNearest(
    qx: number,
    qz: number,
    points: ReadonlyArray<readonly [number, number, number]>,
  ): NearestResult | null {
    const cx = Math.floor(qx * this.invCellSize);
    const cz = Math.floor(qz * this.invCellSize);

    let bestIndex = -1;
    let bestDistSq = Infinity;

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const key = `${cx + di}:${cz + dj}`;
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (let k = 0; k < cell.length; k++) {
          const idx = cell[k];
          const pt = points[idx];
          const dx = pt[0] - qx;
          const dz = pt[2] - qz;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = idx;
          }
        }
      }
    }

    if (bestIndex < 0) return null;
    return { index: bestIndex, distSq: bestDistSq };
  }

  /** Number of occupied cells (for diagnostics). */
  get size(): number {
    return this.cells.size;
  }

  private cellKey(x: number, z: number): string {
    return `${Math.floor(x * this.invCellSize)}:${Math.floor(z * this.invCellSize)}`;
  }
}

/**
 * Build a spatial hash grid from roof sample points.
 * Uses point[0] (x) and point[2] (z) for 2D spatial indexing.
 *
 * @param points - Roof points in viewer coordinates [x, y, z]
 * @param cellSize - Grid cell size in meters (default: 5m, ~2.5x the typical 2m grid spacing)
 */
export function buildRoofPointGrid(
  points: ReadonlyArray<readonly [number, number, number]>,
  cellSize = 5,
): SpatialHashGrid {
  const grid = new SpatialHashGrid(cellSize);
  for (let i = 0; i < points.length; i++) {
    grid.insert(i, points[i][0], points[i][2]);
  }
  return grid;
}
