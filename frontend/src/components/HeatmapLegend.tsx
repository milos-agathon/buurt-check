import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getSunHoursGradientCss } from '../utils/heatmapColors';
import './HeatmapLegend.css';

interface Props {
  minHours: number;
  maxHours: number;
  visible: boolean;
}

const HEATMAP_GRADIENT = getSunHoursGradientCss();
const HEATMAP_GRADIENT_STYLE = {
  '--sun-hours-gradient': HEATMAP_GRADIENT,
} as CSSProperties;

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export default function HeatmapLegend({ minHours, maxHours, visible }: Props) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div className="heatmap-legend" data-testid="heatmap-legend">
      <p className="heatmap-legend__title">{t('viewer3d.heatmapLegend')}</p>
      <div className="heatmap-legend__row">
        <span className="heatmap-legend__label">{formatHours(minHours)}h</span>
        <div className="heatmap-legend__gradient" style={HEATMAP_GRADIENT_STYLE} />
        <span className="heatmap-legend__label">{formatHours(maxHours)}h</span>
      </div>
    </div>
  );
}
