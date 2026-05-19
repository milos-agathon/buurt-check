import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BufferGeometry, Material, Mesh } from 'three';
import type {
  MatchNeighborhoodAmenityPoint,
  MatchNeighborhoodBuildingFeature,
  MatchNeighborhoodBuildingsResponse,
  MatchNeighborhoodMapLayersResponse,
  MatchResultsBasemapConfig,
} from '../../types/matchFirst';

interface NeighborhoodBuildingLayerProps {
  layers: MatchNeighborhoodMapLayersResponse | null;
  buildings: MatchNeighborhoodBuildingsResponse | null;
  loading?: boolean;
  failed?: boolean;
  selectedBuildingId?: string | null;
  amenityPoints?: MatchNeighborhoodAmenityPoint[];
  activeAmenityKey?: string | null;
  basemapConfig?: MatchResultsBasemapConfig | null;
  basemapFailed?: boolean;
  onBasemapFailed?: (reason: string) => void;
  onSelectBuilding?: (building: MatchNeighborhoodBuildingFeature) => void;
}

type CanvasState = 'pending' | 'drawn' | 'three' | 'fallback';
type RenderMode = '2d' | '3d';
type ThreeModule = typeof import('three');
type OrbitControlsModule = typeof import('three/examples/jsm/controls/OrbitControls.js');
type FallbackReason =
  | 'none'
  | 'missing3d'
  | 'reduced_motion'
  | 'webgl_unavailable'
  | 'building_layer_failed';

interface LocalPoint {
  x: number;
  z: number;
}

interface LocalVertex extends LocalPoint {
  y: number;
}

interface SceneMetrics {
  centerLng: number;
  centerLat: number;
  metersPerLng: number;
  metersPerLat: number;
  spanX: number;
  spanZ: number;
}

interface SceneFrame {
  targetX: number;
  targetY: number;
  targetZ: number;
  spanX: number;
  spanY: number;
  spanZ: number;
  span: number;
}

interface SceneControlsApi {
  zoom: (direction: 1 | -1) => void;
  reset: () => void;
}

interface RdPoint {
  x: number;
  y: number;
}

interface WgsPoint {
  lat: number;
  lng: number;
}

interface BasemapControlsApi {
  zoom: (direction: 1 | -1) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  reset: () => void;
}

interface MarkerPosition {
  left: number;
  top: number;
}

interface MapOverlayFrame {
  width: number;
  height: number;
  version: number;
}

interface AmenityMarkerItem {
  point: MatchNeighborhoodAmenityPoint;
  position: MarkerPosition;
  projection: 'leaflet' | 'bounds';
  offsetX: number;
  offsetY: number;
}

type LeafletBoundsTuple = [[number, number], [number, number]];

const DEFAULT_BUILDING_HEIGHT_M = 9;
const MAX_BUILDING_HEIGHT_M = 80;
const MIN_BUILDING_HEIGHT_M = 3;
const MAX_RENDERED_BUILDINGS = 80;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MIN_CAMERA_FRAME_M = 80;
const POINTER_CLICK_THRESHOLD_PX = 7;
const BASEMAP_ZOOM_STEP = 0.5;
const MIN_PROJECTED_BUILDING_SIZE_PX = 10;
const BUILDING_COPPER = 0xc36d4b;
const BUILDING_COPPER_SELECTED = 0x924628;
const BUILDING_COPPER_EMISSIVE = 0x5f2b18;
const RD_REFERENCE_X = 155000;
const RD_REFERENCE_Y = 463000;
const WGS_REFERENCE_LAT = 52.15517440;
const WGS_REFERENCE_LNG = 5.38720621;
const RD_LAT_TERMS = [
  [0, 1, 3235.65389],
  [2, 0, -32.58297],
  [0, 2, -0.24750],
  [2, 1, -0.84978],
  [0, 3, -0.06550],
  [2, 2, -0.01709],
  [1, 0, -0.00738],
  [4, 0, 0.00530],
  [2, 3, -0.00039],
  [4, 1, 0.00033],
  [1, 1, -0.00012],
] as const;
const RD_LNG_TERMS = [
  [1, 0, 5260.52916],
  [1, 1, 105.94684],
  [1, 2, 2.45656],
  [3, 0, -0.81885],
  [1, 3, 0.05594],
  [3, 1, -0.05607],
  [0, 1, 0.01199],
  [3, 2, -0.00256],
  [1, 4, 0.00128],
  [0, 2, 0.00022],
  [2, 0, -0.00022],
  [5, 0, 0.00026],
] as const;

function isReducedMotionEnabled(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function outerRing(building: MatchNeighborhoodBuildingFeature): number[][] | null {
  const ring = building.footprint.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const points = ring.filter((point): point is number[] => (
    Array.isArray(point)
    && point.length >= 2
    && isFiniteNumber(point[0])
    && isFiniteNumber(point[1])
  ));
  if (points.length < 4) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return points.slice(0, -1);
  }
  return points;
}

function renderableBuildings(
  buildings: MatchNeighborhoodBuildingsResponse | null,
): MatchNeighborhoodBuildingFeature[] {
  return (buildings?.buildings ?? [])
    .filter((building) => outerRing(building) !== null)
    .slice(0, MAX_RENDERED_BUILDINGS);
}

function isValidRoofSurface(surface: number[][]): boolean {
  return surface.length >= 3
    && surface.every((vertex) => (
      Array.isArray(vertex)
      && vertex.length >= 3
      && isFiniteNumber(vertex[0])
      && isFiniteNumber(vertex[1])
      && isFiniteNumber(vertex[2])
    ));
}

function lod22Surfaces(building: MatchNeighborhoodBuildingFeature): number[][][] {
  return (building.roof_surfaces ?? []).filter(isValidRoofSurface);
}

function hasLod22Surfaces(building: MatchNeighborhoodBuildingFeature): boolean {
  return lod22Surfaces(building).length > 0;
}

function geometrySourceLabel(buildings: MatchNeighborhoodBuildingFeature[]): string {
  if (buildings.some(hasLod22Surfaces)) return '3dbag_lod22';
  if (buildings.some((building) => building.geometry_source === '3dbag_lod0')) return '3dbag_lod0';
  return 'wgs84_extrusion';
}

function sceneMetrics(boundsWgs84: number[] | undefined): SceneMetrics | null {
  if (!boundsWgs84 || boundsWgs84.length !== 4) return null;
  const [west, south, east, north] = boundsWgs84;
  if (![west, south, east, north].every(isFiniteNumber) || west >= east || south >= north) {
    return null;
  }
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const metersPerLat = 111_320;
  const metersPerLng = Math.max(Math.cos((centerLat * Math.PI) / 180) * metersPerLat, 1);
  return {
    centerLng,
    centerLat,
    metersPerLng,
    metersPerLat,
    spanX: Math.max((east - west) * metersPerLng, 40),
    spanZ: Math.max((north - south) * metersPerLat, 40),
  };
}

