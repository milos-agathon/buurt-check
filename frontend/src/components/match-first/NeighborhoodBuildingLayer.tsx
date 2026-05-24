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
import type {
  MatchNeighborhoodAmenityPoint,
  MatchNeighborhoodBuildingFeature,
  MatchNeighborhoodBuildingsResponse,
  MatchNeighborhoodMapLayersResponse,
  MatchResultsBasemapConfig,
} from '../../types/matchFirst';
import { addAmenityMarkerOffsets } from './amenityMarkerPlacement';
import { amenityMarkerEmoji, amenityMarkerShape } from './amenityMarkerShapes';

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

type CanvasState = 'pending' | 'drawn' | 'fallback';
type RenderMode = '2d';
type BuildingUsageClassification =
  | 'residential'
  | 'mixed_residential'
  | 'non_residential'
  | 'no_verblijfsobject'
  | 'unknown';
type FallbackReason =
  | 'none'
  | 'missing3d'
  | 'reduced_motion'
  | 'building_layer_failed';

interface LocalPoint {
  x: number;
  z: number;
}

interface SceneMetrics {
  centerLng: number;
  centerLat: number;
  metersPerLng: number;
  metersPerLat: number;
  spanX: number;
  spanZ: number;
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

interface BoundaryOverlay {
  d: string;
  projection: 'leaflet' | 'bounds';
  ringCount: number;
  coordinateSystem: string;
}

type BoundaryPolygon = number[][][];
type LeafletBoundsTuple = [[number, number], [number, number]];

const POINTER_CLICK_THRESHOLD_PX = 7;
const BASEMAP_ZOOM_STEP = 0.5;
const MIN_PROJECTED_BUILDING_SIZE_PX = 10;
const RD_REFERENCE_X = 155000;
const RD_REFERENCE_Y = 463000;
const WGS_REFERENCE_LAT = 52.15517440;
const WGS_REFERENCE_LNG = 5.38720621;
const BUILDING_USAGE_ORDER: BuildingUsageClassification[] = [
  'residential',
  'mixed_residential',
  'non_residential',
  'no_verblijfsobject',
  'unknown',
];
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
  layers: MatchNeighborhoodMapLayersResponse | null = null,
): MatchNeighborhoodBuildingFeature[] {
  const candidates = (buildings?.buildings ?? []).filter((building) => outerRing(building) !== null);
  if (candidates.length === 0) return [];
  if (!layers) return [];
  const boundarySystem = boundaryCoordinateSystem(layers).toUpperCase();
  const boundaryCanClassifyWgs84 = boundarySystem === 'WGS84'
    || boundarySystem === 'EPSG:4326'
    || boundarySystem === 'CRS84';
  if (!boundaryCanClassifyWgs84 || boundaryPolygonsFromGeometry(layers.boundary.geometry).length === 0) {
    return buildings?.clipped_to_neighborhood ? candidates : [];
  }
  return candidates.filter((building) => buildingInsideBoundary(building, layers));
}

function buildingUsageClassification(
  building: MatchNeighborhoodBuildingFeature,
): BuildingUsageClassification {
  return building.building_usage_classification ?? 'unknown';
}

function isHouseSelectable(building: MatchNeighborhoodBuildingFeature): boolean {
  return building.house_selectable !== false;
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
  if (buildings.some((building) => building.geometry_source === 'pdok_bag_pand')) return 'pdok_bag_pand';
  return 'wgs84_extrusion';
}

