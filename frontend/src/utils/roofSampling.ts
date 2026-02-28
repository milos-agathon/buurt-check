export type RoofPoint3D = [number, number, number];
export type PolygonPoint2D = [number, number];
export type CardinalOrientation = 'north' | 'south' | 'east' | 'west';

export interface FacadePoint {
  point: RoofPoint3D;
  orientation: CardinalOrientation;
  heightLabel: string;
}

export interface RoofSamplingOptions {
  gridSpacingMeters?: number;
  maxPoints?: number;
  includeFootprintVertices?: boolean;
  includeCentroid?: boolean;
}

export const DEFAULT_GRID_SPACING_METERS = 2;
export const DEFAULT_MAX_ROOF_POINTS = 64;

export const HIGH_DENSITY_GRID_SPACING = 1;
export const HIGH_DENSITY_MAX_POINTS = 256;

function toPointKey(x: number, z: number): string {
  return `${x.toFixed(2)}:${z.toFixed(2)}`;
}

export function toViewerPolygon(footprint: number[][]): PolygonPoint2D[] {
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

function computeSignedArea2D(polygon: number[][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return area / 2;
}

function ensureCW(footprint: number[][]): number[][] {
  if (footprint.length < 3) return footprint;
  const area = computeSignedArea2D(footprint);
  return area > 0 ? [...footprint].reverse() : footprint;
}

export function getEdgeOrientation(
  p1: number[],
  p2: number[],
): CardinalOrientation {
  const edx = p2[0] - p1[0];
  const edy = p2[1] - p1[1];

  // CW footprint outward normal in RD: (edy, -edx)
  // Viewer north is -Z, so +Z points south.
  const nx = edy;
  const nz = edx;

  if (Math.abs(nz) > Math.abs(nx)) {
    return nz > 0 ? 'south' : 'north';
  }

  return nx > 0 ? 'east' : 'west';
}

export function generateFacadePoints(
  footprint: number[][],
  groundHeight: number,
  windowHeights: number[] = [1.5, 4.5],
): FacadePoint[] {
  if (!Number.isFinite(groundHeight) || footprint.length < 3) return [];

  const cwFootprint = ensureCW(footprint);
  const points: FacadePoint[] = [];
  const offsetMeters = 0.5;

  for (let i = 0; i < cwFootprint.length; i++) {
    const p1 = cwFootprint[i];
    const p2 = cwFootprint[(i + 1) % cwFootprint.length];

    const edx = p2[0] - p1[0];
    const edy = p2[1] - p1[1];
    const length = Math.hypot(edx, edy);
    if (length < 0.1) continue;

    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;
    const nx = edy / length;
    const ny = -edx / length;

    const rdX = mx + (nx * offsetMeters);
    const rdY = my + (ny * offsetMeters);
    const orientation = getEdgeOrientation(p1, p2);

    for (const height of windowHeights) {
      if (!Number.isFinite(height)) continue;
      points.push({
        point: [rdX, groundHeight + height, -rdY],
        orientation,
        heightLabel: `${height}m`,
      });
    }
  }

  return points;
}

const EYE_HEIGHT_METERS = 1.5;

export function generateGroundProxyPoints(
  footprint: number[][],
  groundHeight: number,
  bufferDistance: number = 5,
  numPoints: number = 8,
): RoofPoint3D[] {
  if (!Number.isFinite(groundHeight) || footprint.length < 3) return [];

  const safeBuffer = Number.isFinite(bufferDistance) ? Math.max(0, bufferDistance) : 0;
  const safeNumPoints = Number.isFinite(numPoints) ? Math.max(0, Math.floor(numPoints)) : 0;
  if (safeNumPoints <= 0) return [];

  const centroidX = footprint.reduce((sum, point) => sum + point[0], 0) / footprint.length;
  const centroidY = footprint.reduce((sum, point) => sum + point[1], 0) / footprint.length;

  const maxDistFromCentroid = Math.max(
    ...footprint.map((point) => Math.hypot(point[0] - centroidX, point[1] - centroidY)),
  );

  const radius = maxDistFromCentroid + safeBuffer;
  const points: RoofPoint3D[] = [];

  for (let i = 0; i < safeNumPoints; i++) {
    const angle = (2 * Math.PI * i) / safeNumPoints;
    const rdX = centroidX + (radius * Math.cos(angle));
    const rdY = centroidY + (radius * Math.sin(angle));
    points.push([rdX, groundHeight + EYE_HEIGHT_METERS, -rdY]);
  }

  return points;
}
