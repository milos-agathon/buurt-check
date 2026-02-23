export type RoofPoint3D = [number, number, number];
export type PolygonPoint2D = [number, number];

export interface RoofSamplingOptions {
  gridSpacingMeters?: number;
  maxPoints?: number;
  includeFootprintVertices?: boolean;
  includeCentroid?: boolean;
}

export const DEFAULT_GRID_SPACING_METERS = 2;
export const DEFAULT_MAX_ROOF_POINTS = 64;

function toPointKey(x: number, z: number): string {
  return `${x.toFixed(2)}:${z.toFixed(2)}`;
}

function toViewerPolygon(footprint: number[][]): PolygonPoint2D[] {
  const polygon: PolygonPoint2D[] = [];
  for (const point of footprint) {
    const x = point[0];
    const dy = point[1];
    if (!Number.isFinite(x) || !Number.isFinite(dy)) continue;
    // [dx, dy] in RD offsets -> [x, z] in viewer (north is -Z).
    polygon.push([x, -dy]);
  }
  return polygon;
}

function getBounds(polygon: PolygonPoint2D[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  return { minX, maxX, minZ, maxZ };
}

function getCentroid(polygon: PolygonPoint2D[]): PolygonPoint2D {
  const sum = polygon.reduce(
    (acc, [x, z]) => [acc[0] + x, acc[1] + z] as PolygonPoint2D,
    [0, 0],
  );
  return [sum[0] / polygon.length, sum[1] / polygon.length];
}

export function isPointInPolygon(x: number, z: number, polygon: PolygonPoint2D[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];

    const intersects = ((zi > z) !== (zj > z))
      && (x <= (((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON)) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

export function generateRoofSamplePoints(
  footprint: number[][],
  roofY: number,
  options: RoofSamplingOptions = {},
): RoofPoint3D[] {
  if (!Number.isFinite(roofY)) return [];

  const polygon = toViewerPolygon(footprint);
  if (polygon.length < 3) return [];

  const spacing = options.gridSpacingMeters ?? DEFAULT_GRID_SPACING_METERS;
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_ROOF_POINTS;
  const includeFootprintVertices = options.includeFootprintVertices ?? true;
  const includeCentroid = options.includeCentroid ?? true;

  if (spacing <= 0 || maxPoints <= 0) return [];

  const sampled: RoofPoint3D[] = [];
  const seen = new Set<string>();

  const addPoint = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const key = toPointKey(x, z);
    if (seen.has(key)) return;
    seen.add(key);
    sampled.push([x, roofY, z]);
  };

  if (includeFootprintVertices) {
    for (const [x, z] of polygon) {
      addPoint(x, z);
    }
  }

  if (includeCentroid) {
    const [cx, cz] = getCentroid(polygon);
    addPoint(cx, cz);
  }

  const { minX, maxX, minZ, maxZ } = getBounds(polygon);
  const epsilon = spacing * 0.25;

  for (let x = minX; x <= maxX + epsilon; x += spacing) {
    for (let z = minZ; z <= maxZ + epsilon; z += spacing) {
      if (isPointInPolygon(x, z, polygon)) {
        addPoint(x, z);
      }
    }
  }

  if (sampled.length <= maxPoints) {
    return sampled;
  }

  const mandatoryCount = Math.min(
    sampled.length,
    (includeFootprintVertices ? polygon.length : 0) + (includeCentroid ? 1 : 0),
  );
  const mandatory = sampled.slice(0, Math.min(mandatoryCount, maxPoints));
  if (mandatory.length === maxPoints) return mandatory;

  const remaining = sampled.slice(mandatoryCount);
  const slots = maxPoints - mandatory.length;
  const step = remaining.length / slots;
  const reduced: RoofPoint3D[] = [...mandatory];

  for (let i = 0; i < slots; i++) {
    const idx = Math.min(remaining.length - 1, Math.floor(i * step));
    reduced.push(remaining[idx]);
  }

  return reduced;
}
