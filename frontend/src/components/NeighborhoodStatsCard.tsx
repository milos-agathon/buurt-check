import { useTranslation } from 'react-i18next';
import type { NeighborhoodStatsResponse, NeighborhoodIndicator, AgeProfile } from '../types/api';
import './NeighborhoodStatsCard.css';

interface Props {
  stats?: NeighborhoodStatsResponse;
  loading?: boolean;
  error?: boolean;
}

function Indicator({
  label,
  indicator,
  formatValue,
}: {
  label: string;
  indicator: NeighborhoodIndicator;
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
    : indicator.unit
      ? `${indicator.value} ${indicator.unit}`
      : String(indicator.value);
  return (
    <div className="neighborhood-card__indicator">
      <span className="neighborhood-card__indicator-label">{label}</span>
      <span className="neighborhood-card__indicator-value">{display}</span>
    </div>
  );
}

function AgeBars({ profile }: { profile: AgeProfile }) {
  const { t } = useTranslation();
  const bands: { key: string; label: string; value: number | undefined }[] = [
    { key: '0_24', label: t('neighborhood.age.0_24'), value: profile.age_0_24 },
    { key: '25_64', label: t('neighborhood.age.25_64'), value: profile.age_25_64 },
    { key: '65_plus', label: t('neighborhood.age.65_plus'), value: profile.age_65_plus },
  ];
  const maxPct = Math.max(...bands.map((b) => b.value ?? 0), 1);

  return (
    <div className="neighborhood-card__age-bars" data-testid="age-bars">
      {bands.map((band) => (
        <div key={band.key} className="neighborhood-card__age-row">
          <span className="neighborhood-card__age-label">{band.label}</span>
          <div className="neighborhood-card__age-bar-track">
            <div
              className="neighborhood-card__age-bar-fill"
              style={{ width: `${((band.value ?? 0) / maxPct) * 100}%` }}
            />
          </div>
          <span className="neighborhood-card__age-pct">
            {band.value != null ? `${band.value}%` : '–'}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatEuro(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `€${num.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`;
}

export default function NeighborhoodStatsCard({ stats, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="neighborhood-card">
        <h2 className="neighborhood-card__title">{t('neighborhood.title')}</h2>
        <p className="neighborhood-card__loading">{t('neighborhood.loading')}</p>
      </section>
    );
  }

  if (error && !stats) {
    return (
      <section className="neighborhood-card">
        <h2 className="neighborhood-card__title">{t('neighborhood.title')}</h2>
        <p className="neighborhood-card__error">{t('neighborhood.error')}</p>
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
          <Indicator label={t('neighborhood.populationDensity')} indicator={s.population_density} />
          <Indicator label={t('neighborhood.avgHouseholdSize')} indicator={s.avg_household_size} />
          <Indicator label={t('neighborhood.singlePersonPct')} indicator={s.single_person_pct} />
        </div>
        <AgeBars profile={s.age_profile} />
      </div>

      <div className="neighborhood-card__group">
        <h3 className="neighborhood-card__group-title">{t('neighborhood.group.housing')}</h3>
        <div className="neighborhood-card__indicators">
          <Indicator label={t('neighborhood.ownerOccupiedPct')} indicator={s.owner_occupied_pct} />
          <Indicator
            label={t('neighborhood.avgPropertyValue')}
            indicator={s.avg_property_value}
            formatValue={formatEuro}
          />
        </div>
      </div>

      <div className="neighborhood-card__group">
        <h3 className="neighborhood-card__group-title">{t('neighborhood.group.access')}</h3>
        <div className="neighborhood-card__indicators">
          <Indicator
            label={t('neighborhood.distanceToTrain')}
            indicator={s.distance_to_train_km}
          />
          <Indicator
            label={t('neighborhood.distanceToSupermarket')}
            indicator={s.distance_to_supermarket_km}
          />
        </div>
      </div>

      <p className="neighborhood-card__question">{t('neighborhood.viewingTip')}</p>

      <p className="neighborhood-card__source">
        {t('neighborhood.source', { source: stats.source, year: stats.source_year })}
      </p>
    </section>
  );
}
