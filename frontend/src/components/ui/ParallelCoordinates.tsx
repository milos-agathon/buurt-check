import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import './ParallelCoordinates.css';

export interface ParallelAxis {
  key: string;
  label: string;
}

export interface ParallelSeries {
  id: string;
  label: string;
  values: Record<string, number | undefined>;
}

interface ParallelCoordinatesProps {
  axes: ParallelAxis[];
  series: ParallelSeries[];
}

const WIDTH = 360;
const HEIGHT = 190;
const PADDING_X = 36;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 42;
const SERIES_CLASSES = ['address', 'city', 'nl', 'who'];

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function axisX(index: number, axisCount: number): number {
  if (axisCount <= 1) return WIDTH / 2;
  const span = WIDTH - PADDING_X * 2;
  return PADDING_X + (index / (axisCount - 1)) * span;
}

/** Maximum width a label may occupy without overlapping its neighbors. */
function maxLabelWidth(axisCount: number): number {
  if (axisCount <= 1) return WIDTH - PADDING_X * 2;
  const span = WIDTH - PADDING_X * 2;
  const gap = span / (axisCount - 1);
  // Edge labels are bounded by padding on one side and half-gap on the other.
  // Use the smaller constraint (gap) minus a small margin.
  return Math.min(gap, PADDING_X * 2) - 4;
}

function scoreY(score: number): number {
  const span = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  return PADDING_TOP + (1 - clampScore(score) / 100) * span;
}

function pointsForSeries(axes: ParallelAxis[], values: Record<string, number | undefined>): string {
  const points: string[] = [];
  axes.forEach((axis, index) => {
    const score = values[axis.key];
    if (score == null) return;
    points.push(`${axisX(index, axes.length)},${scoreY(score)}`);
  });
  return points.join(' ');
}

export default function ParallelCoordinates({ axes, series }: ParallelCoordinatesProps) {
  const { t } = useTranslation();
  const chartDescriptionId = useId();

  if (axes.length < 2 || series.length === 0) {
    return null;
  }

  const addressNames = series.map((entry) => entry.label).join(', ');
  const categoryNames = axes.map((axis) => axis.label).join(', ');

  return (
    <div className="parallel-coordinates" data-testid="parallel-coordinates">
      <svg
        className="parallel-coordinates__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t('compare.chartLabel', { addresses: addressNames, categories: categoryNames })}
        aria-describedby={chartDescriptionId}
      >
        <desc id={chartDescriptionId}>
          {t('compare.chartDescription', { addresses: addressNames, categories: categoryNames })}
        </desc>

        {[0, 25, 50, 75, 100].map((tick) => (
          <line
            key={tick}
            x1={PADDING_X}
            y1={scoreY(tick)}
            x2={WIDTH - PADDING_X}
            y2={scoreY(tick)}
            className="parallel-coordinates__grid-line"
          />
        ))}

        {axes.map((axis, index) => {
          const x = axisX(index, axes.length);
          const labelMax = maxLabelWidth(axes.length);
          // Estimate natural width: ~6.5px per character at 11px font size.
          // Only constrain labels that would exceed the available slot width.
          const estimatedWidth = axis.label.length * 6.5;
          const needsConstraint = estimatedWidth > labelMax;
          return (
            <g key={axis.key}>
              <line
                x1={x}
                y1={PADDING_TOP}
                x2={x}
                y2={HEIGHT - PADDING_BOTTOM}
                className="parallel-coordinates__axis-line"
              />
              <text
                x={x}
                y={HEIGHT - 22}
                textAnchor="middle"
                className="parallel-coordinates__axis-label"
                {...(needsConstraint ? { textLength: labelMax, lengthAdjust: 'spacingAndGlyphs' } : {})}
              >
                {axis.label}
              </text>
            </g>
          );
        })}

        {series.map((entry, index) => {
          const points = pointsForSeries(axes, entry.values);
          if (!points || points.split(' ').length < 2) return null;
          const seriesClass = SERIES_CLASSES[index % SERIES_CLASSES.length];

          return (
            <g key={entry.id} className={`parallel-coordinates__series--${seriesClass}`}>
              <polyline points={points} className="parallel-coordinates__line" />
              {points.split(' ').map((point, pointIndex) => {
                const [x, y] = point.split(',');
                return (
                  <circle
                    key={`${entry.id}-${pointIndex}`}
                    cx={x}
                    cy={y}
                    r="4"
                    className="parallel-coordinates__point"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="parallel-coordinates__legend">
        {series.map((entry, index) => {
          const seriesClass = SERIES_CLASSES[index % SERIES_CLASSES.length];
          return (
            <div key={entry.id} className="parallel-coordinates__legend-item">
              <span
                className={`parallel-coordinates__legend-swatch parallel-coordinates__legend-swatch--${seriesClass}`}
              />
              <span className="parallel-coordinates__legend-label">{entry.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
