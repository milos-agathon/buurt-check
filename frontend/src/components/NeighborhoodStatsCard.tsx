import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import QuartileDots from './ui/QuartileDots';
import SectionSkeleton from './ui/SectionSkeleton';
import type { AgeProfile, NeighborhoodIndicator, NeighborhoodStatsResponse } from '../types/api';
import './NeighborhoodStatsCard.css';

interface Props {
  stats?: NeighborhoodStatsResponse;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function formatNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
): string {
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(value);
}

function formatIndicatorValue(
  value: number | string,
  unit: string | undefined,
  language: string,
  precision?: number | null,
): string {
  if (typeof value === 'string') {
    return unit ? `${value} ${unit}` : value;
  }

  const maximumFractionDigits = precision ?? (unit === 'km' || unit === '%' ? 1 : 0);
  const formatted = formatNumber(value, language, {
    maximumFractionDigits,
    minimumFractionDigits: precision ?? (Number.isInteger(value) ? 0 : Math.min(1, maximumFractionDigits)),
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatFieldList(fields: string[], language: string): string {
  if (fields.length === 0) return '';
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(fields);
}

function sourceFieldLabel(
  fieldName: string,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  const labels: Record<string, string> = {
    owner_occupied_pct: t('neighborhood.sourceField.ownerOccupiedPct'),
    avg_property_value: t('neighborhood.sourceField.avgPropertyValue'),
    distance_to_train_km: t('neighborhood.sourceField.distanceToTrain'),
    distance_to_supermarket_km: t('neighborhood.sourceField.distanceToSupermarket'),
  };
  return labels[fieldName] ?? null;
}

function buildNeighborhoodSourceText(
  response: NeighborhoodStatsResponse,
  language: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const base = t('neighborhood.source', { source: response.source, year: response.source_year });
  if (!response.mixed_source_years || !response.stats) {
    return base;
  }

  const newestYear = response.source_year;
  const fallbackFieldsByYear = new Map<number, string[]>();
  const sourceFields = [
    ['owner_occupied_pct', response.stats.owner_occupied_pct],
    ['avg_property_value', response.stats.avg_property_value],
    ['distance_to_train_km', response.stats.distance_to_train_km],
    ['distance_to_supermarket_km', response.stats.distance_to_supermarket_km],
  ] as const;

  for (const [fieldName, indicator] of sourceFields) {
    if (!indicator.available || indicator.value == null || indicator.source_year == null) continue;
    if (indicator.source_year === newestYear) continue;
    const label = sourceFieldLabel(fieldName, t);
    if (!label) continue;
    const labels = fallbackFieldsByYear.get(indicator.source_year) ?? [];
    labels.push(label);
    fallbackFieldsByYear.set(indicator.source_year, labels);
  }

  const notes = Array.from(fallbackFieldsByYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, fields]) => t('neighborhood.sourceBackfill', {
      year,
      fields: formatFieldList(fields, language),
    }));

  return notes.length > 0 ? `${base} · ${notes.join(' · ')}` : base;
}

function Indicator({
  label,
  indicator,
  language,
  formatValue,
}: {
  label: string;
  indicator: NeighborhoodIndicator;
  language: string;
  formatValue?: (value: number | string) => string;
}) {
  const { t } = useTranslation();
  if (!indicator.available || indicator.value == null) {
    return (
      <div className="neighborhood-card__indicator">
        <span className="neighborhood-card__indicator-label">{label}</span>
        <span className="neighborhood-card__indicator-value neighborhood-card__indicator-value--unavailable">
          {t('neighborhood.unavailable')}
        </span>
      </div>
    );
  }

  const display = formatValue
    ? formatValue(indicator.value)
    : formatIndicatorValue(indicator.value, indicator.unit, language, indicator.precision);

  return (
    <div className="neighborhood-card__indicator">
      <span className="neighborhood-card__indicator-label">{label}</span>
      <div className="neighborhood-card__indicator-right">
        <span className="neighborhood-card__indicator-value">{display}</span>
        {indicator.quartile != null && (
          <QuartileDots
            quartile={indicator.quartile}
            favorableQuartile={indicator.favorable_quartile}
            mode={indicator.favorable_quartile != null ? 'favorability' : 'distribution'}
          />
        )}
      </div>
    </div>
  );
}

function AgeBars({ profile, language }: { profile: AgeProfile; language: string }) {
  const { t } = useTranslation();
  const bands: { key: string; label: string; value: number | undefined }[] = [
    { key: '0_24', label: t('neighborhood.age.0_24'), value: profile.age_0_24 },
    { key: '25_64', label: t('neighborhood.age.25_64'), value: profile.age_25_64 },
    { key: '65_plus', label: t('neighborhood.age.65_plus'), value: profile.age_65_plus },
  ];

  return (
    <div className="neighborhood-card__age-bars" data-testid="age-bars">
      {bands.map((band) => (
        <div key={band.key} className="neighborhood-card__age-row">
          <span className="neighborhood-card__age-label">{band.label}</span>
          <div className="neighborhood-card__age-bar-track">
            {band.value != null ? (
              <div
                className="neighborhood-card__age-bar-fill"
                style={{ width: `${band.value}%` }}
              />
            ) : (
              <div className="neighborhood-card__age-bar-fill neighborhood-card__age-bar-fill--unavailable" />
            )}
          </div>
          <span className="neighborhood-card__age-pct">
            {band.value != null ? `${formatNumber(band.value, language, { maximumFractionDigits: 1 })}%` : '–'}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatEuro(value: number | string, language: string): string {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : value;
  const locale = language === 'nl' ? 'nl-NL' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function messageCopy(message: string | undefined, t: ReturnType<typeof useTranslation>['t']): string {
  if (!message) return t('neighborhood.unavailable');
  return t(`neighborhood.message.${message}`, {
    defaultValue: t('neighborhood.unavailable'),
  });
}

function NeighborhoodStatsCard({ stats, loading, error, onRetry }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  if (loading) {
    return (
      <section className="neighborhood-card" data-state="loading" aria-busy="true">
        <SectionSkeleton variant="neighborhood-stats" />
      </section>
    );
  }

  if (error && !stats) {
    return (
      <section className="neighborhood-card" data-state="error">
        <h2 className="neighborhood-card__title">{t('neighborhood.title')}</h2>
        <p className="neighborhood-card__error">{error || t('neighborhood.error')}</p>
        {onRetry && (
          <button
            type="button"
            className="app__retry-button neighborhood-card__retry"
            onClick={onRetry}
          >
            {t('error.retry', 'Retry')}
          </button>
        )}
      </section>
    );
  }

  if (stats && !stats.stats) {
    return (
      <section className="neighborhood-card" data-state="unavailable">
        <h2 className="neighborhood-card__title">{t('neighborhood.title')}</h2>
        <p className="neighborhood-card__unavailable">{messageCopy(stats.message, t)}</p>
        <p className="neighborhood-card__source">
          {buildNeighborhoodSourceText(stats, language, t)}
        </p>
      </section>
    );
  }

  if (!stats?.stats) return null;

  const s = stats.stats;

  return (
    <section className="neighborhood-card">
      <div className="neighborhood-card__header">
        <h2 className="neighborhood-card__title">{t('neighborhood.title')}</h2>
        {(s.buurt_name || s.gemeente_name) && (
          <p className="neighborhood-card__subtitle">
            {[s.buurt_name, s.gemeente_name].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {s.urbanization !== 'unknown' && (
        <div className="neighborhood-card__badge" data-testid="urbanization-badge">
          {t(`neighborhood.urbanization.${s.urbanization}`)}
        </div>
      )}

      <div className="neighborhood-card__group">
        <h3 className="neighborhood-card__group-title">{t('neighborhood.group.people')}</h3>
        <div className="neighborhood-card__indicators">
          <Indicator label={t('neighborhood.populationDensity')} indicator={s.population_density} language={language} />
          <Indicator label={t('neighborhood.avgHouseholdSize')} indicator={s.avg_household_size} language={language} />
          <Indicator label={t('neighborhood.singlePersonPct')} indicator={s.single_person_pct} language={language} />
        </div>
        <AgeBars profile={s.age_profile} language={language} />
      </div>

      <div className="neighborhood-card__group">
        <h3 className="neighborhood-card__group-title">{t('neighborhood.group.housing')}</h3>
        <div className="neighborhood-card__indicators">
          <Indicator label={t('neighborhood.ownerOccupiedPct')} indicator={s.owner_occupied_pct} language={language} />
          <Indicator
            label={t('neighborhood.avgPropertyValue')}
            indicator={s.avg_property_value}
            language={language}
            formatValue={(value) => formatEuro(value, language)}
          />
        </div>
      </div>

      <div className="neighborhood-card__group">
        <h3 className="neighborhood-card__group-title">{t('neighborhood.group.access')}</h3>
        <div className="neighborhood-card__indicators">
          <Indicator
            label={t('neighborhood.distanceToTrain')}
            indicator={s.distance_to_train_km}
            language={language}
          />
          <Indicator
            label={t('neighborhood.distanceToSupermarket')}
            indicator={s.distance_to_supermarket_km}
            language={language}
          />
        </div>
      </div>

      <p className="neighborhood-card__question">{t('neighborhood.viewingTip')}</p>

      <p className="neighborhood-card__source">
        {buildNeighborhoodSourceText(stats, language, t)}
      </p>
    </section>
  );
}

export default memo(NeighborhoodStatsCard);