function buildingUsageSummary(buildings: MatchNeighborhoodBuildingFeature[]): string {
  const counts = new Map<BuildingUsageClassification, number>();
  for (const building of buildings) {
    const classification = buildingUsageClassification(building);
    counts.set(classification, (counts.get(classification) ?? 0) + 1);
  }
  return BUILDING_USAGE_ORDER
    .map((classification) => {
      const count = counts.get(classification) ?? 0;
      return count > 0 ? `${classification}:${count}` : null;
    })
    .filter((item): item is string => item !== null)
    .join(',');
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

function boundaryPointPosition(
  point: number[],
  boundsWgs84: number[] | undefined,
  map: L.Map | null = null,
  frame: MapOverlayFrame | null = null,
): MarkerPosition | null {
  const [lng, lat] = point;
  if (![lng, lat].every(isFiniteNumber)) return null;

  if (map && frame) {
    const projected = map.latLngToContainerPoint([lat, lng]);
    const left = (projected.x / Math.max(frame.width, 1)) * 100;
    const top = (projected.y / Math.max(frame.height, 1)) * 100;
    if (!isFiniteNumber(left) || !isFiniteNumber(top)) return null;
    return { left, top };
  }

  if (!boundsWgs84 || boundsWgs84.length !== 4) return null;
  const [west, south, east, north] = boundsWgs84;
  if (![west, south, east, north].every(isFiniteNumber) || west >= east || south >= north) {
    return null;
  }
  const left = ((lng - west) / (east - west)) * 100;
  const top = (1 - ((lat - south) / (north - south))) * 100;
  if (!isFiniteNumber(left) || !isFiniteNumber(top)) return null;
  return { left, top };
}

function validBoundaryRing(ring: unknown): number[][] {
  if (!Array.isArray(ring)) return [];
  const points = ring.filter((point): point is number[] => (
    Array.isArray(point)
    && point.length >= 2
    && isFiniteNumber(point[0])
    && isFiniteNumber(point[1])
  ));
  return points.length >= 3 ? points : [];
}

function boundaryRingsFromGeometry(
  geometry: MatchNeighborhoodMapLayersResponse['boundary']['geometry'] | undefined,
): unknown[] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => polygon);
  }
  return [];
}

function boundaryPolygonsFromGeometry(
  geometry: MatchNeighborhoodMapLayersResponse['boundary']['geometry'] | undefined,
): BoundaryPolygon[] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map(validBoundaryRing).filter((ring) => ring.length >= 3);
    return rings.length > 0 ? [rings] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .map((polygon) => polygon.map(validBoundaryRing).filter((ring) => ring.length >= 3))
      .filter((polygon) => polygon.length > 0);
  }
  return [];
}

function boundaryCoordinateSystem(layers: MatchNeighborhoodMapLayersResponse | null): string {
  const coordinateSystem = layers?.boundary.properties.display_coordinate_system;
  return typeof coordinateSystem === 'string' && coordinateSystem ? coordinateSystem : 'WGS84';
}

function pointOnBoundarySegment(
  lng: number,
  lat: number,
  start: number[],
  end: number[],
): boolean {
  const [startLng, startLat] = start;
  const [endLng, endLat] = end;
  if (![startLng, startLat, endLng, endLat].every(isFiniteNumber)) return false;
  const cross = ((lng - startLng) * (endLat - startLat)) - ((lat - startLat) * (endLng - startLng));
  if (Math.abs(cross) > 1e-12) return false;
  const lengthSquared = ((endLng - startLng) ** 2) + ((endLat - startLat) ** 2);
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(lng - startLng, lat - startLat) <= 1e-12;
  }
  const dot = ((lng - startLng) * (endLng - startLng)) + ((lat - startLat) * (endLat - startLat));
  if (dot < 0) return false;
  return dot <= lengthSquared;
}

function pointInBoundaryRing(lng: number, lat: number, ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (pointOnBoundarySegment(lng, lat, previous, current)) return true;
    const [currentLng, currentLat] = current;
    const [previousLng, previousLat] = previous;
    const crosses = (currentLat > lat) !== (previousLat > lat);
    if (!crosses) continue;
    const intersectionLng = ((previousLng - currentLng) * (lat - currentLat))
      / (previousLat - currentLat)
      + currentLng;
    if (lng < intersectionLng) inside = !inside;
  }
  return inside;
}

function pointInsideBoundaryGeometry(
  lng: number,
  lat: number,
  layers: MatchNeighborhoodMapLayersResponse | null,
): boolean {
  if (![lng, lat].every(isFiniteNumber)) return false;
  const polygons = boundaryPolygonsFromGeometry(layers?.boundary.geometry);
  if (polygons.length === 0) return false;
  return polygons.some((polygon) => {
    const [outer, ...holes] = polygon;
    return Boolean(outer)
      && pointInBoundaryRing(lng, lat, outer)
      && !holes.some((hole) => pointInBoundaryRing(lng, lat, hole));
  });
}

