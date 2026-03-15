import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeverityLevel, TierBResponse } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import { formatCoverageDate, parseSourceDateValue } from '../utils/dataCoverage';
import './TierBSignalsCard.css';

interface Props {
  data?: TierBResponse;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatLocaleNumber(value: number, language: string, maximumFractionDigits = 1): string {
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(1, maximumFractionDigits),
  }).format(value);
}

function formatCrimeValue(
  per1000: number | undefined,
  rawCount: number | undefined,
  unavailableLabel: string,
  per1000Suffix: string,
  rawSuffix: string,
  language: string,
): { value: string; suffix: string } {
  if (per1000 != null) {
    return { value: formatLocaleNumber(per1000, language), suffix: per1000Suffix };
  }
  if (rawCount != null) {
    return { value: formatLocaleNumber(Math.round(rawCount), language, 0), suffix: rawSuffix };
  }
  return { value: unavailableLabel, suffix: '' };
}

function formatCrimeSourceDate(
  sourceDate: string | undefined,
  yearlyPeriod: string | undefined,
  monthlyPeriod: string | undefined,
  language: string,
  fallback: string,
): string {
  const parsed = parseSourceDateValue(sourceDate ?? yearlyPeriod ?? monthlyPeriod);
  return parsed ? formatCoverageDate(parsed, language) : fallback;
}

function comparisonWidth(values: Array<number | undefined>): (value: number | undefined) => string {
  const valid = values.filter((entry): entry is number => entry != null && Number.isFinite(entry));
  const domainMax = valid.length > 0 ? Math.max(100, ...valid) : 100;
  return (value) => {
    if (value == null || !Number.isFinite(value)) return '0%';
    const ratio = Math.max(0, value) / domainMax;
    return `${Math.min(100, ratio * 100)}%`;
  };
}

function fallbackCopy(message: string | undefined, t: ReturnType<typeof useTranslation>['t']) {
  switch (message) {
    case 'CRIME_MUNICIPALITY_LEVEL':
      return {
        note: t('tierB.crime.message.CRIME_MUNICIPALITY_LEVEL'),
        disclaimer: t('tierB.disclaimer'),
      };
    case 'CRIME_NO_POPULATION':
      return {
        note: t('tierB.crime.message.CRIME_NO_POPULATION'),
        disclaimer: t('tierB.disclaimerRaw'),
      };
    case 'CRIME_NO_DATA':
      return {
        note: t('tierB.crime.message.CRIME_NO_DATA'),
        disclaimer: t('tierB.disclaimerUnavailable'),
      };
    case 'CRIME_NO_BUURT_CODE':
      return {
        note: t('tierB.crime.message.CRIME_NO_BUURT_CODE'),
        disclaimer: t('tierB.disclaimerUnavailable'),
      };
    case 'CRIME_PERIOD_LOOKUP_FAILED':
      return {
        note: t('tierB.crime.message.CRIME_PERIOD_LOOKUP_FAILED'),
        disclaimer: t('tierB.disclaimerUnavailable'),
      };
    case 'CRIME_LOOKUP_FAILED':
      return {
        note: t('tierB.crime.message.CRIME_LOOKUP_FAILED'),
        disclaimer: t('tierB.disclaimerUnavailable'),
      };
    default:
      return {
        note: null,
        disclaimer: t('tierB.disclaimerUnavailable'),
      };
  }
}

function TierBSignalsCard({ data, loading, error, onRetry }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

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

  const unavailable = t('tierB.unavailable');
  const crimeSourceDate = formatCrimeSourceDate(
    data.crime.source_date,
    data.crime.yearly_period,
    data.crime.monthly_period,
    language,
    t('risk.dateUnknown'),
  );
  const per1000Suffix = t('tierB.crime.per_1000_suffix');
  const rawSuffix = ` ${t('tierB.crime.rawSuffix')}`;
  const hasRates = data.crime.total_per_1000 != null;
  const nationalRate = data.crime.national_per_1000;
  const widthFor = comparisonWidth([data.crime.total_per_1000, nationalRate]);

  const total = formatCrimeValue(
    data.crime.total_per_1000,
    data.crime.total_count,
    unavailable,
    per1000Suffix,
    rawSuffix,
    language,
  );
  const burglary = formatCrimeValue(
    data.crime.burglary_per_1000,
    data.crime.burglary_count,
    unavailable,
    per1000Suffix,
    rawSuffix,
    language,
  );
  const violent = formatCrimeValue(
    data.crime.violent_per_1000,
    data.crime.violent_count,
    unavailable,
    per1000Suffix,
    rawSuffix,
    language,
  );
  const monthly = formatCrimeValue(
    data.crime.monthly_total_per_1000,
    data.crime.monthly_total_count,
    unavailable,
    per1000Suffix,
    rawSuffix,
    language,
  );
  const meaning = i18n.language === 'nl' ? data.crime.meaning_nl : data.crime.meaning_en;
  const fallback = fallbackCopy(data.crime.message, t);

  return (
    <section className="tier-b-card" data-testid="tier-b-card">
      <article className="tier-b-card__panel">
        <h3 className="tier-b-card__panel-title">{t('tierB.crime.title')}</h3>
        {data.crime.severity && (
          <div className="tier-b-card__severity-row">
            <SeverityBadge severity={data.crime.severity as SeverityLevel} />
            {data.crime.score != null && (
              <span className="tier-b-card__crime-score">
                {data.crime.score}
                <span className="tier-b-card__crime-score-scale">{t('tierB.crime.score_scale')}</span>
              </span>
            )}
          </div>
        )}
        {meaning ? <p className="tier-b-card__meaning">{meaning}</p> : null}
        {hasRates && (
          <div className="tier-b-card__comparison">
            <span className="tier-b-card__cmp-title">{t('tierB.crime.comparison.title')}</span>
            <div className="tier-b-card__cmp-row">
              <span className="tier-b-card__cmp-label">{t('tierB.crime.comparison.thisArea')}</span>
              <div className="tier-b-card__cmp-track">
                <div
                  className="tier-b-card__cmp-fill"
                  style={{ width: widthFor(data.crime.total_per_1000) }}
                />
              </div>
              <span className="tier-b-card__cmp-value">
                {formatLocaleNumber(data.crime.total_per_1000!, language)}
              </span>
            </div>
            {nationalRate != null && (
              <div className="tier-b-card__cmp-row">
                <span className="tier-b-card__cmp-label">{t('tierB.crime.comparison.national')}</span>
                <div className="tier-b-card__cmp-track">
                  <div
                    className="tier-b-card__cmp-fill tier-b-card__cmp-fill--reference"
                    style={{ width: widthFor(nationalRate) }}
                  />
                </div>
                <span className="tier-b-card__cmp-value">{formatLocaleNumber(nationalRate, language)}</span>
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
        {fallback.note && (
          <p className="tier-b-card__note">{fallback.note}</p>
        )}
        <p className="tier-b-card__source-line">
          {t('tierB.source.crime', { source: data.crime.source, date: crimeSourceDate })}
        </p>
        {data.crime.monthly_period && (
          <p className="tier-b-card__period">
            {t('tierB.crime.period', {
              period: formatCrimeSourceDate(undefined, undefined, data.crime.monthly_period, language, unavailable),
            })}
          </p>
        )}
      </article>

      <p className="tier-b-card__disclaimer">
        {hasRates ? t('tierB.disclaimer') : fallback.disclaimer}
      </p>
    </section>
  );
}

export default memo(TierBSignalsCard);
