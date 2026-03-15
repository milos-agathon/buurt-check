import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useFocusTrap from '../hooks/useFocusTrap';
import type { LivabilityAvailableResponse } from '../types/api';
import './LivabilityDetailView.css';

interface Props {
  data: LivabilityAvailableResponse;
  onClose: () => void;
}

function scoreSeverity(normalized: number): string {
  if (normalized >= 70) return 'good';
  if (normalized >= 40) return 'moderate';
  if (normalized >= 20) return 'poor';
  return 'critical';
}

function levelToColorKey(level: string): 'address' | 'city' | 'nl' {
  if (level === 'buurt') return 'address';
  if (level === 'wijk') return 'city';
  return 'nl';
}

export default function LivabilityDetailView({ data, onClose }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    isOpen: true,
    containerRef,
    onRequestClose: onClose,
    initialFocusSelector: '.livability-detail__back',
  });

  const severity = scoreSeverity(data.overall_normalized);

  // Check if any trend point has per-dimension data
  const hasDimensionTrends = data.trend.length > 1 &&
    data.trend.some((p) => p.dimensions.length > 0);

  // Stable dimension order
  const dimensionNames: string[] = hasDimensionTrends
    ? ['physical', 'safety', 'social', 'amenities', 'housing']
    : [];

  return (
    <div className="livability-detail" data-testid="livability-detail" ref={containerRef}>
      <nav className="livability-detail__nav">
        <button className="livability-detail__back" onClick={onClose} aria-label={t('common.back')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="livability-detail__nav-title">{t('livability.detailTitle', 'Livability Analysis')}</span>
      </nav>

      <div className="livability-detail__content">
        {/* Overall score */}
        <div className="livability-detail__score-section">
          <div className={`livability-detail__score livability-detail__score--${severity}`}>
            {data.overall_normalized}
            <span className="livability-detail__score-scale" aria-hidden="true">{t('score.scale', '/100')}</span>
          </div>
          <p className="livability-detail__score-label">
            {data.buurt_name}, {data.gemeente}
          </p>
        </div>

        {/* 5 dimension bars */}
        <section className="livability-detail__section" data-testid="livability-detail-dimensions">
          <h3 className="livability-detail__section-title">{t('livability.dimensions', 'Dimensions')}</h3>
          {data.dimensions.length > 0 ? (
            <div className="livability-detail__dimensions">
              {data.dimensions.map((dim) => {
                const dimSev = scoreSeverity(dim.normalized_score);
                return (
                  <div className="livability-detail__dim-row" key={dim.name}>
                    <span className="livability-detail__dim-label">
                      {t(dim.label_code, dim.name)}
                    </span>
                    <div className="livability-detail__dim-track">
                      <div
                        className={`livability-detail__dim-fill livability-detail__dim-fill--${dimSev}`}
                        style={{ width: `${dim.normalized_score}%` }}
                      />
                    </div>
                    <span className="livability-detail__dim-value">{dim.normalized_score}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="livability-detail__unavailable">{t('livability.dimensionsUnavailable')}</p>
          )}
        </section>

        <section className="livability-detail__section" data-testid="livability-detail-trend">
          <h3 className="livability-detail__section-title">{t('livability.trend')}</h3>
          {data.trend.length > 1 ? (
            <div className="livability-detail__trend-chart">
              {data.trend.map((point) => {
                const barSev = scoreSeverity(point.overall_normalized);
                return (
                  <div className="livability-detail__trend-col" key={point.year}>
                    <div className="livability-detail__trend-bar-wrapper">
                      <div
                        className={`livability-detail__trend-bar livability-detail__trend-bar--${barSev}`}
                        style={{ height: `${Math.max(10, point.overall_normalized)}%` }}
                      />
                    </div>
                    <span className="livability-detail__trend-value">{point.overall_normalized}</span>
                    <span className="livability-detail__trend-year">{point.year}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="livability-detail__unavailable">{t('livability.trendUnavailable')}</p>
          )}
        </section>

        {/* Per-dimension trends */}
        {data.trend.length > 1 && (
          <section className="livability-detail__section" data-testid="livability-detail-dim-trends">
            <h3 className="livability-detail__section-title">{t('livability.dimensionTrends', 'Dimension trends')}</h3>
            {hasDimensionTrends ? dimensionNames.map((dimName) => {
              const dimLabel = `livability.dimension.${dimName}`;
              return (
                <div className="livability-detail__dim-trend-row" key={dimName}>
                  <span className="livability-detail__dim-trend-label">
                    {t(dimLabel, dimName)}
                  </span>
                  <div className="livability-detail__dim-trend-bars">
                    {data.trend.map((point) => {
                      const dim = point.dimensions.find((d) => d.name === dimName);
                      if (!dim) {
                        return (
                          <div className="livability-detail__dim-trend-bar-slot" key={point.year}>
                            <span className="livability-detail__dim-trend-missing">—</span>
                          </div>
                        );
                      }
                      const barSev = scoreSeverity(dim.normalized_score);
                      return (
                        <div
                          className={`livability-detail__dim-trend-bar livability-detail__dim-trend-bar--${barSev}`}
                          style={{ height: `${Math.max(10, dim.normalized_score)}%` }}
                          key={point.year}
                          role="img"
                          aria-label={`${point.year}: ${dim.normalized_score}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }) : (
              <p className="livability-detail__unavailable">{t('livability.dimensionTrendsUnavailable')}</p>
            )}
          </section>
        )}

        {/* Comparison bars */}
        <section className="livability-detail__section" data-testid="livability-detail-comparison">
          <h3 className="livability-detail__section-title">{t('livability.comparison')}</h3>
          {data.comparison.length > 0 ? (
            <>
              <div className="livability-detail__legend" data-testid="livability-comparison-legend">
                {(['address', 'city', 'nl'] as const)
                  .filter((key) => data.comparison.some((r) => levelToColorKey(r.level) === key))
                  .map((key) => (
                    <span key={key} className="livability-detail__legend-item">
                      <span className={`livability-detail__legend-dot livability-detail__legend-dot--${key}`} />
                      {t(`compare.legend.${key}`)}
                    </span>
                  ))}
              </div>
              <div className="livability-detail__comparisons">
                {data.comparison.map((row) => {
                  const colorKey = levelToColorKey(row.level);
                  return (
                    <div className="livability-detail__cmp-row" key={row.level}>
                      <span className="livability-detail__cmp-label">{row.name}</span>
                      <div className="livability-detail__cmp-track">
                        <div
                          className={`livability-detail__cmp-fill livability-detail__cmp-fill--${colorKey}`}
                          style={{ width: `${row.overall_normalized}%` }}
                        />
                      </div>
                      <span className="livability-detail__cmp-value">{row.overall_normalized}</span>
                    </div>
                  );
                })}
              </div>
              <p className="livability-detail__directionality" data-testid="livability-comparison-directionality">
                {t('compare.legend.higher_is_better')}
              </p>
            </>
          ) : (
            <p className="livability-detail__unavailable">{t('livability.comparisonUnavailable')}</p>
          )}
        </section>

        {/* Source */}
        <footer className="livability-detail__footer">
          <p className="livability-detail__source">
            {t('livability.source', { source: data.source, date: data.source_date ?? data.year })}
          </p>
        </footer>
      </div>
    </div>
  );
}