function buildingInsideBoundary(
  building: MatchNeighborhoodBuildingFeature,
  layers: MatchNeighborhoodMapLayersResponse | null,
): boolean {
  const ring = outerRing(building);
  if (!ring) return false;
  return ring.every(([lng, lat]) => pointInsideBoundaryGeometry(lng, lat, layers));
}

function boundaryOverlay(
  layers: MatchNeighborhoodMapLayersResponse | null,
  map: L.Map | null,
  frame: MapOverlayFrame | null,
): BoundaryOverlay | null {
  const rings = boundaryRingsFromGeometry(layers?.boundary.geometry);
  if (!Array.isArray(rings) || rings.length === 0) return null;

  const projection = map && frame ? 'leaflet' : 'bounds';
  const pathRings = rings
    .map(validBoundaryRing)
    .map((ring) => ring
      .map((point) => boundaryPointPosition(
        point,
        layers?.display_bounds_wgs84,
        map,
        frame,
      ))
      .filter((point): point is MarkerPosition => point !== null))
    .filter((ring) => ring.length >= 3);

  if (pathRings.length === 0) return null;

  const d = pathRings
    .map((ring) => {
      const [first, ...rest] = ring;
      return [
        `M ${first.left.toFixed(3)} ${first.top.toFixed(3)}`,
        ...rest.map((point) => `L ${point.left.toFixed(3)} ${point.top.toFixed(3)}`),
        'Z',
      ].join(' ');
    })
    .join(' ');

  return {
    d,
    projection,
    ringCount: pathRings.length,
    coordinateSystem: boundaryCoordinateSystem(layers),
  };
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
  for (const building of buildings.filter(isHouseSelectable)) {
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

function mapProjectedFootprintLocalPoints(
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
  map: L.Map,
  frame: MapOverlayFrame,
): LocalPoint[] {
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
  const projectedRd = openPoints
    .map((point) => rdOffsetToLocalScreen(point, metrics, map, frame, centerRd))
    .filter((point): point is LocalPoint => point !== null);
  if (projectedRd.length >= 3) return projectedRd;

  const wgsRing = outerRing(building);
  if (wgsRing) {
    const projected = wgsRing
      .map((point) => wgsPointToLocalScreen(point, map, frame))
      .filter((point): point is LocalPoint => point !== null);
    if (projected.length >= 3) return projected;
  }

  return [];
}

function toLocalPoint(point: number[], metrics: SceneMetrics): LocalPoint {
  const [lng, lat] = point;
  return {
    x: (lng - metrics.centerLng) * metrics.metersPerLng,
    z: -(lat - metrics.centerLat) * metrics.metersPerLat,
  };
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

function expandedFootprintScreenPoints(points: LocalPoint[]): LocalPoint[] {
  if (points.length < 3) return points;
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const positions = points.flatMap((point) => [point.x, 0, point.z]);
  const expanded = expandProjectedPositions(positions);
  if (expanded === positions) return points;
  return points.map((_, index) => ({
    x: expanded[index * 3] ?? xs[index] ?? 0,
    z: expanded[(index * 3) + 2] ?? zs[index] ?? 0,
  }));
}

function projectedFootprintScreenPoints(
  building: MatchNeighborhoodBuildingFeature,
  metrics: SceneMetrics,
  map: L.Map | null,
  frame: MapOverlayFrame | null,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  if (map && frame) {
    return expandedFootprintScreenPoints(mapProjectedFootprintLocalPoints(building, metrics, map, frame))
      .map((point) => ({
        x: (frame.width / 2) + point.x,
        y: (frame.height / 2) + point.z,
      }));
  }

  return (outerRing(building)?.map((point) => {
    const local = toLocalPoint(point, metrics);
    return {
      x: (width / 2) + ((local.x / Math.max(metrics.spanX, 1)) * width * 0.86),
      y: (height / 2) + ((local.z / Math.max(metrics.spanZ, 1)) * height * 0.86),
    };
  }) ?? []);
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
): boolean {
  const first = points[0];
  if (!first || points.length < 3) return false;
  context.beginPath();
  context.moveTo(first.x, first.y);
  points.slice(1).forEach((point) => {
    context.lineTo(point.x, point.y);
  });
  context.closePath();
  return true;
}

function drawBuildingFootprints(
  context: CanvasRenderingContext2D,
  buildings: MatchNeighborhoodBuildingFeature[],
  metrics: SceneMetrics,
  map: L.Map | null,
  frame: MapOverlayFrame | null,
  width: number,
  height: number,
  selectedBuildingId: string | null,
): number {
  let drawn = 0;
  buildings.forEach((building) => {
    const points = projectedFootprintScreenPoints(building, metrics, map, frame, width, height);
    if (!drawPolygon(context, points)) return;
    const selected = building.building_id === selectedBuildingId;
    const selectable = isHouseSelectable(building);
    context.fillStyle = selected
      ? 'rgba(146, 70, 40, 0.74)'
      : selectable ? 'rgba(195, 109, 75, 0.58)' : 'rgba(105, 113, 116, 0.24)';
    context.strokeStyle = selected ? '#6f351f' : selectable ? '#924628' : '#737d80';
    context.lineWidth = selected ? 2.6 : selectable ? 1.8 : 1.2;
    context.fill();
    context.stroke();
    drawn += 1;
  });
  return drawn;
}

function drawFallbackScene(
  canvas: HTMLCanvasElement,
  buildings: MatchNeighborhoodBuildingsResponse | null,
  options: {
    zoom?: number;
    basemapAvailable?: boolean;
    map?: L.Map | null;
    frame?: MapOverlayFrame | null;
    boundsWgs84?: number[];
    selectedBuildingId?: string | null;
    layers?: MatchNeighborhoodMapLayersResponse | null;
  } = {},
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
  if (!options.basemapAvailable) {
    context.fillStyle = '#eef6f3';
    context.fillRect(0, 0, width, height);
  }

  const metrics = sceneMetrics(options.boundsWgs84);
  const scoped = renderableBuildings(buildings, options.layers ?? null);
  if (metrics && scoped.length > 0) {
    const drawn = drawBuildingFootprints(
      context,
      scoped,
      metrics,
      options.map ?? null,
      options.frame ?? null,
      width,
      height,
      options.selectedBuildingId ?? null,
    );
    if (drawn > 0) return 'drawn';
  }

  return 'fallback';
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
  const [basemapMap, setBasemapMap] = useState<L.Map | null>(null);
  const [selectedAmenityPointId, setSelectedAmenityPointId] = useState<string | null>(null);
  const scopedBuildings = useMemo(() => renderableBuildings(buildings, layers), [buildings, layers]);
  const selectableBuildingCount = useMemo(
    () => scopedBuildings.filter(isHouseSelectable).length,
    [scopedBuildings],
  );
  const deferredBuildingCount = Math.max(scopedBuildings.length - selectableBuildingCount, 0);
  const hasBasemap = Boolean(basemapConfig && !basemapFailed);
  const usesLeafletProjection = Boolean(hasBasemap && basemapMap && mapFrame);
  const boundaryUnavailable = layers?.building_layer.available === false
    && layers.building_layer.fallback_reason_code === 'matchFirst.neighborhood.boundaryUnavailable';
  const selectedBoundaryOverlay = useMemo(() => boundaryOverlay(
    layers,
    usesLeafletProjection ? basemapMap : null,
    usesLeafletProjection ? mapFrame : null,
  ), [basemapMap, layers, mapFrame, usesLeafletProjection]);
  const visibleAmenityPoints = useMemo(() => {
    const projectedItems = amenityPoints
      .filter((point) => !activeAmenityKey || point.amenity_key === activeAmenityKey)
      .filter((point) => pointInsideBoundaryGeometry(point.display_lng, point.display_lat, layers))
      .map((point) => ({
        point,
        position: pointMarkerPosition(
          point,
          layers?.display_bounds_wgs84,
          usesLeafletProjection ? basemapMap : null,
          usesLeafletProjection ? mapFrame : null,
        ),
        projection: usesLeafletProjection ? 'leaflet' : 'bounds',
      }))
      .filter((item): item is Omit<AmenityMarkerItem, 'offsetX' | 'offsetY'> => (
        item.position !== null
      ));
    return addAmenityMarkerOffsets(projectedItems, usesLeafletProjection ? mapFrame : null);
  }, [activeAmenityKey, amenityPoints, basemapMap, layers, mapFrame, usesLeafletProjection]);
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
    setFallbackZoom((current) => Math.min(Math.max(current * (direction > 0 ? 1.2 : 0.84), 0.75), 1.8));
  };

  const handleReset = () => {
    if (hasBasemap && basemapControlsRef.current) {
      basemapControlsRef.current.reset();
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
    setBasemapMap(map);
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
      setBasemapMap((current) => (current === map ? null : current));
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
    const syncTimer = window.setTimeout(syncBasemapFrame, 0);
    return () => {
      window.clearTimeout(syncTimer);
    };
  }, [hasBasemap, scopedBuildings, selectedBuildingId, syncBasemapFrame]);

  useEffect(() => {
    if (!layers || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    let statusTimer: number | null = null;

    const cleanupCanvasStatus = () => {
      if (statusTimer !== null) {
        window.clearTimeout(statusTimer);
      }
      delete canvas.dataset.selectable;
      delete canvas.dataset.controls;
    };

    const scheduleCanvasStatus = (state: CanvasState, reason: FallbackReason) => {
      if (statusTimer !== null) {
        window.clearTimeout(statusTimer);
      }
      statusTimer = window.setTimeout(() => {
        setRenderMode('2d');
        setFallbackReason(reason);
        setCanvasState(state);
      }, 0);
    };

    const draw2d = (reason: FallbackReason) => {
      let nextCanvasState: CanvasState = 'fallback';
      try {
        nextCanvasState = drawFallbackScene(canvas, buildings, {
          zoom: fallbackZoom,
          basemapAvailable: hasBasemap,
          map: hasBasemap ? basemapMapRef.current : null,
          frame: hasBasemap ? mapFrame : null,
          boundsWgs84: layers.display_bounds_wgs84,
          selectedBuildingId,
          layers,
        });
        canvas.dataset.selectable = onSelectBuilding && selectableBuildingCount > 0 ? 'true' : 'false';
        canvas.dataset.controls = hasBasemap ? 'basemap' : 'fallback';
      } catch {
        nextCanvasState = 'fallback';
      }
      scheduleCanvasStatus(nextCanvasState, reason);
    };

    if (!failed && !buildings && scopedBuildings.length === 0) {
      scheduleCanvasStatus('pending', 'none');
      return cleanupCanvasStatus;
    }

    if (failed) {
      draw2d('building_layer_failed');
      return cleanupCanvasStatus;
    }

    if (scopedBuildings.length === 0) {
      draw2d(buildings?.fallback_reason_code ? 'missing3d' : 'none');
      return cleanupCanvasStatus;
    }

    if (hasBasemap && (!basemapMapRef.current || !mapFrame)) {
      scheduleCanvasStatus('pending', 'none');
      return cleanupCanvasStatus;
    }

    if (isReducedMotionEnabled()) {
      draw2d('reduced_motion');
      return cleanupCanvasStatus;
    }

    draw2d('none');

    return cleanupCanvasStatus;
  }, [buildings, failed, fallbackZoom, hasBasemap, layers, loading, mapFrame, onSelectBuilding, scopedBuildings, selectableBuildingCount, selectedBuildingId]);

  const fallbackMessageKey = (() => {
    if (!layers && !loading) return 'matchFirst.neighborhood.layersLoading';
    if (loading) return null;
    if (boundaryUnavailable) {
      return 'matchFirst.neighborhood.boundaryUnavailable';
    }
    if (failed || fallbackReason === 'building_layer_failed') {
      return 'matchFirst.neighborhood.buildingsUnavailable';
    }
    if (fallbackReason === 'reduced_motion') {
      return 'matchFirst.neighborhood.reducedMotion2d';
    }
    if (fallbackReason === 'missing3d' && scopedBuildings.length === 0) {
      return buildings?.fallback_reason_code ?? 'matchFirst.neighborhood.missing3d';
    }
    return null;
  })();
  const partialMessageKey = buildings?.complete === false
    ? 'matchFirst.neighborhood.buildingsPartial'
    : null;
  const mapExplanationBodyKey = boundaryUnavailable
    ? 'matchFirst.neighborhood.mapExplanationBoundaryUnavailable'
    : 'matchFirst.neighborhood.mapExplanationBody';

  return (
    <div
      className="neighborhood-building-layer"
      data-testid="neighborhood-building-layer"
      data-building-layer-available={layers?.building_layer.available === true ? 'true' : 'false'}
      data-canvas-state={canvasState}
      data-render-mode={renderMode}
      data-fallback-reason={fallbackReason}
      data-rendered-buildings={canvasState === 'drawn' ? String(scopedBuildings.length) : '0'}
      data-selectable-buildings={String(selectableBuildingCount)}
      data-deferred-buildings={String(deferredBuildingCount)}
      data-building-usage-summary={buildingUsageSummary(scopedBuildings)}
      data-lod22-buildings={String(scopedBuildings.filter(hasLod22Surfaces).length)}
      data-geometry-source={scopedBuildings.length ? geometrySourceLabel(scopedBuildings) : 'none'}
      data-basemap-source={basemapConfig?.source_id ?? 'none'}
      data-basemap-loaded={hasBasemap ? 'true' : 'false'}
      data-overlay-projection={usesLeafletProjection ? 'leaflet' : 'bounds'}
      data-zoom-owner={hasBasemap ? 'basemap' : 'scene'}
      data-building-complete={buildings?.complete === false ? 'false' : 'true'}
      data-building-partial-reason={buildings?.partial_reason_code ?? 'none'}
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
      {selectedBoundaryOverlay ? (
        <svg
          className="neighborhood-building-layer__boundary"
          data-testid="neighborhood-boundary-outline"
          data-boundary-coordinate-system={selectedBoundaryOverlay.coordinateSystem}
          data-boundary-projection={selectedBoundaryOverlay.projection}
          data-boundary-rings={String(selectedBoundaryOverlay.ringCount)}
          role="img"
          aria-label={t('matchFirst.neighborhood.boundaryLabel')}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path className="neighborhood-building-layer__boundary-halo" d={selectedBoundaryOverlay.d} />
          <path className="neighborhood-building-layer__boundary-shape" d={selectedBoundaryOverlay.d} />
        </svg>
      ) : null}
      <div className="neighborhood-building-layer__legend">
        <strong>{t('matchFirst.neighborhood.mapExplanationTitle')}</strong>
        <span>{t(mapExplanationBodyKey)}</span>
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
              data-marker-shape={amenityMarkerShape(point)}
              data-marker-emoji={amenityMarkerEmoji(point)}
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
              <span
                className="neighborhood-building-layer__amenity-dot"
                data-marker-shape={amenityMarkerShape(point)}
                aria-hidden="true"
              />
              <span className="neighborhood-building-layer__amenity-emoji" aria-hidden="true">
                {amenityMarkerEmoji(point)}
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
            <svg
              aria-hidden="true"
              data-testid="neighborhood-amenity-popup-close-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
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
        <button type="button" aria-label={t('matchFirst.neighborhood.zoomIn')} onClick={() => handleZoom(1)}>
          <svg
            aria-hidden="true"
            data-testid="neighborhood-zoom-in-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <button type="button" aria-label={t('matchFirst.neighborhood.zoomOut')} onClick={() => handleZoom(-1)}>
          <svg
            aria-hidden="true"
            data-testid="neighborhood-zoom-out-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path
              d="M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </button>
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
      {partialMessageKey && (
        <p className="neighborhood-building-layer__partial" role="status">
          {t(partialMessageKey)}
        </p>
      )}
      {!loading && fallbackMessageKey && (
        <p className="neighborhood-building-layer__fallback" role="status">
          {t(fallbackMessageKey)}
        </p>
      )}
    </div>
  );
}