function pointMarkerPosition(
  point: MatchNeighborhoodAmenityPoint,
  boundsWgs84: number[] | undefined,
  map: L.Map | null = null,
  frame: MapOverlayFrame | null = null,
): MarkerPosition | null {
  if (map && frame) {
    const projected = map.latLngToContainerPoint([point.display_lat, point.display_lng]);
    const left = (projected.x / Math.max(frame.width, 1)) * 100;
    const top = (projected.y / Math.max(frame.height, 1)) * 100;
    if (!isFiniteNumber(left) || !isFiniteNumber(top)) return null;
    return { left, top };
  }

  if (!boundsWgs84 || boundsWgs84.length !== 4) return null;
  const [west, south, east, north] = boundsWgs84;
  if (![west, south, east, north, point.display_lng, point.display_lat].every(isFiniteNumber)) {
    return null;
  }
  if (west >= east || south >= north) return null;
  const left = ((point.display_lng - west) / (east - west)) * 100;
  const top = (1 - ((point.display_lat - south) / (north - south))) * 100;
  if (left < 0 || left > 100 || top < 0 || top > 100) return null;
  return { left, top };
}

function addAmenityMarkerOffsets(
  items: Array<Omit<AmenityMarkerItem, 'offsetX' | 'offsetY'>>,
  frame: MapOverlayFrame | null,
): AmenityMarkerItem[] {
  const width = Math.max(frame?.width ?? 640, 1);
  const height = Math.max(frame?.height ?? 420, 1);
  const candidateOffsets = [
    [0, 0],
    [0, 48],
    [0, -48],
    [96, 0],
    [-96, 0],
    [84, 44],
    [-84, 44],
    [84, -44],
    [-84, -44],
    [0, 92],
  ] as const;
  const placed: Array<{ x: number; y: number }> = [];

  return items.map((item) => {
    const anchorX = (item.position.left / 100) * width;
    const anchorY = (item.position.top / 100) * height;
    const [offsetX, offsetY] = candidateOffsets.find(([candidateX, candidateY]) => {
      const x = anchorX + candidateX;
      const y = anchorY + candidateY;
      const insideReadableArea = x > 42 && x < width - 42 && y > 30 && y < height - 30;
      const separated = placed.every((marker) => Math.abs(marker.x - x) > 108 || Math.abs(marker.y - y) > 46);
      return insideReadableArea && separated;
    }) ?? [0, 0];
    placed.push({ x: anchorX + offsetX, y: anchorY + offsetY });
    return {
      ...item,
      offsetX,
      offsetY,
    };
  });
}

function validRdPoint(point: MatchNeighborhoodBuildingFeature['center_rd']): RdPoint | null {
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;
  return point;
}

function rdToWgs84(x: number, y: number): WgsPoint {
  const dx = (x - RD_REFERENCE_X) * 0.00001;
  const dy = (y - RD_REFERENCE_Y) * 0.00001;
  const latSeconds = RD_LAT_TERMS.reduce(
    (sum, [xPower, yPower, coefficient]) => sum + coefficient * (dx ** xPower) * (dy ** yPower),
    0,
  );
  const lngSeconds = RD_LNG_TERMS.reduce(
    (sum, [xPower, yPower, coefficient]) => sum + coefficient * (dx ** xPower) * (dy ** yPower),
    0,
  );
  return {
    lat: WGS_REFERENCE_LAT + (latSeconds / 3600),
    lng: WGS_REFERENCE_LNG + (lngSeconds / 3600),
  };
}

function rdOffsetToLatLng(
  point: number[],
  metrics: SceneMetrics,
  centerRd?: RdPoint | null,
): [number, number] | null {
  const [dx, dy] = point;
  if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return null;
  if (centerRd) {
    const wgs = rdToWgs84(centerRd.x + dx, centerRd.y + dy);
    return [wgs.lat, wgs.lng];
  }
  return [
    metrics.centerLat + (dy / metrics.metersPerLat),
    metrics.centerLng + (dx / metrics.metersPerLng),
  ];
}

function wgsPointToLocalScreen(
  point: number[],
  map: L.Map,
  frame: MapOverlayFrame,
): LocalPoint | null {
  const [lng, lat] = point;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  const projected = map.latLngToContainerPoint([lat, lng]);
  if (!isFiniteNumber(projected.x) || !isFiniteNumber(projected.y)) return null;
  return {
    x: projected.x - (frame.width / 2),
    z: projected.y - (frame.height / 2),
  };
}

function wgsPointToContainer(point: number[], map: L.Map): L.Point | null {
  const [lng, lat] = point;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  const projected = map.latLngToContainerPoint([lat, lng]);
  if (!isFiniteNumber(projected.x) || !isFiniteNumber(projected.y)) return null;
  return projected;
}

function buildingContainerRing(
  building: MatchNeighborhoodBuildingFeature,
  map: L.Map,
): L.Point[] {
  return (outerRing(building) ?? [])
    .map((point) => wgsPointToContainer(point, map))
    .filter((point): point is L.Point => point !== null);
}

function pointInContainerRing(point: L.Point, ring: L.Point[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y);
    if (!crosses) continue;
    const intersectionX = ((previous.x - current.x) * (point.y - current.y))
      / (previous.y - current.y)
      + current.x;
    if (point.x < intersectionX) inside = !inside;
  }
  return inside;
}

function distanceToContainerSegment(point: L.Point, start: L.Point, end: L.Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.min(Math.max(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0), 1);
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
}

function distanceToContainerRing(point: L.Point, ring: L.Point[]): number {
  if (ring.length === 0) return Number.POSITIVE_INFINITY;
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    closest = Math.min(closest, distanceToContainerSegment(point, start, end));
  }
  return closest;
}

function findBuildingAtContainerPoint(
  point: L.Point,
  buildings: MatchNeighborhoodBuildingFeature[],
  map: L.Map,
): MatchNeighborhoodBuildingFeature | null {
  const hitThresholdPx = 12;
  let nearest: { building: MatchNeighborhoodBuildingFeature; distance: number } | null = null;
  for (const building of buildings) {
    const ring = buildingContainerRing(building, map);
    if (pointInContainerRing(point, ring)) return building;
    const distance = distanceToContainerRing(point, ring);
    if (distance <= hitThresholdPx && (!nearest || distance < nearest.distance)) {
      nearest = { building, distance };
    }
  }
  return nearest?.building ?? null;
}

