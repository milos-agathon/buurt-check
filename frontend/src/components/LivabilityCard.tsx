import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LivabilityResponse, SeverityLevel } from '../types/api';
import AnimatedScore from './ui/AnimatedScore';
import SectionSkeleton from './SectionSkeleton';
import './LivabilityCard.css';

interface Props {
  data?: LivabilityResponse;
  loading?: boolean;
  error?: string | null;
  onTap?: () => void;
  onRetry?: () => void;
}

function scoreSeverity(normalized: number): SeverityLevel {
  if (normalized >= 70) return 'good';
  if (normalized >= 40) return 'moderate';
  if (normalized >= 20) return 'poor';
  return 'critical';
}

function LivabilityCard({ data, loading, error, onTap, onRetry }: Props) {
  const { t } = useTranslation();

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

  const severity = scoreSeverity(data.overall_normalized);

  return (
    <section
      className={`livability-card${onTap ? ' livability-card--tappable' : ''}`}
      data-testid="livability-card"
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={onTap ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } } : undefined}
    >
      {/* Score badge + buurt name */}
      <div className="livability-card__header">
        <div className={`livability-card__score-badge livability-card__score-badge--${severity}`}>
          <AnimatedScore value={data.overall_normalized} className="livability-card__score-value" showScale />
        </div>
        <div className="livability-card__header-text">
          <p className="livability-card__buurt-name">{data.buurt_name}</p>
          <p className="livability-card__gemeente">{data.gemeente} — {data.year}</p>
        </div>
        {onTap && (
          <svg className="livability-card__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>

      {/* 5 dimension bars */}
      {data.dimensions.length > 0 && (
        <div className="livability-card__dimensions" data-testid="livability-dimensions">
          {data.dimensions.map((dim) => {
            const dimSeverity = scoreSeverity(dim.normalized_score);
            return (
              <div className="livability-card__dimension" key={dim.name}>
                <span className="livability-card__dimension-label">
                  {t(dim.label_code, dim.name)}
                </span>
                <div className="livability-card__dimension-track">
                  <div
                    className={`livability-card__dimension-fill livability-card__dimension-fill--${dimSeverity}`}
                    style={{ width: `${dim.normalized_score}%` }}
                  />
                </div>
                <span className="livability-card__dimension-value">{dim.normalized_score}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sparkline trend */}
      {data.trend.length > 1 && (
        <div className="livability-card__trend" data-testid="livability-trend">
          <span className="livability-card__trend-label">{t('livability.trend')}</span>
          <div className="livability-card__sparkline">
            {data.trend.map((point) => {
              const pctHeight = Math.max(10, point.overall_normalized);
              const barSeverity = scoreSeverity(point.overall_normalized);
              return (
                <div
                  key={point.year}
                  className={`livability-card__spark-bar livability-card__spark-bar--${barSeverity}`}
                  style={{ height: `${pctHeight}%` }}
                  role="img"
                  aria-label={`${point.year}: ${point.overall_normalized}/100`}
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
        </div>
      )}

      {/* Wijk/Gemeente comparison */}
      {data.comparison.length > 0 && (
        <div className="livability-card__comparison" data-testid="livability-comparison">
          <span className="livability-card__comparison-label">{t('livability.comparison')}</span>
          {data.comparison.map((row) => (
            <div className="livability-card__comparison-row" key={row.level}>
              <span className="livability-card__comparison-name">
                {row.name}
              </span>
              <div className="livability-card__comparison-track">
                <div
                  className="livability-card__comparison-fill"
                  style={{ width: `${row.overall_normalized}%` }}
                />
              </div>
              <span className="livability-card__comparison-value">{row.overall_normalized}</span>
            </div>
          ))}
        </div>
      )}

      {/* Source */}
      <p className="livability-card__source">
        {t('livability.source', { source: data.source, date: data.source_date ?? data.year })}
      </p>
    </section>
  );
}

export default memo(LivabilityCard);
