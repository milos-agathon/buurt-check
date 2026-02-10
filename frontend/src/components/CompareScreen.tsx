import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShortlistItem, SeverityLevel } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import ScoreBar from './ui/ScoreBar';
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
        <button className="compare-screen__back" onClick={onBack}>&larr; {t('nav.saved')}</button>
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

  return (
    <div className="compare-screen" data-testid="compare-screen">
      <div className="compare-screen__header">
        <button className="compare-screen__back" onClick={onBack}>&larr; {t('nav.saved')}</button>
        <button
          className={`compare-screen__filter ${differencesOnly ? 'compare-screen__filter--active' : ''}`}
          onClick={() => setDifferencesOnly(!differencesOnly)}
        >
          {t('compare.differencesOnly')}
        </button>
      </div>

      <div className="compare-screen__columns" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(item => (
          <div key={item.vboId} className="compare-screen__col-header">
            <span className="compare-screen__col-address">{item.address}</span>
            <span className="compare-screen__col-city">
              {[item.postcode, item.city].filter(Boolean).join(' ')}
            </span>
          </div>
        ))}
      </div>

      {filteredMetrics.map(metric => {
        const scores = items.map(i => i.riskScores[metric.key]);
        const validScores = scores.filter((s): s is number => s != null);
        const bestScore = validScores.length > 0 ? Math.max(...validScores) : null;
        const worstScore = validScores.length > 0 ? Math.min(...validScores) : null;
        const hasDifference = bestScore != null && worstScore != null && bestScore - worstScore > 15;

        return (
          <div key={metric.key} className="compare-screen__metric">
            <div className="compare-screen__metric-label">{t(metric.labelKey)}</div>
            <div className="compare-screen__metric-row" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
              {items.map((item, idx) => {
                const score = scores[idx];
                const sev = severityFromScore(score);
                const isBest = hasDifference && score === bestScore;
                const isWorst = hasDifference && score === worstScore;
                return (
                  <div
                    key={item.vboId}
                    className={`compare-screen__cell ${isBest ? 'compare-screen__cell--best' : ''} ${isWorst ? 'compare-screen__cell--worst' : ''}`}
                  >
                    <span className="compare-screen__score">{score ?? '--'}</span>
                    <ScoreBar score={score ?? 0} severity={sev} />
                    <SeverityBadge severity={sev} size="sm" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