function buildingLeafletBounds(
  building: MatchNeighborhoodBuildingFeature,
): L.LatLngBoundsExpression | null {
  const ring = outerRing(building);
  if (!ring || ring.length < 3) return null;
  const latLngs = ring
    .map((point) => {
      const [lng, lat] = point;
      if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
      return [lat, lng] as [number, number];
    })
    .filter((point): point is [number, number] => point !== null);
  if (latLngs.length < 3) return null;
  return L.latLngBounds(latLngs);
}

function rdOffsetToLocalScreen(
  point: number[],
  metrics: SceneMetrics,
  map: L.Map,
  frame: MapOverlayFrame,
  centerRd?: RdPoint | null,
): LocalPoint | null {
  const latLng = rdOffsetToLatLng(point, metrics, centerRd);
  if (!latLng) return null;
  const projected = map.latLngToContainerPoint(latLng);
  if (!isFiniteNumber(projected.x) || !isFiniteNumber(projected.y)) return null;
  return {
    x: projected.x - (frame.width / 2),
    z: projected.y - (frame.height / 2),
  };
}

function mapPixelsPerMeter(metrics: SceneMetrics, map: L.Map): number {
  const center = map.latLngToContainerPoint([metrics.centerLat, metrics.centerLng]);
  const east = map.latLngToContainerPoint([
    metrics.centerLat,
    metrics.centerLng + (10 / metrics.metersPerLng),
  ]);
  const north = map.latLngToContainerPoint([
    metrics.centerLat + (10 / metrics.metersPerLat),
    metrics.centerLng,
  ]);
  const xScale = Math.abs(east.x - center.x) / 10;
  const yScale = Math.abs(north.y - center.y) / 10;
  return Math.max((xScale + yScale) / 2, 0.05);
}

function mapProjectedFootprintLocalPoints(
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
  map: L.Map,
  frame: MapOverlayFrame,
): LocalPoint[] {
  const wgsRing = outerRing(building);
  if (wgsRing) {
    const projected = wgsRing
      .map((point) => wgsPointToLocalScreen(point, map, frame))
      .filter((point): point is LocalPoint => point !== null);
    if (projected.length >= 3) return projected;
  }

  const rdPoints = (building.footprint_rd ?? []).filter((point): point is number[] => (
    Array.isArray(point)
    && point.length >= 2
    && isFiniteNumber(point[0])
    && isFiniteNumber(point[1])
  ));
  const openPoints = rdPoints.length > 1
    && rdPoints[0]?.[0] === rdPoints[rdPoints.length - 1]?.[0]
    && rdPoints[0]?.[1] === rdPoints[rdPoints.length - 1]?.[1]
    ? rdPoints.slice(0, -1)
    : rdPoints;
  const centerRd = validRdPoint(building.center_rd);
  return openPoints
    .map((point) => rdOffsetToLocalScreen(point, metrics, map, frame, centerRd))
    .filter((point): point is LocalPoint => point !== null);
}

function toLocalPoint(point: number[], metrics: SceneMetrics): LocalPoint {
  const [lng, lat] = point;
  return {
    x: (lng - metrics.centerLng) * metrics.metersPerLng,
    z: -(lat - metrics.centerLat) * metrics.metersPerLat,
  };
}

function rdFootprintLocalPoints(building: MatchNeighborhoodBuildingFeature): LocalPoint[] | null {
  const points = (building.footprint_rd ?? []).filter((point): point is number[] => (
    Array.isArray(point)
    && point.length >= 2
    && isFiniteNumber(point[0])
    && isFiniteNumber(point[1])
  ));
  if (points.length < 3) return null;
  const openPoints = points.length > 1
    && points[0]?.[0] === points[points.length - 1]?.[0]
    && points[0]?.[1] === points[points.length - 1]?.[1]
    ? points.slice(0, -1)
    : points;
  if (openPoints.length < 3) return null;
  return openPoints.map((point) => ({
    x: point[0],
    z: -point[1],
  }));
}

function footprintLocalPoints(
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
): LocalPoint[] {
  return rdFootprintLocalPoints(building)
    ?? (outerRing(building)?.map((point) => toLocalPoint(point, metrics)) ?? []);
}

function buildingHeight(building: MatchNeighborhoodBuildingFeature): number {
  if (isFiniteNumber(building.height_m) && building.height_m > 0) {
    return Math.min(Math.max(building.height_m, MIN_BUILDING_HEIGHT_M), MAX_BUILDING_HEIGHT_M);
  }
  return DEFAULT_BUILDING_HEIGHT_M;
}

function buildingFrameVertices(
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
): LocalVertex[] {
  const surfaces = lod22Surfaces(building);
  if (surfaces.length > 0) {
    const groundHeight = isFiniteNumber(building.ground_height_m) ? building.ground_height_m : 0;
    return surfaces.flatMap((surface) => surface.map((vertex) => ({
      x: vertex[0],
      y: vertex[2] - groundHeight,
      z: -vertex[1],
    })));
  }

  const height = buildingHeight(building);
  return footprintLocalPoints(building, metrics).flatMap((point) => [
    { x: point.x, y: 0, z: point.z },
    { x: point.x, y: height, z: point.z },
  ]);
}

function sceneFrame(metrics: SceneMetrics, buildings: MatchNeighborhoodBuildingFeature[]): SceneFrame {
  const vertices = buildings.flatMap((building) => buildingFrameVertices(building, metrics));
  if (vertices.length === 0) {
    const fallbackSpan = Math.max(metrics.spanX, metrics.spanZ, MIN_CAMERA_FRAME_M);
    return {
      targetX: 0,
      targetY: DEFAULT_BUILDING_HEIGHT_M,
      targetZ: 0,
      spanX: fallbackSpan,
      spanY: DEFAULT_BUILDING_HEIGHT_M,
      spanZ: fallbackSpan,
      span: fallbackSpan,
    };
  }

  const xs = vertices.map((vertex) => vertex.x);
  const ys = vertices.map((vertex) => vertex.y);
  const zs = vertices.map((vertex) => vertex.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 16);
  const spanY = Math.max(maxY - minY, MIN_BUILDING_HEIGHT_M);
  const spanZ = Math.max(maxZ - minZ, 16);
  const span = Math.max(spanX, spanZ, spanY * 1.8, MIN_CAMERA_FRAME_M);

  return {
    targetX: (minX + maxX) / 2,
    targetY: Math.max((minY + maxY) / 2, MIN_BUILDING_HEIGHT_M),
    targetZ: (minZ + maxZ) / 2,
    spanX,
    spanY,
    spanZ,
    span,
  };
}

