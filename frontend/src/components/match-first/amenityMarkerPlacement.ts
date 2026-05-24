type AmenityMarkerProjection = 'leaflet' | 'bounds';

export interface AmenityMarkerPlacementPosition {
  left: number;
  top: number;
}

export interface AmenityMarkerPlacementFrame {
  width: number;
  height: number;
  version?: number;
}

export interface AmenityMarkerPlacementInput<TPoint> {
  point: TPoint;
  position: AmenityMarkerPlacementPosition;
  projection: AmenityMarkerProjection;
}

export interface AmenityMarkerPlacementItem<TPoint> extends AmenityMarkerPlacementInput<TPoint> {
  offsetX: number;
  offsetY: number;
}

interface MarkerAvoidanceZone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const AMENITY_MARKER_EDGE_PADDING_PX = 24;
const AMENITY_MARKER_TOUCH_TARGET_PX = 44;
const AMENITY_MARKER_OVERLAY_CLEARANCE_PX = 8;

export function addAmenityMarkerOffsets<TPoint>(
  items: Array<AmenityMarkerPlacementInput<TPoint>>,
  frame: AmenityMarkerPlacementFrame | null,
): Array<AmenityMarkerPlacementItem<TPoint>> {
  const width = Math.max(frame?.width ?? 640, 1);
  const height = Math.max(frame?.height ?? 420, 1);
  const avoidanceZones = amenityMarkerAvoidanceZones(width, height);
  const candidateOffsets = [
    [0, 0],
    [0, 28],
    [0, -28],
    [32, 0],
    [-32, 0],
    [28, 26],
    [-28, 26],
    [28, -26],
    [-28, -26],
    [0, 54],
    [0, -56],
    [-64, 0],
    [0, -72],
    [-64, -56],
    [-96, 0],
    [0, -96],
    [-112, -72],
    [-136, -88],
    [64, -56],
    [-64, 56],
  ] as const;
  const placed: Array<{ x: number; y: number }> = [];

  return items.map((item) => {
    const anchorX = (item.position.left / 100) * width;
    const anchorY = (item.position.top / 100) * height;
    const [offsetX, offsetY] = candidateOffsets.find(([candidateX, candidateY]) => {
      const x = anchorX + candidateX;
      const y = anchorY + candidateY;
      const insideReadableArea = x > AMENITY_MARKER_EDGE_PADDING_PX
        && x < width - AMENITY_MARKER_EDGE_PADDING_PX
        && y > AMENITY_MARKER_EDGE_PADDING_PX
        && y < height - AMENITY_MARKER_EDGE_PADDING_PX;
      const clearOfControls = avoidanceZones.every((zone) => !pointInAvoidanceZone(x, y, zone));
      const separated = placed.every((marker) => Math.abs(marker.x - x) > 28 || Math.abs(marker.y - y) > 28);
      return insideReadableArea && clearOfControls && separated;
    }) ?? [0, 0];
    placed.push({ x: anchorX + offsetX, y: anchorY + offsetY });
    return {
      ...item,
      offsetX,
      offsetY,
    };
  });
}

function clampedAvoidanceZone(zone: MarkerAvoidanceZone, width: number, height: number): MarkerAvoidanceZone {
  return {
    left: Math.max(0, Math.min(zone.left, width)),
    top: Math.max(0, Math.min(zone.top, height)),
    right: Math.max(0, Math.min(zone.right, width)),
    bottom: Math.max(0, Math.min(zone.bottom, height)),
  };
}

function amenityMarkerAvoidanceZones(width: number, height: number): MarkerAvoidanceZone[] {
  const markerHalo = (AMENITY_MARKER_TOUCH_TARGET_PX / 2) + AMENITY_MARKER_OVERLAY_CLEARANCE_PX;
  const isCompactMap = width <= 760;
  if (isCompactMap) {
    const controlGroupWidth = (AMENITY_MARKER_TOUCH_TARGET_PX * 3) + (6 * 2);
    return [clampedAvoidanceZone({
      left: width - 12 - controlGroupWidth - markerHalo,
      top: height - 46 - AMENITY_MARKER_TOUCH_TARGET_PX - markerHalo,
      right: width,
      bottom: height,
    }, width, height)];
  }
  const controlGroupHeight = (AMENITY_MARKER_TOUCH_TARGET_PX * 3) + (6 * 2);
  return [clampedAvoidanceZone({
    left: width - 14 - AMENITY_MARKER_TOUCH_TARGET_PX - markerHalo,
    top: 14 - markerHalo,
    right: width,
    bottom: 14 + controlGroupHeight + markerHalo,
  }, width, height)];
}

function pointInAvoidanceZone(x: number, y: number, zone: MarkerAvoidanceZone): boolean {
  return x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
}
