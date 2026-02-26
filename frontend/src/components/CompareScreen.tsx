import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShortlistItem, SeverityLevel } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import ScoreBar from './ui/ScoreBar';
import ParallelCoordinates from './ui/ParallelCoordinates';
import './CompareScreen.css';

interface Props {
  items: ShortlistItem[];
  onBack: () => void;
  onSearchAddress: () => void;
}

type MetricKey = 'noise' | 'air' | 'climate' | 'sunlight';

const DIFFERENCE_THRESHOLD = 15;

const METRICS: { key: MetricKey; labelKey: string }[] = [
  { key: 'noise', labelKey: 'risk.noise.tileLabel' },
  { key: 'air', labelKey: 'risk.air.tileLabel' },
  { key: 'climate', labelKey: 'risk.climate.tileLabel' },
  { key: 'sunlight', labelKey: 'risk.sunlight.tileLabel' },
];

function severityFromScore(score: number | undefined): SeverityLevel {
  if (score == null) return 'unavailable';
  if (score >= 70) return 'good';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'poor';
  return 'critical';
}

export default function CompareScreen({ items, onBack, onSearchAddress }: Props) {
  const { t } = useTranslation();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const columnsRef = useRef<HTMLDivElement>(null);

  const filteredMetrics = differencesOnly
    ? METRICS.filter(m => {
        const scores = items.map(i => i.riskScores[m.key]);
        const valid = scores.filter((s): s is number => s != null);
        if (valid.length < 2) return true; // show if data missing
        return Math.max(...valid) - Math.min(...valid) > DIFFERENCE_THRESHOLD;
      })
    : METRICS;
  const chartAxes = filteredMetrics.map((metric) => ({
    key: metric.key,
    label: t(metric.labelKey),
  }));
  const chartSeries = items.map((item) => ({
    id: item.vboId,
    label: item.address,
    values: {
      noise: item.riskScores.noise,
      air: item.riskScores.air,
      climate: item.riskScores.climate,
      sunlight: item.riskScores.sunlight,
    },
  }));

  useEffect(() => {
    setActiveColumnIndex((prev) => Math.max(0, Math.min(prev, items.length - 1)));
  }, [items.length]);

  const scrollToColumn = (index: number) => {
    const container = columnsRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(`[data-column-index="${index}"]`);
    const prefersReducedMotion =
      typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  };

  const moveToColumn = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, items.length - 1));
    setActiveColumnIndex(clamped);
    scrollToColumn(clamped);
  };

  const handleColumnsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveToColumn(activeColumnIndex + 1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveToColumn(activeColumnIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      moveToColumn(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      moveToColumn(items.length - 1);
    }
  };

  const handleColumnsScroll = () => {
    const container = columnsRef.current;
    if (!container) return;

    const columns = Array.from(container.querySelectorAll<HTMLElement>('.compare-screen__snap-column'));
    if (columns.length === 0) return;

    const currentScroll = container.scrollLeft;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    columns.forEach((column, index) => {
      const distance = Math.abs(column.offsetLeft - currentScroll);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveColumnIndex(nearestIndex);
  };

  const activeAddress = items[activeColumnIndex]?.address ?? '';

  if (items.length < 2) {
    return (
      <div className="compare-screen" data-testid="compare-screen">
        <button type="button" className="compare-screen__back" onClick={onBack}>&larr; {t('nav.saved')}</button>
        <p className="compare-screen__no-data">{t('compare.noData')}</p>
        <button
          type="button"
          className="compare-screen__cta"
          onClick={onSearchAddress}
        >
          {t('compare.searchCta')}
        </button>
      </div>
    );
  }

  return (
    <div className="compare-screen" data-testid="compare-screen">
      <div className="compare-screen__header">
        <button type="button" className="compare-screen__back" onClick={onBack}>&larr; {t('nav.saved')}</button>
        <button
          type="button"
          className={`compare-screen__filter ${differencesOnly ? 'compare-screen__filter--active' : ''}`}
          onClick={() => setDifferencesOnly(!differencesOnly)}
        >
          {t('compare.differencesOnly')}
        </button>
      </div>

      {differencesOnly && (
        <p className="compare-screen__filter-hint">
          {t('compare.filter_hint', { threshold: DIFFERENCE_THRESHOLD })}
        </p>
      )}

      {chartAxes.length >= 2 && (
        <section className="compare-screen__chart">
          <h3 className="compare-screen__chart-title">{t('compare.parallelTitle')}</h3>
          <ParallelCoordinates axes={chartAxes} series={chartSeries} />
        </section>
      )}

      <p id="compare-current-column" className="sr-only" aria-live="polite" aria-atomic="true">
        {t('compare.currentColumn', { address: activeAddress })}
      </p>

      <div
        ref={columnsRef}
        className="compare-screen__snap-columns"
        role="region"
        tabIndex={0}
        aria-label={t('compare.columns')}
        aria-describedby="compare-current-column"
        onKeyDown={handleColumnsKeyDown}
        onScroll={handleColumnsScroll}
      >
        {items.map((item, itemIdx) => (
          <article
            key={item.vboId}
            id={`compare-column-${item.vboId}`}
            className="compare-screen__snap-column"
            data-column-index={itemIdx}
            aria-current={itemIdx === activeColumnIndex ? 'true' : undefined}
          >
            <div className="compare-screen__col-header">
              <span className="compare-screen__col-address">{item.address}</span>
              <span className="compare-screen__col-city">
                {[item.postcode, item.city].filter(Boolean).join(' ')}
              </span>
            </div>

            {filteredMetrics.map(metric => {
              const scores = items.map(i => i.riskScores[metric.key]);
              const validScores = scores.filter((s): s is number => s != null);
              const bestScore = validScores.length > 0 ? Math.max(...validScores) : null;
              const worstScore = validScores.length > 0 ? Math.min(...validScores) : null;
              const hasDifference = bestScore != null && worstScore != null && bestScore - worstScore > DIFFERENCE_THRESHOLD;
              const score = scores[itemIdx];
              const sev = severityFromScore(score);
              const isBest = hasDifference && score === bestScore;
              const isWorst = hasDifference && score === worstScore;

              return (
                <section key={metric.key} className="compare-screen__metric">
                  <div className="compare-screen__metric-label">{t(metric.labelKey)}</div>
                  <div
                    className={`compare-screen__cell ${isBest ? 'compare-screen__cell--best' : ''} ${isWorst ? 'compare-screen__cell--worst' : ''}`}
                  >
                    <span className="compare-screen__score">{score ?? '--'}</span>
                    <ScoreBar score={score ?? 0} severity={sev} />
                    <SeverityBadge severity={sev} size="sm" />
                  </div>
                </section>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}
