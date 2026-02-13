import { useMemo } from 'react';
import type { Geometry, Position } from 'geojson';
import { useTranslation } from 'react-i18next';
import './BuildingFootprintMap.css';

interface Props {
  lat: number;
  lng: number;
  footprint?: Geometry;
  zoom?: number;
}

interface Point {
  x: number;
  y: number;
}

const VIEWBOX_SIZE = 100;
const VIEWBOX_PADDING = 8;

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

function normalizeRing(ring: Position[]): Point[] {
  const xs = ring.map((coord) => coord[0]);
  const ys = ring.map((coord) => coord[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = Math.max(maxX - minX, 1e-9);
  const rangeY = Math.max(maxY - minY, 1e-9);
  const drawableSize = VIEWBOX_SIZE - VIEWBOX_PADDING * 2;

  return ring.map((coord) => {
    const x = VIEWBOX_PADDING + ((coord[0] - minX) / rangeX) * drawableSize;
    const y = VIEWBOX_SIZE - (VIEWBOX_PADDING + ((coord[1] - minY) / rangeY) * drawableSize);
    return { x, y };
  });
}

function toPath(points: Point[]): string | undefined {
  if (points.length < 3) return undefined;
  const [first, ...rest] = points;
  const commands = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (const point of rest) {
    commands.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

export default function BuildingFootprintMap({ lat, lng, footprint, zoom }: Props) {
  const { t } = useTranslation();
  const ringPath = useMemo(() => {
    const ring = getPrimaryRing(footprint);
    if (!ring || ring.length < 3) return undefined;
    return toPath(normalizeRing(ring));
  }, [footprint]);

  const zoomHint = zoom ?? 18;

  return (
    <div className="footprint-map" data-testid="map">
      <h2 className="footprint-map__title">{t('map.title')}</h2>
      <div className="footprint-map__container" role="img" aria-label={t('map.title')}>
        <svg
          className="footprint-map__svg"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern
              id="footprint-grid"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
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
          {ringPath && <path d={ringPath} className="footprint-map__shape" />}
          <circle cx={VIEWBOX_SIZE / 2} cy={VIEWBOX_SIZE / 2} r="1.8" className="footprint-map__pin" />
        </svg>
        <p className="footprint-map__meta">
          {lat.toFixed(5)}, {lng.toFixed(5)} | z{zoomHint}
        </p>
      </div>
    </div>
  );
}