function createLod22Geometry(
  THREE: ThreeModule,
  building: MatchNeighborhoodBuildingFeature,
): BufferGeometry | null {
  const surfaces = lod22Surfaces(building);
  if (surfaces.length === 0) return null;
  const groundHeight = isFiniteNumber(building.ground_height_m) ? building.ground_height_m : 0;
  const positions: number[] = [];
  const indices: number[] = [];

  surfaces.forEach((surface) => {
    const baseIndex = positions.length / 3;
    surface.forEach((vertex) => {
      positions.push(vertex[0], vertex[2] - groundHeight, -vertex[1]);
    });
    for (let index = 1; index < surface.length - 1; index += 1) {
      indices.push(baseIndex, baseIndex + index, baseIndex + index + 1);
    }
  });

  if (positions.length < 9 || indices.length < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function expandProjectedPositions(positions: number[]): number[] {
  if (positions.length < 9) return positions;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    xs.push(positions[index]);
    zs.push(positions[index + 2]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const hasProjectedWidth = spanX > Number.EPSILON;
  const hasProjectedDepth = spanZ > Number.EPSILON;
  const scaleX =
    hasProjectedWidth && spanX < MIN_PROJECTED_BUILDING_SIZE_PX
      ? MIN_PROJECTED_BUILDING_SIZE_PX / spanX
      : 1;
  const scaleZ =
    hasProjectedDepth && spanZ < MIN_PROJECTED_BUILDING_SIZE_PX
      ? MIN_PROJECTED_BUILDING_SIZE_PX / spanZ
      : 1;
  const needsZeroXExpansion = spanX <= Number.EPSILON;
  const needsZeroZExpansion = spanZ <= Number.EPSILON;
  if (scaleX === 1 && scaleZ === 1 && !needsZeroXExpansion && !needsZeroZExpansion) return positions;

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return positions.map((value, index) => {
    const vertexIndex = Math.floor(index / 3);
    if (index % 3 === 0) {
      return needsZeroXExpansion
        ? centerX + (vertexIndex % 2 === 0 ? -MIN_PROJECTED_BUILDING_SIZE_PX / 2 : MIN_PROJECTED_BUILDING_SIZE_PX / 2)
        : centerX + ((value - centerX) * scaleX);
    }
    if (index % 3 === 2) {
      return needsZeroZExpansion
        ? centerZ + (vertexIndex < 2 ? -MIN_PROJECTED_BUILDING_SIZE_PX / 2 : MIN_PROJECTED_BUILDING_SIZE_PX / 2)
        : centerZ + ((value - centerZ) * scaleZ);
    }
    return value;
  });
}

function createMapProjectedLod22Geometry(
  THREE: ThreeModule,
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
  map: L.Map,
  frame: MapOverlayFrame,
  pixelsPerMeter: number,
): BufferGeometry | null {
  const surfaces = lod22Surfaces(building);
  if (surfaces.length === 0) return null;
  const groundHeight = isFiniteNumber(building.ground_height_m) ? building.ground_height_m : 0;
  const positions: number[] = [];
  const indices: number[] = [];
  const centerRd = validRdPoint(building.center_rd);

  surfaces.forEach((surface) => {
    const projectedSurface = surface
      .map((vertex) => {
        const projected = rdOffsetToLocalScreen(vertex, metrics, map, frame, centerRd);
        if (!projected) return null;
        return {
          x: projected.x,
          y: (vertex[2] - groundHeight) * pixelsPerMeter,
          z: projected.z,
        };
      })
      .filter((vertex): vertex is LocalVertex => vertex !== null);
    if (projectedSurface.length < 3) return;

    const baseIndex = positions.length / 3;
    projectedSurface.forEach((vertex) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });
    for (let index = 1; index < projectedSurface.length - 1; index += 1) {
      indices.push(baseIndex, baseIndex + index, baseIndex + index + 1);
    }
  });

  if (positions.length < 9 || indices.length < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(expandProjectedPositions(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createExtrudedFootprintGeometry(
  THREE: ThreeModule,
  localPoints: LocalPoint[],
  height: number,
): BufferGeometry | null {
  const firstPoint = localPoints[0];
  if (!firstPoint || localPoints.length < 3) return null;

  const shape = new THREE.Shape();
  shape.moveTo(firstPoint.x, -firstPoint.z);
  localPoints.slice(1).forEach((point) => {
    shape.lineTo(point.x, -point.z);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function hasWebGLSupport(): boolean {
  try {
    const probe = document.createElement('canvas');
    const context = (
      probe.getContext('webgl2')
      || probe.getContext('webgl')
      || probe.getContext('experimental-webgl')
    ) as WebGLRenderingContext | WebGL2RenderingContext | null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function createWebGlRenderer(THREE: ThreeModule, canvas: HTMLCanvasElement) {
  const baseOptions = {
    canvas,
    alpha: true,
  };
  try {
    return new THREE.WebGLRenderer({
      ...baseOptions,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return new THREE.WebGLRenderer({
      ...baseOptions,
      antialias: false,
      preserveDrawingBuffer: false,
    });
  }
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }
  material.dispose();
}

function leafletBounds(boundsWgs84: number[] | undefined): LeafletBoundsTuple | null {
  if (!boundsWgs84 || boundsWgs84.length !== 4) return null;
  const [west, south, east, north] = boundsWgs84;
  if (![west, south, east, north].every(isFiniteNumber) || west >= east || south >= north) {
    return null;
  }
  return [
    [south, west],
    [north, east],
  ];
}

function drawFallbackScene(
  canvas: HTMLCanvasElement,
  buildings: MatchNeighborhoodBuildingsResponse | null,
  zoom = 1,
  basemapAvailable = false,
): CanvasState {
  const context = canvas.getContext('2d');
  if (!context) return 'fallback';

  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 360;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  if (!basemapAvailable) {
    context.fillStyle = '#eef6f3';
    context.fillRect(0, 0, width, height);
  }

  const scale = Math.min(Math.max(zoom, 0.75), 1.8);
  const sx = (value: number) => width / 2 + (value - width / 2) * scale;
  const sy = (value: number) => height / 2 + (value - height / 2) * scale;
  const sw = (value: number) => value * scale;
  const sh = (value: number) => value * scale;

  context.strokeStyle = '#924628';
  context.lineWidth = 3;
  context.strokeRect(sx(width * 0.12), sy(height * 0.14), sw(width * 0.76), sh(height * 0.72));

  context.fillStyle = 'rgba(195, 109, 75, 0.16)';
  context.fillRect(sx(width * 0.18), sy(height * 0.24), sw(width * 0.18), sh(height * 0.18));
  context.fillRect(sx(width * 0.44), sy(height * 0.28), sw(width * 0.16), sh(height * 0.26));
  context.fillRect(sx(width * 0.64), sy(height * 0.46), sw(width * 0.16), sh(height * 0.2));

  if (buildings?.buildings.length) {
    context.fillStyle = 'rgba(195, 109, 75, 0.42)';
    buildings.buildings.slice(0, 10).forEach((_, index) => {
      const column = index % 5;
      const row = Math.floor(index / 5);
      context.fillRect(
        sx(width * (0.2 + column * 0.12)),
        sy(height * (0.32 + row * 0.18)),
        sw(width * 0.07),
        sh(height * 0.08),
      );
    });
  }

  return 'drawn';
}

export default function NeighborhoodBuildingLayer({
  layers,
  buildings,
  loading = false,
  failed = false,
  selectedBuildingId = null,
  amenityPoints = [],
  activeAmenityKey = null,
  basemapConfig = null,
  basemapFailed = false,
  onBasemapFailed,
  onSelectBuilding,
}: NeighborhoodBuildingLayerProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const basemapRef = useRef<HTMLDivElement | null>(null);
  const basemapMapRef = useRef<L.Map | null>(null);
  const sceneControlsRef = useRef<SceneControlsApi | null>(null);
  const basemapControlsRef = useRef<BasemapControlsApi | null>(null);
  const basemapPanRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId?: number;
  } | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>('pending');
  const [renderMode, setRenderMode] = useState<RenderMode>('2d');
  const [fallbackReason, setFallbackReason] = useState<FallbackReason>('none');
  const [fallbackZoom, setFallbackZoom] = useState(1);
  const [mapFrame, setMapFrame] = useState<MapOverlayFrame | null>(null);
  const [selectedAmenityPointId, setSelectedAmenityPointId] = useState<string | null>(null);
  const scopedBuildings = useMemo(() => renderableBuildings(buildings), [buildings]);
  const hasBasemap = Boolean(basemapConfig && !basemapFailed);
  const usesLeafletProjection = Boolean(hasBasemap && basemapMapRef.current && mapFrame);
  const visibleAmenityPoints = useMemo(() => {
    const projectedItems = amenityPoints
      .filter((point) => !activeAmenityKey || point.amenity_key === activeAmenityKey)
      .map((point) => ({
        point,
        position: pointMarkerPosition(
          point,
          layers?.display_bounds_wgs84,
          usesLeafletProjection ? basemapMapRef.current : null,
          usesLeafletProjection ? mapFrame : null,
        ),
        projection: usesLeafletProjection ? 'leaflet' : 'bounds',
      }))
      .filter((item): item is Omit<AmenityMarkerItem, 'offsetX' | 'offsetY'> => (
        item.position !== null
      ))
      .slice(0, 7);
    return addAmenityMarkerOffsets(projectedItems, usesLeafletProjection ? mapFrame : null);
  }, [activeAmenityKey, amenityPoints, layers?.display_bounds_wgs84, mapFrame, usesLeafletProjection]);
  const selectedAmenity = visibleAmenityPoints.find(({ point }) => point.point_id === selectedAmenityPointId) ?? null;

  const resetBasemapView = useCallback((map: L.Map, bounds: L.LatLngBoundsExpression, animate = false) => {
    map.fitBounds(bounds, {
      animate,
      padding: [20, 20],
      maxZoom: 17,
    });
  }, []);

  const syncBasemapFrame = useCallback(() => {
    const map = basemapMapRef.current;
    if (!map) return;
    const size = map.getSize();
    const width = size.x || canvasRef.current?.clientWidth || basemapRef.current?.clientWidth || 640;
    const height = size.y || canvasRef.current?.clientHeight || basemapRef.current?.clientHeight || 360;
    setMapFrame((current) => ({
      width,
      height,
      version: (current?.version ?? 0) + 1,
    }));
  }, []);

  const handleZoom = (direction: 1 | -1) => {
    if (hasBasemap && basemapControlsRef.current) {
      basemapControlsRef.current.zoom(direction);
      return;
    }
    if (sceneControlsRef.current) {
      sceneControlsRef.current.zoom(direction);
      return;
    }
    setFallbackZoom((current) => Math.min(Math.max(current * (direction > 0 ? 1.2 : 0.84), 0.75), 1.8));
  };

  const handleReset = () => {
    if (hasBasemap && basemapControlsRef.current) {
      basemapControlsRef.current.reset();
      return;
    }
    if (sceneControlsRef.current) {
      sceneControlsRef.current.reset();
      return;
    }
    setFallbackZoom(1);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!hasBasemap || !basemapControlsRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    basemapControlsRef.current.zoom(event.deltaY < 0 ? 1 : -1);
  };

  const handleMapPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!hasBasemap || !basemapControlsRef.current || event.button !== 0) return;
    basemapPanRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMapPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = basemapPanRef.current;
    if (!hasBasemap || !basemapControlsRef.current || !pointer) return;
    if (
      typeof pointer.pointerId === 'number'
      && typeof event.pointerId === 'number'
      && pointer.pointerId !== event.pointerId
    ) {
      return;
    }
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    event.preventDefault();
    basemapControlsRef.current.panBy(-deltaX, -deltaY);
    basemapPanRef.current = {
      ...pointer,
      x: event.clientX,
      y: event.clientY,
      moved: true,
    };
  };

  const handleMapPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = basemapPanRef.current;
    if (!pointer) return;
    if (
      typeof pointer.pointerId === 'number'
      && typeof event.pointerId === 'number'
      && pointer.pointerId !== event.pointerId
    ) {
      return;
    }
    basemapPanRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const movedDistance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (pointer.moved || movedDistance > POINTER_CLICK_THRESHOLD_PX) return;
    const map = basemapMapRef.current;
    if (!map || scopedBuildings.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = L.point(event.clientX - rect.left, event.clientY - rect.top);
    const selectedBuilding = findBuildingAtContainerPoint(point, scopedBuildings, map);
    if (selectedBuilding) {
      onSelectBuilding?.(selectedBuilding);
    }
  };

  useEffect(() => {
    const element = basemapRef.current;
    const bounds = leafletBounds(layers?.display_bounds_wgs84);
    if (!element || !bounds || !basemapConfig || basemapFailed) {
      basemapControlsRef.current = null;
      return undefined;
    }

    const map = L.map(element, {
      attributionControl: false,
      boxZoom: true,
      doubleClickZoom: true,
      dragging: true,
      keyboard: true,
      scrollWheelZoom: true,
      touchZoom: true,
      wheelPxPerZoomLevel: 140,
      zoomAnimation: true,
      zoomControl: false,
      zoomDelta: BASEMAP_ZOOM_STEP,
      zoomSnap: BASEMAP_ZOOM_STEP,
    });
    basemapMapRef.current = map;
    resetBasemapView(map, bounds);
    syncBasemapFrame();
    const tileLayer = L.tileLayer(basemapConfig.tile_url_template, {
      attribution: basemapConfig.attribution,
      minZoom: basemapConfig.min_zoom,
      maxZoom: basemapConfig.max_zoom,
      pane: 'tilePane',
    });
    tileLayer.on('tileerror', () => {
      onBasemapFailed?.('pdok_brt_tile_failed');
    });
    tileLayer.addTo(map);
    basemapControlsRef.current = {
      zoom: (direction) => {
        const animate = !isReducedMotionEnabled();
        if (direction > 0) {
          map.zoomIn(BASEMAP_ZOOM_STEP, { animate });
        } else {
          map.zoomOut(BASEMAP_ZOOM_STEP, { animate });
        }
        syncBasemapFrame();
      },
      panBy: (deltaX, deltaY) => {
        map.panBy([deltaX, deltaY], { animate: false });
      },
      reset: () => {
        resetBasemapView(map, bounds, !isReducedMotionEnabled());
        syncBasemapFrame();
      },
    };
    map.on('zoomend moveend resize', syncBasemapFrame);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        map.invalidateSize({ animate: false, pan: false });
        resetBasemapView(map, bounds);
        syncBasemapFrame();
      })
      : null;
    resizeObserver?.observe(element);
    const invalidateTimer = window.setTimeout(() => {
      map.invalidateSize({ animate: false, pan: false });
      resetBasemapView(map, bounds);
      syncBasemapFrame();
    }, 50);

    return () => {
      window.clearTimeout(invalidateTimer);
      resizeObserver?.disconnect();
      basemapControlsRef.current = null;
      map.off('zoomend moveend resize', syncBasemapFrame);
      tileLayer.remove();
      map.remove();
      if (basemapMapRef.current === map) {
        basemapMapRef.current = null;
      }
      setMapFrame(null);
    };
  }, [basemapConfig, basemapFailed, layers?.display_bounds_wgs84, onBasemapFailed, resetBasemapView, syncBasemapFrame]);

  useEffect(() => {
    if (!hasBasemap || !selectedBuildingId) return;
    const map = basemapMapRef.current;
    const building = scopedBuildings.find((item) => item.building_id === selectedBuildingId);
    if (!map || !building) return;
    const bounds = buildingLeafletBounds(building);
    if (!bounds) return;
    map.fitBounds(bounds, {
      animate: !isReducedMotionEnabled(),
      padding: [80, 80],
      maxZoom: 19,
    });
    syncBasemapFrame();
  }, [hasBasemap, scopedBuildings, selectedBuildingId, syncBasemapFrame]);

  useEffect(() => {
    if (!layers || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    let cancelled = false;
    let disposeThreeScene: (() => void) | null = null;

    const draw2d = (reason: FallbackReason) => {
      disposeThreeScene?.();
      disposeThreeScene = null;
      sceneControlsRef.current = null;
      setRenderMode('2d');
      setFallbackReason(reason);
      try {
        setCanvasState(drawFallbackScene(canvas, buildings, fallbackZoom, hasBasemap));
      } catch {
        setCanvasState('fallback');
      }
    };

    if (!failed && !buildings && scopedBuildings.length === 0) {
      setRenderMode('2d');
      setFallbackReason('none');
      setCanvasState('pending');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    if (failed) {
      draw2d('building_layer_failed');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    if (scopedBuildings.length === 0) {
      draw2d(buildings?.fallback_reason_code ? 'missing3d' : 'none');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    if (hasBasemap && (!basemapMapRef.current || !mapFrame)) {
      setRenderMode('2d');
      setFallbackReason('none');
      setCanvasState('pending');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    if (isReducedMotionEnabled()) {
      draw2d('reduced_motion');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    if (!hasWebGLSupport()) {
      draw2d('webgl_unavailable');
      return () => {
        cancelled = true;
        disposeThreeScene?.();
      };
    }

    setCanvasState('pending');
    setFallbackReason('none');

    const initializeThreeScene = async () => {
      const metrics = sceneMetrics(layers.display_bounds_wgs84);
      if (!metrics) throw new Error('selected neighborhood bounds unavailable');
      const projectedMap = hasBasemap ? basemapMapRef.current : null;
      const projectedFrame = hasBasemap ? mapFrame : null;
      const useLeafletProjection = Boolean(projectedMap && projectedFrame);
      const [THREE, { OrbitControls }] = await Promise.all([
        import('three') as Promise<ThreeModule>,
        import('three/examples/jsm/controls/OrbitControls.js') as Promise<OrbitControlsModule>,
      ]);
      if (cancelled) return null;

      const width = canvas.clientWidth || 640;
      const height = canvas.clientHeight || 360;
      const frame = useLeafletProjection
        ? {
          targetX: 0,
          targetY: DEFAULT_BUILDING_HEIGHT_M,
          targetZ: 0,
          spanX: width,
          spanY: DEFAULT_BUILDING_HEIGHT_M,
          spanZ: height,
          span: Math.max(width, height, MIN_CAMERA_FRAME_M),
        }
        : sceneFrame(metrics, scopedBuildings);
      const cameraDistance = Math.max(frame.span * 1.18, MIN_CAMERA_FRAME_M);
      const farPlane = Math.max(metrics.spanX, metrics.spanZ, frame.span * 8, 2000);
      const scene = new THREE.Scene();
      scene.background = null;

      const camera = useLeafletProjection
        ? new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, farPlane)
        : new THREE.PerspectiveCamera(42, width / Math.max(height, 1), 0.1, farPlane);
      if (useLeafletProjection) {
        camera.position.set(0, farPlane / 2, 0);
        camera.up.set(0, 0, -1);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(
          frame.targetX + cameraDistance * 0.82,
          frame.targetY + cameraDistance * 0.62,
          frame.targetZ + cameraDistance * 0.82,
        );
        camera.lookAt(frame.targetX, frame.targetY, frame.targetZ);
      }

      const renderer = createWebGlRenderer(THREE, canvas);
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO));
      renderer.setSize(width, height, false);

      scene.add(new THREE.AmbientLight(0xf7fffb, 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
      keyLight.position.set(
        frame.targetX - frame.span * 0.7,
        frame.targetY + frame.span * 1.2,
        frame.targetZ + frame.span * 0.7,
      );
      scene.add(keyLight);

      const groundSpan = Math.max(frame.span * 2.4, MIN_CAMERA_FRAME_M * 1.5);
      const groundGeometry = new THREE.PlaneGeometry(groundSpan, groundSpan);
      const groundMaterial = new THREE.MeshBasicMaterial({
        color: 0xe9f4f1,
        opacity: hasBasemap ? 0.18 : 1,
        side: THREE.DoubleSide,
        transparent: hasBasemap,
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(frame.targetX, 0, frame.targetZ);
      scene.add(ground);

      const meshes: Mesh[] = [];
      const buildingsById = new Map(scopedBuildings.map((building) => [building.building_id, building]));
      const pixelsPerMeter = useLeafletProjection && projectedMap
        ? mapPixelsPerMeter(metrics, projectedMap)
        : 1;
      scopedBuildings.forEach((building) => {
        const geometry = useLeafletProjection && projectedMap && projectedFrame
          ? createMapProjectedLod22Geometry(
            THREE,
            building,
            metrics,
            projectedMap,
            projectedFrame,
            pixelsPerMeter,
          ) ?? createExtrudedFootprintGeometry(
            THREE,
            mapProjectedFootprintLocalPoints(building, metrics, projectedMap, projectedFrame),
            buildingHeight(building) * pixelsPerMeter,
          )
          : createLod22Geometry(THREE, building)
            ?? createExtrudedFootprintGeometry(
              THREE,
              footprintLocalPoints(building, metrics),
              buildingHeight(building),
            );
        if (!geometry) return;
        const selected = building.building_id === selectedBuildingId;
        const material = new THREE.MeshStandardMaterial({
          color: selected ? BUILDING_COPPER_SELECTED : BUILDING_COPPER,
          emissive: selected ? BUILDING_COPPER_EMISSIVE : 0x0,
          emissiveIntensity: selected ? 0.18 : 0,
          metalness: 0.08,
          roughness: 0.72,
          opacity: selected ? 1 : 0.94,
          transparent: true,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { buildingId: building.building_id };
        scene.add(mesh);
        meshes.push(mesh);
      });

      if (meshes.length === 0) throw new Error('no renderable building meshes');

      const render = () => {
        const nextWidth = canvas.clientWidth || width;
        const nextHeight = canvas.clientHeight || height;
        if (useLeafletProjection && 'left' in camera) {
          camera.left = -nextWidth / 2;
          camera.right = nextWidth / 2;
          camera.top = nextHeight / 2;
          camera.bottom = -nextHeight / 2;
        } else if ('aspect' in camera) {
          camera.aspect = nextWidth / Math.max(nextHeight, 1);
        }
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight, false);
        renderer.render(scene, camera);
      };

      const controls = useLeafletProjection ? null : new OrbitControls(camera, canvas);
      if (controls) {
        controls.target.set(frame.targetX, frame.targetY, frame.targetZ);
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.enableRotate = true;
        controls.enableDamping = false;
        controls.minDistance = Math.max(frame.span * 0.28, 12);
        controls.maxDistance = Math.max(frame.span * 8, metrics.spanX, metrics.spanZ, 260);
        controls.maxPolarAngle = Math.PI * 0.48;
        controls.addEventListener('change', render);
        controls.update();
        const initialCameraZoom = camera.zoom || 1;
        sceneControlsRef.current = {
          zoom: (direction) => {
            const nextZoom = Math.min(Math.max((camera.zoom || 1) * (direction > 0 ? 1.25 : 0.8), 0.6), 4);
            camera.zoom = nextZoom;
            camera.updateProjectionMatrix();
            render();
          },
          reset: () => {
            camera.zoom = initialCameraZoom;
            camera.position.set(
              frame.targetX + cameraDistance * 0.82,
              frame.targetY + cameraDistance * 0.62,
              frame.targetZ + cameraDistance * 0.82,
            );
            camera.lookAt(frame.targetX, frame.targetY, frame.targetZ);
            controls.target.set(frame.targetX, frame.targetY, frame.targetZ);
            controls.update();
            render();
          },
        };
      } else {
        sceneControlsRef.current = null;
      }

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerStart: { x: number; y: number; pointerId?: number } | null = null;
      const selectBuildingAt = (event: PointerEvent) => {
        if (!onSelectBuilding) return;
        const rect = canvas.getBoundingClientRect();
        const rectWidth = rect.width || width;
        const rectHeight = rect.height || height;
        pointer.set(
          ((event.clientX - rect.left) / rectWidth) * 2 - 1,
          -(((event.clientY - rect.top) / rectHeight) * 2 - 1),
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(meshes, false)[0];
        const buildingId = typeof hit?.object.userData.buildingId === 'string'
          ? hit.object.userData.buildingId
          : null;
        const selectedBuilding = buildingId ? buildingsById.get(buildingId) : null;
        if (selectedBuilding) {
          onSelectBuilding(selectedBuilding);
        }
      };
      const handlePointerDown = (event: PointerEvent) => {
        pointerStart = {
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
        };
      };
      const handlePointerUp = (event: PointerEvent) => {
        if (!pointerStart) return;
        if (
          typeof pointerStart.pointerId === 'number'
          && typeof event.pointerId === 'number'
          && pointerStart.pointerId !== event.pointerId
        ) {
          return;
        }
        const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart = null;
        if (moved > POINTER_CLICK_THRESHOLD_PX) return;
        selectBuildingAt(event);
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.dataset.selectable = onSelectBuilding ? 'true' : 'false';
      canvas.dataset.controls = useLeafletProjection ? 'basemap' : 'orbit';
      const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(render)
        : null;
      resizeObserver?.observe(canvas);
      window.addEventListener('resize', render);
      render();

      return () => {
        resizeObserver?.disconnect();
        window.removeEventListener('resize', render);
        controls?.removeEventListener('change', render);
        controls?.dispose();
        if (sceneControlsRef.current) {
          sceneControlsRef.current = null;
        }
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointerup', handlePointerUp);
        delete canvas.dataset.selectable;
        delete canvas.dataset.controls;
        meshes.forEach((mesh) => {
          mesh.geometry.dispose();
          disposeMaterial(mesh.material);
        });
        groundGeometry.dispose();
        groundMaterial.dispose();
        renderer.dispose();
      };
    };

    void initializeThreeScene()
      .then((dispose) => {
        if (!dispose) return;
        if (cancelled) {
          dispose();
          return;
        }
        disposeThreeScene = dispose;
        setRenderMode('3d');
        setFallbackReason('none');
        setCanvasState('three');
      })
      .catch(() => {
        if (!cancelled) {
          draw2d('webgl_unavailable');
        }
      });

    return () => {
      cancelled = true;
      disposeThreeScene?.();
    };
  }, [buildings, failed, fallbackZoom, hasBasemap, layers, loading, mapFrame, onSelectBuilding, scopedBuildings, selectedBuildingId]);

  const fallbackMessageKey = (() => {
    if (!layers && !loading) return 'matchFirst.neighborhood.layersLoading';
    if (loading) return null;
    if (failed || fallbackReason === 'building_layer_failed') {
      return 'matchFirst.neighborhood.buildingsUnavailable';
    }
    if (fallbackReason === 'reduced_motion') {
      return 'matchFirst.neighborhood.reducedMotion2d';
    }
    if (fallbackReason === 'webgl_unavailable') {
      return 'matchFirst.neighborhood.threeUnavailable';
    }
    if (fallbackReason === 'missing3d' && scopedBuildings.length === 0) {
      return buildings?.fallback_reason_code ?? 'matchFirst.neighborhood.missing3d';
    }
    return null;
  })();

  return (
    <div
      className="neighborhood-building-layer"
      data-testid="neighborhood-building-layer"
      data-building-layer-available={layers?.building_layer.available === true ? 'true' : 'false'}
      data-canvas-state={canvasState}
      data-render-mode={renderMode}
      data-fallback-reason={fallbackReason}
      data-rendered-buildings={canvasState === 'three' ? String(scopedBuildings.length) : '0'}
      data-lod22-buildings={String(scopedBuildings.filter(hasLod22Surfaces).length)}
      data-geometry-source={scopedBuildings.length ? geometrySourceLabel(scopedBuildings) : 'none'}
      data-basemap-source={basemapConfig?.source_id ?? 'none'}
      data-basemap-loaded={hasBasemap ? 'true' : 'false'}
      data-overlay-projection={usesLeafletProjection ? 'leaflet' : 'bounds'}
      data-zoom-owner={hasBasemap ? 'basemap' : 'scene'}
      onWheel={handleWheel}
    >
      {basemapConfig && !basemapFailed ? (
        <div
          ref={basemapRef}
          className="neighborhood-building-layer__basemap"
          data-testid="neighborhood-street-basemap"
          role="img"
          aria-label={t('matchFirst.neighborhood.streetBasemapLabel')}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="neighborhood-building-layer__canvas"
        aria-label={t('matchFirst.neighborhood.canvasLabel')}
        data-testid="neighborhood-building-canvas"
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerEnd}
        onPointerCancel={handleMapPointerEnd}
      />
      <div className="neighborhood-building-layer__legend">
        <strong>{t('matchFirst.neighborhood.mapExplanationTitle')}</strong>
        <span>{t('matchFirst.neighborhood.mapExplanationBody')}</span>
        <span className="neighborhood-building-layer__hint">{t('matchFirst.neighborhood.mapClickHint')}</span>
      </div>
      {visibleAmenityPoints.length > 0 && (
        <div
          className="neighborhood-building-layer__amenities"
          aria-label={t('matchFirst.neighborhood.amenityMarkersLabel')}
        >
          {visibleAmenityPoints.map(({ point, position, projection, offsetX, offsetY }) => (
            <button
              key={point.point_id}
              type="button"
              className="neighborhood-building-layer__amenity-marker"
              aria-label={t('matchFirst.neighborhood.amenityMarkerLabel', { amenity: t(point.label_key) })}
              data-testid={`neighborhood-amenity-marker-${point.amenity_key}`}
              data-amenity-key={point.amenity_key}
              data-display-coordinate-system={point.display_coordinate_system}
              data-source-coordinate-system={point.source_coordinate_system ?? ''}
              data-source-geometry-coordinate-system={point.source_geometry_coordinate_system ?? ''}
              data-active={activeAmenityKey === point.amenity_key ? 'true' : 'false'}
              data-projection={projection}
              aria-expanded={selectedAmenityPointId === point.point_id ? 'true' : 'false'}
              onClick={() => {
                setSelectedAmenityPointId((current) => (current === point.point_id ? null : point.point_id));
              }}
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
                '--marker-offset-x': `${offsetX}px`,
                '--marker-offset-y': `${offsetY}px`,
              } as CSSProperties}
            >
              <span className="neighborhood-building-layer__amenity-dot" aria-hidden="true">{point.emoji}</span>
              <span className="neighborhood-building-layer__amenity-label">{t(point.label_key)}</span>
              <span className="neighborhood-building-layer__amenity-score">
                {t('matchFirst.neighborhood.amenityRelevance', { relevance: point.relevance })}
              </span>
            </button>
          ))}
        </div>
      )}
      {selectedAmenity ? (
        <div
          className="neighborhood-building-layer__amenity-popup"
          role="dialog"
          aria-label={t('matchFirst.neighborhood.amenityMarkerDetailsLabel', {
            amenity: t(selectedAmenity.point.label_key),
          })}
        >
          <button
            type="button"
            className="neighborhood-building-layer__amenity-popup-close"
            aria-label={t('matchFirst.neighborhood.closeAmenityDetails')}
            onClick={() => setSelectedAmenityPointId(null)}
          >
            x
          </button>
          <strong>{selectedAmenity.point.name ?? t(selectedAmenity.point.label_key)}</strong>
          <span>
            {t('matchFirst.neighborhood.amenitySource', {
              source: selectedAmenity.point.source_name,
            })}
          </span>
          <span>
            {t('matchFirst.neighborhood.amenityFreshness', {
              date: selectedAmenity.point.freshness_date ?? selectedAmenity.point.loaded_at,
            })}
          </span>
          <span>
            {t('matchFirst.neighborhood.amenityCoordinates', {
              crs: selectedAmenity.point.display_coordinate_system,
            })}
          </span>
        </div>
      ) : null}
      {basemapConfig && !basemapFailed ? (
        <p className="neighborhood-building-layer__attribution">
          {basemapConfig.attribution}
        </p>
      ) : null}
      {basemapFailed ? (
        <p className="neighborhood-building-layer__basemap-fallback" role="status">
          {t('matchFirst.neighborhood.basemapUnavailable')}
        </p>
      ) : null}
      <div className="neighborhood-building-layer__controls" role="group" aria-label={t('matchFirst.neighborhood.mapControlsLabel')}>
        <button type="button" aria-label={t('matchFirst.neighborhood.zoomIn')} onClick={() => handleZoom(1)}>+</button>
        <button type="button" aria-label={t('matchFirst.neighborhood.zoomOut')} onClick={() => handleZoom(-1)}>-</button>
        <button type="button" aria-label={t('matchFirst.neighborhood.resetView')} onClick={handleReset}>
          <svg
            aria-hidden="true"
            data-testid="neighborhood-reset-view-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path
              d="M7 7h6a5 5 0 1 1-4.2 2.3"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M7 3v4h4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
      </div>
      {loading && <p role="status">{t('matchFirst.neighborhood.buildingsLoading')}</p>}
      {!loading && fallbackMessageKey && (
        <p className="neighborhood-building-layer__fallback" role="status">
          {t(fallbackMessageKey)}
        </p>
      )}
    </div>
  );
}
