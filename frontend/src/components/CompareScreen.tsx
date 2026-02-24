import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShortlistItem, SeverityLevel } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import ScoreBar from './ui/ScoreBar';
import ParallelCoordinates from './ui/ParallelCoordinates';
import './CompareScreen.css';

interface Props {
  items: ShortlistItem[];
  onBack: () => void;
}

type MetricKey = 'noise' | 'air' | 'climate' | 'sunlight';

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

export default function CompareScreen({ items, onBack }: Props) {
  const { t } = useTranslation();
  const [differencesOnly, setDifferencesOnly] = useState(false);

  if (items.length < 2) {
    return (
      <div className="compare-screen" data-testid="compare-screen">
        <button type="button" className="compare-screen__back" onClick={onBack}>&larr; {t('nav.saved')}</button>
        <p className="compare-screen__no-data">{t('compare.noData')}</p>
      </div>
    );
  }

  const filteredMetrics = differencesOnly
    ? METRICS.filter(m => {
        const scores = items.map(i => i.riskScores[m.key]);
        const valid = scores.filter((s): s is number => s != null);
        if (valid.length < 2) return true; // show if data missing
        return Math.max(...valid) - Math.min(...valid) > 15;
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

      {chartAxes.length >= 2 && (
        <section className="compare-screen__chart">
          <h3 className="compare-screen__chart-title">{t('compare.parallelTitle')}</h3>
          <ParallelCoordinates axes={chartAxes} series={chartSeries} />
        </section>
      )}

      <div className="compare-screen__snap-columns" role="region" aria-label={t('compare.title')}>
        {items.map((item, itemIdx) => (
          <article key={item.vboId} className="compare-screen__snap-column">
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
              const hasDifference = bestScore != null && worstScore != null && bestScore - worstScore > 15;
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
