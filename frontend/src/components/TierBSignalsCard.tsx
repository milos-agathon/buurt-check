import { useTranslation } from 'react-i18next';
import type { TierBResponse } from '../types/api';
import './TierBSignalsCard.css';

interface Props {
  data?: TierBResponse;
  loading?: boolean;
  error?: boolean;
}

function formatPer1000(value: number | undefined, unavailableLabel: string): string {
  if (value == null) return unavailableLabel;
  return value.toFixed(1);
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

export default function TierBSignalsCard({ data, loading, error }: Props) {
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
      <section className="tier-b-card" data-testid="tier-b-card">
        <p className="tier-b-card__error">{t('tierB.error')}</p>
      </section>
    );
  }

  if (!data) return null;

  const unavailable = t('tierB.unavailable');
  const crimeSourceDate = data.crime.source_date ?? data.crime.yearly_period ?? t('risk.dateUnknown');

  return (
    <section className="tier-b-card" data-testid="tier-b-card">
      <article className="tier-b-card__panel">
        <h3 className="tier-b-card__panel-title">{t('tierB.crime.title')}</h3>
        <dl className="tier-b-card__metrics">
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.total')}</dt>
            <dd>{formatPer1000(data.crime.total_per_1000, unavailable)}</dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.burglary')}</dt>
            <dd>{formatPer1000(data.crime.burglary_per_1000, unavailable)}</dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.violent')}</dt>
            <dd>{formatPer1000(data.crime.violent_per_1000, unavailable)}</dd>
          </div>
          <div className="tier-b-card__metric-row">
            <dt>{t('tierB.crime.monthly')}</dt>
            <dd>{formatPer1000(data.crime.monthly_total_per_1000, unavailable)}</dd>
          </div>
        </dl>
        <p className="tier-b-card__source-line">
          {t('tierB.source.crime', { source: data.crime.source, date: crimeSourceDate })}
        </p>
        {data.crime.monthly_period && (
          <p className="tier-b-card__period">
            {t('tierB.crime.period', { period: formatCbsPeriod(data.crime.monthly_period, i18n.language) })}
          </p>
        )}
      </article>

      <p className="tier-b-card__disclaimer">{t('tierB.disclaimer')}</p>
    </section>
  );
}
