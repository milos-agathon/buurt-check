import { useTranslation } from 'react-i18next';
import type { TierBResponse } from '../types/api';
import './TierBSignalsCard.css';

interface Props {
  data?: TierBResponse;
  loading?: boolean;
  error?: boolean;
}

function energyBand(label: string | undefined): 'good' | 'moderate' | 'poor' | 'unavailable' {
  if (!label) return 'unavailable';
  const code = label.trim().toUpperCase().charAt(0);
  if (code === 'A' || code === 'B') return 'good';
  if (code === 'C' || code === 'D') return 'moderate';
  if (code === 'E' || code === 'F' || code === 'G') return 'poor';
  return 'unavailable';
}

function renderMessage(
  t: ReturnType<typeof useTranslation>['t'],
  message: string | undefined,
  baseKey: string,
  fallbackKey: string,
): string {
  if (!message) return t(fallbackKey);
  const translated = t(`${baseKey}.${message}`);
  return translated === `${baseKey}.${message}` ? t(fallbackKey) : translated;
}

function formatPer1000(value: number | undefined, unavailableLabel: string): string {
  if (value == null) return unavailableLabel;
  return value.toFixed(1);
}

export default function TierBSignalsCard({ data, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="tier-b-card" data-testid="tier-b-card">
        <h2 className="tier-b-card__title">{t('tierB.title')}</h2>
        <p className="tier-b-card__loading">{t('tierB.loading')}</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="tier-b-card" data-testid="tier-b-card">
        <h2 className="tier-b-card__title">{t('tierB.title')}</h2>
        <p className="tier-b-card__error">{t('tierB.error')}</p>
      </section>
    );
  }

  if (!data) return null;

  const unavailable = t('tierB.unavailable');
  const energySourceDate = data.energy_label.source_date ?? t('risk.dateUnknown');
  const crimeSourceDate = data.crime.source_date ?? data.crime.yearly_period ?? t('risk.dateUnknown');
  const energyText = data.energy_label.label
    ? data.energy_label.label
    : renderMessage(
        t,
        data.energy_label.message,
        'tierB.energy.message',
        'tierB.energy.message.default',
      );
  const energyClass = energyBand(data.energy_label.label);

  return (
    <section className="tier-b-card" data-testid="tier-b-card">
      <h2 className="tier-b-card__title">{t('tierB.title')}</h2>

      <div className="tier-b-card__grid">
        <article className="tier-b-card__panel">
          <h3 className="tier-b-card__panel-title">{t('tierB.energy.title')}</h3>
          <p
            className={`tier-b-card__energy tier-b-card__energy--${energyClass}`}
            data-testid="tier-b-energy-value"
          >
            {energyText}
          </p>
          <p className="tier-b-card__hint">{t('tierB.energy.meaning')}</p>
          <p className="tier-b-card__source-line">
            {t('tierB.source.energy', { source: data.energy_label.source, date: energySourceDate })}
          </p>
        </article>

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
              {t('tierB.crime.period', { period: data.crime.monthly_period })}
            </p>
          )}
        </article>
      </div>

      <p className="tier-b-card__disclaimer">{t('tierB.disclaimer')}</p>
    </section>
  );
}
