import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TierBResponse, SeverityLevel } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import './TierBSignalsCard.css';

interface Props {
  data?: TierBResponse;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatCrimeValue(
  per1000: number | undefined,
  rawCount: number | undefined,
  unavailableLabel: string,
  per1000Suffix: string,
  rawSuffix: string,
): { value: string; suffix: string } {
  if (per1000 != null) return { value: per1000.toFixed(1), suffix: per1000Suffix };
  if (rawCount != null) return { value: String(Math.round(rawCount)), suffix: rawSuffix };
  return { value: unavailableLabel, suffix: '' };
}

/** Convert CBS period like "2026MM01" to "January 2026" / "januari 2026". */
function formatCbsPeriod(period: string, locale: string): string {
  const match = period.match(/^(\d{4})MM(\d{2})$/);
  if (!match) return period;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const date = new Date(year, month);
  const monthName = date.toLocaleString(locale, { month: 'long' });
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

function getEnergyBadgeClass(label: string): string {
  const band = label.trim().charAt(0).toLowerCase();
  if (band >= 'a' && band <= 'g') {
    return `tier-b-card__energy-badge tier-b-card__energy-badge--${band}`;
  }
  return 'tier-b-card__energy-badge';
}

function TierBSignalsCard({ data, loading, error, onRetry }: Props) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <section className="tier-b-card" data-testid="tier-b-card">
        <p className="tier-b-card__loading">{t('tierB.loading')}</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="tier-b-card" data-testid="tier-b-card" data-state="error">
        <p className="tier-b-card__error">{error || t('tierB.error')}</p>
        {onRetry && (
          <button
            type="button"
            className="app__retry-button tier-b-card__retry"
            onClick={onRetry}
          >
            {t('error.retry', 'Retry')}
          </button>
        )}
      </section>
    );
  }

  if (!data) return null;

  const energyLabel = data.energy_label;
  const energySourceDate = energyLabel.source_date ?? t('risk.dateUnknown');
  const energyMessage = energyLabel.message
    ? t(`tierB.energy.message.${energyLabel.message}`, { defaultValue: t('tierB.energy.message.default') })
    : t('tierB.energy.message.default');

  const unavailable = t('tierB.unavailable');
  const crimeSourceDate = data.crime.source_date ?? data.crime.yearly_period ?? t('risk.dateUnknown');
  const per1000Suffix = ` / ${new Intl.NumberFormat(i18n.language).format(1000)}`;
  const rawSuffix = ` ${t('tierB.crime.rawSuffix')}`;
  const hasRates = data.crime.total_per_1000 != null;
  const nationalRate = data.crime.national_per_1000;
  const maxComparisonRate = Math.max(data.crime.total_per_1000 ?? 0, nationalRate ?? 0, 1);

  const total = formatCrimeValue(data.crime.total_per_1000, data.crime.total_count, unavailable, per1000Suffix, rawSuffix);
  const burglary = formatCrimeValue(data.crime.burglary_per_1000, data.crime.burglary_count, unavailable, per1000Suffix, rawSuffix);
  const violent = formatCrimeValue(data.crime.violent_per_1000, data.crime.violent_count, unavailable, per1000Suffix, rawSuffix);
  const monthly = formatCrimeValue(data.crime.monthly_total_per_1000, data.crime.monthly_total_count, unavailable, per1000Suffix, rawSuffix);

  return (
    <section className="tier-b-card" data-testid="tier-b-card">
      <article className="tier-b-card__panel" data-testid="energy-label-panel">
        <h3 className="tier-b-card__panel-title">{t('tierB.energy.title')}</h3>
        {energyLabel.label ? (
          <>
            <div className="tier-b-card__energy-label-row">
              <span
                className={getEnergyBadgeClass(energyLabel.label)}
                role="img"
                aria-label={t('tierB.energy.badgeAria', { label: energyLabel.label })}
              >
                {energyLabel.label}
              </span>
            </div>
            <p className="tier-b-card__meaning">{t('tierB.energy.meaning')}</p>
          </>
        ) : (
          <p className="tier-b-card__energy-message">{energyMessage}</p>
        )}
        <p className="tier-b-card__source-line">
          {t('tierB.source.energy', { source: energyLabel.source, date: energySourceDate })}
        </p>
      </article>

      <article className="tier-b-card__panel">
        <h3 className="tier-b-card__panel-title">{t('tierB.crime.title')}</h3>
        {data.crime.severity && (
          <div className="tier-b-card__severity-row">
            <SeverityBadge severity={data.crime.severity as SeverityLevel} />
            {data.crime.score != null && (
              <span className="tier-b-card__crime-score">
                {data.crime.score}
                <span className="tier-b-card__crime-score-scale">{t('tierB.crime.scoreScale', '/100')}</span>
              </span>
            )}
          </div>
        )}
        {(() => {
          const meaning = i18n.language === 'nl' ? data.crime.meaning_nl : data.crime.meaning_en;
          return meaning ? (
            <p className="tier-b-card__meaning">{meaning}</p>
          ) : null;
        })()}
        {hasRates && (
          <div className="tier-b-card__comparison">
            <span className="tier-b-card__cmp-title">{t('tierB.crime.comparison.title')}</span>
            <div className="tier-b-card__cmp-row">
              <span className="tier-b-card__cmp-label">{t('tierB.crime.comparison.thisArea')}</span>
              <div className="tier-b-card__cmp-track">
                <div
                  className="tier-b-card__cmp-fill"
                  style={{ width: `${Math.min(100, (data.crime.total_per_1000! / maxComparisonRate) * 100)}%` }}
                />
              </div>
              <span className="tier-b-card__cmp-value">{data.crime.total_per_1000!.toFixed(1)}</span>
            </div>
            {nationalRate != null && (
              <div className="tier-b-card__cmp-row">
                <span className="tier-b-card__cmp-label">{t('tierB.crime.comparison.national')}</span>
                <div className="tier-b-card__cmp-track">
                  <div
                    className="tier-b-card__cmp-fill tier-b-card__cmp-fill--reference"
                    style={{ width: `${Math.min(100, (nationalRate / maxComparisonRate) * 100)}%` }}
                  />
                </div>
                <span className="tier-b-card__cmp-value">{nationalRate.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}
        <dl className="tier-b-card__metrics">
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.total')}</dt>
            <dd>{total.value}<span className="tier-b-card__metric-suffix">{total.suffix}</span></dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.burglary')}</dt>
            <dd>{burglary.value}<span className="tier-b-card__metric-suffix">{burglary.suffix}</span></dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.violent')}</dt>
            <dd>{violent.value}<span className="tier-b-card__metric-suffix">{violent.suffix}</span></dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.monthly')}</dt>
            <dd>{monthly.value}<span className="tier-b-card__metric-suffix">{monthly.suffix}</span></dd>
          </div>
        </dl>
        {data.crime.message === 'CRIME_MUNICIPALITY_LEVEL' && (
          <p className="tier-b-card__note">{t('tierB.crime.municipalityNote')}</p>
        )}
        {!hasRates && data.crime.message !== 'CRIME_MUNICIPALITY_LEVEL' && (
          <p className="tier-b-card__note">{t('tierB.crime.rawNote')}</p>
        )}
        <p className="tier-b-card__source-line">
          {t('tierB.source.crime', { source: data.crime.source, date: crimeSourceDate })}
        </p>
        {data.crime.monthly_period && (
          <p className="tier-b-card__period">
            {t('tierB.crime.period', { period: formatCbsPeriod(data.crime.monthly_period, i18n.language) })}
          </p>
        )}
      </article>

      <p className="tier-b-card__disclaimer">
        {hasRates ? t('tierB.disclaimer') : t('tierB.disclaimerRaw')}
      </p>
    </section>
  );
}

export default memo(TierBSignalsCard);
