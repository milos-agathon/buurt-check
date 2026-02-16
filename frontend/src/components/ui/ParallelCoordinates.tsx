import type { CSSProperties } from 'react';
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
const PADDING_X = 26;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 42;
const SERIES_COLORS = ['#00897B', '#9AA0A6', '#D1D5DB', '#E8913A'];

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function axisX(index: number, axisCount: number): number {
  if (axisCount <= 1) return WIDTH / 2;
  const span = WIDTH - PADDING_X * 2;
  return PADDING_X + (index / (axisCount - 1)) * span;
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
  if (axes.length < 2 || series.length === 0) {
    return null;
  }

  return (
    <div className="parallel-coordinates" data-testid="parallel-coordinates">
      <svg
        className="parallel-coordinates__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Parallel coordinates chart"
      >
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
              >
                {axis.label}
              </text>
            </g>
          );
        })}

        {series.map((entry, index) => {
          const points = pointsForSeries(axes, entry.values);
          if (!points || points.split(' ').length < 2) return null;
          const color = SERIES_COLORS[index % SERIES_COLORS.length];
          const style = { '--series-color': color } as CSSProperties;

          return (
            <g key={entry.id} style={style}>
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
          const color = SERIES_COLORS[index % SERIES_COLORS.length];
          return (
            <div key={entry.id} className="parallel-coordinates__legend-item">
              <span
                className="parallel-coordinates__legend-swatch"
                style={{ backgroundColor: color }}
              />
              <span className="parallel-coordinates__legend-label">{entry.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
