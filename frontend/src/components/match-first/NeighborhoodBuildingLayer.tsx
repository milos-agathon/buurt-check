import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  MatchNeighborhoodBuildingsResponse,
  MatchNeighborhoodMapLayersResponse,
} from '../../types/matchFirst';

interface NeighborhoodBuildingLayerProps {
  layers: MatchNeighborhoodMapLayersResponse | null;
  buildings: MatchNeighborhoodBuildingsResponse | null;
  loading?: boolean;
  failed?: boolean;
}

type CanvasState = 'pending' | 'drawn' | 'fallback';

function drawFallbackScene(
  canvas: HTMLCanvasElement,
  buildings: MatchNeighborhoodBuildingsResponse | null,
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
  context.fillStyle = '#eef6f3';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = '#00756f';
  context.lineWidth = 3;
  context.strokeRect(width * 0.12, height * 0.14, width * 0.76, height * 0.72);

  context.fillStyle = 'rgba(0, 117, 111, 0.13)';
  context.fillRect(width * 0.18, height * 0.24, width * 0.18, height * 0.18);
  context.fillRect(width * 0.44, height * 0.28, width * 0.16, height * 0.26);
  context.fillRect(width * 0.64, height * 0.46, width * 0.16, height * 0.2);

  context.strokeStyle = 'rgba(55, 86, 83, 0.45)';
  context.lineWidth = 1;
  for (let x = width * 0.18; x <= width * 0.82; x += width * 0.12) {
    context.beginPath();
    context.moveTo(x, height * 0.18);
    context.lineTo(x - width * 0.1, height * 0.82);
    context.stroke();
  }

  if (buildings?.buildings.length) {
    context.fillStyle = 'rgba(0, 92, 87, 0.28)';
    buildings.buildings.slice(0, 10).forEach((_, index) => {
      const column = index % 5;
      const row = Math.floor(index / 5);
      context.fillRect(
        width * (0.2 + column * 0.12),
        height * (0.32 + row * 0.18),
        width * 0.07,
        height * 0.08,
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
}: NeighborhoodBuildingLayerProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>('pending');

  useEffect(() => {
    if (!layers || !canvasRef.current) return;
    try {
      setCanvasState(drawFallbackScene(canvasRef.current, buildings));
    } catch {
      setCanvasState('fallback');
    }
  }, [buildings, layers]);

  return (
    <div
      className="neighborhood-building-layer"
      data-testid="neighborhood-building-layer"
      data-building-layer-available={layers?.building_layer.available === true ? 'true' : 'false'}
      data-canvas-state={canvasState}
    >
      <canvas
        ref={canvasRef}
        className="neighborhood-building-layer__canvas"
        aria-label={t('matchFirst.neighborhood.canvasLabel')}
        data-testid="neighborhood-building-canvas"
      />
      {loading && <p role="status">{t('matchFirst.neighborhood.buildingsLoading')}</p>}
      {failed && <p role="status">{t('matchFirst.neighborhood.buildingsUnavailable')}</p>}
      {buildings?.fallback_reason_code && (
        <p className="neighborhood-building-layer__fallback" role="status">
          {t(buildings.fallback_reason_code)}
        </p>
      )}
      {!layers && !loading && (
        <p className="neighborhood-building-layer__fallback" role="status">
          {t('matchFirst.neighborhood.layersLoading')}
        </p>
      )}
    </div>
  );
}
