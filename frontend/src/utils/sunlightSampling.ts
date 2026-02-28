import {
  DEFAULT_GRID_SPACING_METERS,
  DEFAULT_MAX_ROOF_POINTS,
  generateRoofSamplePoints,
  toViewerPolygon,
  type PolygonPoint2D,
  type RoofPoint3D,
} from './roofSampling';

export interface SunlightSamplingOptions {
  gridSpacingMeters?: number;
  maxRoofPoints?: number;
  includeFacadePoints?: boolean;
  includeGroundPoints?: boolean;
  facadePointCount?: number;
  groundPointCount?: number;
  facadeOffsetMeters?: number;
  groundOffsetMeters?: number;
  facadeHeightMeters?: number;
  groundHeightOffsetMeters?: number;
}

export interface SunlightEvaluationPoints {
  roofGridPoints: RoofPoint3D[];
  facadeProxyPoints: RoofPoint3D[];
  groundProxyPoints: RoofPoint3D[];
  allPoints: RoofPoint3D[];
}

const DEFAULT_FACADE_POINT_COUNT = 2;
const DEFAULT_GROUND_POINT_COUNT = 1;
const DEFAULT_FACADE_OFFSET_METERS = 0.75;
const DEFAULT_GROUND_OFFSET_METERS = 3;
const DEFAULT_FACADE_HEIGHT_METERS = 1.5;
const DEFAULT_GROUND_HEIGHT_OFFSET_METERS = 0.1;

function toKey(x: number, y: number, z: number): string {
  return `${x.toFixed(2)}:${y.toFixed(2)}:${z.toFixed(2)}`;
}

function signedArea(polygon: PolygonPoint2D[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    area += (x1 * z2) - (x2 * z1);
  }
  return area / 2;
}

interface FootprintEdge {
  midpoint: PolygonPoint2D;
  length: number;
  outward: PolygonPoint2D;
}

function buildEdges(polygon: PolygonPoint2D[]): FootprintEdge[] {
  if (polygon.length < 2) return [];

  const ccw = signedArea(polygon) > 0;
  const edges: FootprintEdge[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length <= 1e-6) continue;

    const nx = ccw ? dz : -dz;
    const nz = ccw ? -dx : dx;
    const normalLength = Math.hypot(nx, nz) || 1;
    edges.push({
      midpoint: [(x1 + x2) / 2, (z1 + z2) / 2],
      length,
      outward: [nx / normalLength, nz / normalLength],
    });
  }

  edges.sort((a, b) => b.length - a.length);
  return edges;
}

export function generateFacadeProxyPoints(
  footprint: number[][],
  groundY: number,
  options: Pick<
    SunlightSamplingOptions,
    'facadePointCount' | 'facadeOffsetMeters' | 'facadeHeightMeters'
  > = {},
): RoofPoint3D[] {
  if (!Number.isFinite(groundY)) return [];

  const polygon = toViewerPolygon(footprint);
  if (polygon.length < 3) return [];

  const maxPoints = Math.max(0, Math.floor(options.facadePointCount ?? DEFAULT_FACADE_POINT_COUNT));
  if (maxPoints <= 0) return [];

  const offset = Math.max(0.1, options.facadeOffsetMeters ?? DEFAULT_FACADE_OFFSET_METERS);
  const evalY = groundY + Math.max(0.5, options.facadeHeightMeters ?? DEFAULT_FACADE_HEIGHT_METERS);
  const edges = buildEdges(polygon);

  const points: RoofPoint3D[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (points.length >= maxPoints) break;
    const x = edge.midpoint[0] + (edge.outward[0] * offset);
    const z = edge.midpoint[1] + (edge.outward[1] * offset);
    const key = toKey(x, evalY, z);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([x, evalY, z]);
  }

  return points;
}

export function generateGroundProxyPoints(
  footprint: number[][],
  groundY: number,
  options: Pick<
    SunlightSamplingOptions,
    'groundPointCount' | 'groundOffsetMeters' | 'groundHeightOffsetMeters'
  > = {},
): RoofPoint3D[] {
  if (!Number.isFinite(groundY)) return [];

  const polygon = toViewerPolygon(footprint);
  if (polygon.length < 3) return [];

  const maxPoints = Math.max(0, Math.floor(options.groundPointCount ?? DEFAULT_GROUND_POINT_COUNT));
  if (maxPoints <= 0) return [];

  const offset = Math.max(0.5, options.groundOffsetMeters ?? DEFAULT_GROUND_OFFSET_METERS);
  const evalY = groundY + Math.max(0, options.groundHeightOffsetMeters ?? DEFAULT_GROUND_HEIGHT_OFFSET_METERS);
  const edges = buildEdges(polygon);

  const points: RoofPoint3D[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (points.length >= maxPoints) break;
    const x = edge.midpoint[0] + (edge.outward[0] * offset);
    const z = edge.midpoint[1] + (edge.outward[1] * offset);
    const key = toKey(x, evalY, z);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([x, evalY, z]);
  }

  return points;
}

export function buildSunlightEvaluationPoints(
  footprint: number[][],
  roofY: number,
  groundY: number,
  options: SunlightSamplingOptions = {},
): SunlightEvaluationPoints {
  const roofGridPoints = generateRoofSamplePoints(footprint, roofY, {
    gridSpacingMeters: options.gridSpacingMeters ?? DEFAULT_GRID_SPACING_METERS,
    maxPoints: options.maxRoofPoints ?? DEFAULT_MAX_ROOF_POINTS,
    includeFootprintVertices: true,
    includeCentroid: true,
  });

  const facadeProxyPoints = options.includeFacadePoints
    ? generateFacadeProxyPoints(footprint, groundY, options)
    : [];
  const groundProxyPoints = options.includeGroundPoints
    ? generateGroundProxyPoints(footprint, groundY, options)
    : [];

  return {
    roofGridPoints,
    facadeProxyPoints,
    groundProxyPoints,
    allPoints: [...roofGridPoints, ...facadeProxyPoints, ...groundProxyPoints],
  };
}
