import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LivabilityResponse } from '../types/api';
import {
  describeLivabilityDeviation,
  formatLivabilityClass,
  getLivabilityClassBarPercent,
  getLivabilityClassLabel,
  getLivabilityClassValue,
  getLivabilityComparisonClassValue,
  getLivabilityDeviationVisual,
  getLivabilityDimensionClassValue,
  getLivabilityTrendClassValue,
  livabilityLegendKey,
} from '../utils/livabilitySemantics';
import SectionSkeleton from './ui/SectionSkeleton';
import './LivabilityCard.css';

interface Props {
  data?: LivabilityResponse;
  loading?: boolean;
  error?: string | null;
  onTap?: () => void;
  onRetry?: () => void;
}

function LivabilityCard({ data, loading, error, onTap, onRetry }: Props) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <section className="livability-card" data-testid="livability-card" data-state="loading" aria-busy="true">
        <SectionSkeleton variant="livability" />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="livability-card" data-testid="livability-card" data-state="error">
        <p className="livability-card__error">{error || t('livability.error')}</p>
        {onRetry && (
          <button
            type="button"
            className="app__retry-button livability-card__retry"
            onClick={onRetry}
          >
            {t('error.retry', 'Retry')}
          </button>
        )}
      </section>
    );
  }

  if (!data) return null;

  if (!data.available) {
    return (
      <section className="livability-card" data-testid="livability-card" data-state="unavailable">
        <p className="livability-card__unavailable">{t('livability.unavailable')}</p>
      </section>
    );
  }

  const hasDimensions = data.dimensions.length > 0;
  const hasTrend = data.trend.length > 1;
  const hasComparison = data.comparison.length > 0;
  const language = i18n.resolvedLanguage ?? i18n.language;
  const overallClass = getLivabilityClassValue(data);
  const overallClassText = formatLivabilityClass(overallClass, t);
  const overallClassLabel = getLivabilityClassLabel(
    overallClass,
    t,
    data.overall_class_label,
  );
  const overallDeviationText = describeLivabilityDeviation(
    data.overall_deviation,
    t,
    language,
  );

  return (
    <section
      className={`livability-card${onTap ? ' livability-card--tappable' : ''}`}
      data-testid="livability-card"
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } } : undefined}
    >
      <div className="livability-card__header">
        <div className="livability-card__score-badge">
          <span className="livability-card__class-value">{overallClass}</span>
          <span className="livability-card__class-scale">{t('livability.classBadge')}</span>
        </div>
        <div className="livability-card__header-text">
          <p className="livability-card__buurt-name">{data.buurt_name}</p>
          <p className="livability-card__gemeente">{data.gemeente} — {data.year}</p>
          <p className="livability-card__class-label">{overallClassLabel}</p>
          <p className="livability-card__class-meta">
            {overallDeviationText ?? overallClassText}
          </p>
        </div>
        {onTap && (
          <svg className="livability-card__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>

      <div className="livability-card__dimensions" data-testid="livability-dimensions">
        {hasDimensions ? data.dimensions.map((dim) => {
          const classValue = getLivabilityDimensionClassValue(dim);
          const classText = formatLivabilityClass(classValue, t);
          const classLabel = getLivabilityClassLabel(classValue, t, dim.class_label);
          const deviationText = describeLivabilityDeviation(dim.deviation, t, language);
          const deviationVisual = getLivabilityDeviationVisual(dim.deviation);
          return (
            <div className="livability-card__dimension" key={dim.name}>
              <div className="livability-card__dimension-copy">
                <span className="livability-card__dimension-label">
                  {t(dim.label_code, dim.name)}
                </span>
                <span className="livability-card__dimension-meta">
                  {deviationText ?? classLabel}
                </span>
              </div>
              <div className="livability-card__dimension-track" aria-hidden="true">
                <span className="livability-card__dimension-axis" />
                {deviationVisual ? (
                  <span
                    className={`livability-card__dimension-fill livability-card__dimension-fill--${deviationVisual.tone}`}
                    style={{ left: deviationVisual.left, width: deviationVisual.width }}
                  />
                ) : null}
              </div>
              <span className="livability-card__dimension-value">{classText}</span>
            </div>
          );
        }) : (
          <p className="livability-card__unavailable">{t('livability.dimensionsUnavailable')}</p>
        )}
      </div>

      <div className="livability-card__trend" data-testid="livability-trend">
        <span className="livability-card__trend-label">{t('livability.trend')}</span>
        {hasTrend ? (
          <>
            <div className="livability-card__sparkline">
              {data.trend.map((point) => {
                const classValue = getLivabilityTrendClassValue(point);
                const pctHeight = getLivabilityClassBarPercent(classValue);
                return (
                  <div
                    key={point.year}
                    className="livability-card__spark-bar"
                    style={{ height: `${pctHeight}%` }}
                    role="img"
                    aria-label={`${point.year}: ${formatLivabilityClass(classValue, t)}`}
                  />
                );
              })}
            </div>
            <div className="livability-card__spark-years">
              {data.trend.map((point) => (
                <span key={point.year} className="livability-card__spark-year">
                  {point.year.slice(-2)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="livability-card__unavailable">{t('livability.trendUnavailable')}</p>
        )}
      </div>

      <div className="livability-card__comparison" data-testid="livability-comparison">
        <span className="livability-card__comparison-label">{t('livability.comparison')}</span>
        {hasComparison ? data.comparison.map((row) => (
          <div className="livability-card__comparison-row" key={`${row.level}-${row.name}`}>
            <span className="livability-card__comparison-name">
              {row.name}
            </span>
            <div className="livability-card__comparison-track">
              <div
                className={`livability-card__comparison-fill livability-card__comparison-fill--${livabilityLegendKey(row.level)}`}
                style={{ width: `${getLivabilityClassBarPercent(getLivabilityComparisonClassValue(row))}%` }}
              />
            </div>
            <span className="livability-card__comparison-value">
              {formatLivabilityClass(getLivabilityComparisonClassValue(row), t)}
            </span>
          </div>
        )) : (
          <p className="livability-card__unavailable">{t('livability.comparisonUnavailable')}</p>
        )}
      </div>

      {/* Source */}
      <p className="livability-card__source">
        {t('livability.source', { source: data.source, date: data.source_date ?? data.year })}
      </p>
    </section>
  );
}

export default memo(LivabilityCard);
