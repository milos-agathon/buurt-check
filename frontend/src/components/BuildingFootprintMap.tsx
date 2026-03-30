import { useMemo, useState } from 'react';
import type { Geometry, Position } from 'geojson';
import { useTranslation } from 'react-i18next';
import { buildPrimaryApiUrl } from '../config/apiBase';
import './BuildingFootprintMap.css';

interface Props {
  lat: number;
  lng: number;
  rdX?: number;
  rdY?: number;
  footprint?: Geometry;
  zoom?: number;
  reportId?: string;
}

const VIEWBOX_SIZE = 100;
const VIEWBOX_PADDING = 8;
const TILE_RADIUS = 80; // meters around center

function polygonArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function getPrimaryRing(geometry?: Geometry): Position[] | undefined {
  if (!geometry) return undefined;

  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0];
  }

  if (geometry.type === 'MultiPolygon') {
    let bestRing: Position[] | undefined;
    let bestArea = 0;

    for (const polygon of geometry.coordinates) {
      const ring = polygon[0];
      if (!ring || ring.length < 3) continue;
      const area = polygonArea(ring);
      if (area > bestArea) {
        bestArea = area;
        bestRing = ring;
      }
    }

    return bestRing;
  }

  return undefined;
}

/**
 * Convert WGS84 footprint ring to SVG path on the aerial tile.
 * Uses a local linear approximation: at the center point we know both WGS84 and RD.
 * mPerDegLng is computed dynamically from latitude: 111320 * cos(lat).
 */
function wgs84RingToSvgPath(
  ring: Position[],
  centerLng: number, centerLat: number,
  centerRdX: number, centerRdY: number,
  tileRadius: number,
): string | undefined {
  if (ring.length < 3) return undefined;
  const mPerDegLng = 111320 * Math.cos(centerLat * Math.PI / 180);
  const mPerDegLat = 111320;
  const bboxMinX = centerRdX - tileRadius;
  const bboxMinY = centerRdY - tileRadius;
  const bboxSize = tileRadius * 2;
  const scale = VIEWBOX_SIZE / bboxSize;

  const points = ring.map(([lng, lat]) => {
    const rdX = centerRdX + (lng - centerLng) * mPerDegLng;
    const rdY = centerRdY + (lat - centerLat) * mPerDegLat;
    return {
      x: (rdX - bboxMinX) * scale,
      y: VIEWBOX_SIZE - (rdY - bboxMinY) * scale,
    };
  });

  const [first, ...rest] = points;
  const cmds = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (const p of rest) cmds.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  cmds.push('Z');
  return cmds.join(' ');
}

function normalizeRing(ring: Position[]): { x: number; y: number }[] {
  const xs = ring.map((c) => c[0]);
  const ys = ring.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1e-9);
  const rangeY = Math.max(maxY - minY, 1e-9);
  const drawableSize = VIEWBOX_SIZE - VIEWBOX_PADDING * 2;
  return ring.map((c) => ({
    x: VIEWBOX_PADDING + ((c[0] - minX) / rangeX) * drawableSize,
    y: VIEWBOX_SIZE - (VIEWBOX_PADDING + ((c[1] - minY) / rangeY) * drawableSize),
  }));
}

function toPath(points: { x: number; y: number }[]): string | undefined {
  if (points.length < 3) return undefined;
  const [first, ...rest] = points;
  const cmds = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (const p of rest) cmds.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  cmds.push('Z');
  return cmds.join(' ');
}

export default function BuildingFootprintMap({ lat, lng, rdX, rdY, footprint, reportId }: Props) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const ring = useMemo(() => getPrimaryRing(footprint), [footprint]);

  // Aerial photo URL (backend WMS proxy)
  const aerialUrl = useMemo(() => {
    if (rdX == null || rdY == null) return undefined;
    const params = new URLSearchParams({
      type: 'luchtfoto',
      rd_x: String(rdX),
      rd_y: String(rdY),
      radius: String(TILE_RADIUS),
      size: '512',
    });
    if (reportId) params.set('report_id', reportId);
    return `${buildPrimaryApiUrl('/address/wms-tile')}?${params}`;
  }, [rdX, rdY, reportId]);

  // Map footprint WGS84 coords to SVG overlay on the aerial image
  const overlayPath = useMemo(() => {
    if (!ring || ring.length < 3 || rdX == null || rdY == null) return undefined;
    return wgs84RingToSvgPath(ring, lng, lat, rdX, rdY, TILE_RADIUS);
  }, [ring, lng, lat, rdX, rdY]);

  // Fallback SVG path (when no aerial photo available)
  const fallbackPath = useMemo(() => {
    if (!ring || ring.length < 3) return undefined;
    return toPath(normalizeRing(ring));
  }, [ring]);

  const showAerial = aerialUrl && !imgError;

  return (
    <div className="footprint-map" data-testid="map">
      <div className="footprint-map__container" role="img" aria-label={t('map.aerialTitle', 'Luchtfoto')}>
        {showAerial ? (
          <div className="footprint-map__aerial-wrap">
            <img
              src={aerialUrl}
              alt={t('map.aerialTitle', 'Luchtfoto')}
              className="footprint-map__aerial-img"
              onError={() => setImgError(true)}
              loading="eager"
            />
            {overlayPath && (
              <svg
                className="footprint-map__aerial-overlay"
                viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                preserveAspectRatio="none"
              >
                <path d={overlayPath} className="footprint-map__shape" />
              </svg>
            )}
          </div>
        ) : (
          <svg
            className="footprint-map__svg"
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <pattern id="footprint-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" className="footprint-map__grid-line" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} className="footprint-map__bg" />
            <rect
              x={VIEWBOX_PADDING}
              y={VIEWBOX_PADDING}
              width={VIEWBOX_SIZE - VIEWBOX_PADDING * 2}
              height={VIEWBOX_SIZE - VIEWBOX_PADDING * 2}
              className="footprint-map__grid"
            />
            {fallbackPath && <path d={fallbackPath} className="footprint-map__shape" />}
            <circle cx={VIEWBOX_SIZE / 2} cy={VIEWBOX_SIZE / 2} r="1.8" className="footprint-map__pin" />
          </svg>
        )}
      </div>
      <p className="footprint-map__source">
        {showAerial
          ? t('map.aerialSource', 'Luchtfoto: PDOK / Kadaster (CC BY 4.0)')
          : `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
      </p>
    </div>
  );
}
