import { useTranslation } from 'react-i18next';
import type { RiskCardsResponse, RiskLevel } from '../types/api';
import './RiskCardsPanel.css';

interface Props {
  risks?: RiskCardsResponse;
  loading?: boolean;
  error?: boolean;
}

interface CardProps {
  id: 'noise' | 'air' | 'climate';
  level: RiskLevel;
  metric: string;
  questionKey: string;
  source: string;
  sourceDate?: string;
  sampledAt: string;
  warning?: string;
}

function RiskCard({
  id,
  level,
  metric,
  questionKey,
  source,
  sourceDate,
  sampledAt,
  warning,
}: CardProps) {
  const { t } = useTranslation();
  const date = sourceDate ?? t('risk.sourceDateFallback', { sampled: sampledAt });

  return (
    <article className="risk-card">
      <h2 className="risk-card__title">{t(`risk.${id}.title`)}</h2>
      <div className={`risk-card__badge risk-card__badge--${level}`}>
        {t(`risk.level.${level}`)}
      </div>
      <p className="risk-card__meaning">{t(`risk.${id}.meaning.${level}`)}</p>
      <p className="risk-card__metric">{metric}</p>
      <p className="risk-card__question">{t(questionKey)}</p>
      <p className="risk-card__source">{t('risk.sourceDate', { source, date })}</p>
      {warning && <p className="risk-card__warning">{t(`risk.warning.${warning}`, warning)}</p>}
    </article>
  );
}

function metricOrUnavailable(value: string | null, t: (key: string) => string): string {
  return value ?? t('risk.metricUnavailable');
}

export default function RiskCardsPanel({ risks, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="risk-cards">
        <h2 className="risk-cards__title">{t('risk.sectionTitle')}</h2>
        <p className="risk-cards__loading">{t('risk.loading')}</p>
      </section>
    );
  }

  const fallbackRisks: RiskCardsResponse | null = error && !risks
    ? {
      address_id: 'unknown',
      noise: {
        level: 'unavailable',
        source: t('risk.sourceUnknown'),
        source_date: t('risk.dateUnknown'),
        sampled_at: t('risk.dateUnknown'),
      },
      air_quality: {
        level: 'unavailable',
        pm25_level: 'unavailable',
        no2_level: 'unavailable',
        source: t('risk.sourceUnknown'),
        source_date: t('risk.dateUnknown'),
        sampled_at: t('risk.dateUnknown'),
      },
      climate_stress: {
        level: 'unavailable',
        heat_level: 'unavailable',
        water_level: 'unavailable',
        source: t('risk.sourceUnknown'),
        source_date: t('risk.dateUnknown'),
        sampled_at: t('risk.dateUnknown'),
      },
    }
    : null;

  const riskData = risks ?? fallbackRisks;

  if (!riskData) return null;

  const noiseMetric = riskData.noise.lden_db != null
    ? t('risk.noise.metric', { value: riskData.noise.lden_db.toFixed(1) })
    : null;

  const pm25Text = riskData.air_quality.pm25_ug_m3 != null
    ? `${riskData.air_quality.pm25_ug_m3.toFixed(1)} µg/m³ (${t(`risk.level.${riskData.air_quality.pm25_level}`)})`
    : t('risk.metricUnavailable');
  const no2Text = riskData.air_quality.no2_ug_m3 != null
    ? `${riskData.air_quality.no2_ug_m3.toFixed(1)} µg/m³ (${t(`risk.level.${riskData.air_quality.no2_level}`)})`
    : t('risk.metricUnavailable');
  const airMetric = `${t('risk.air.pm25')}: ${pm25Text} • ${t('risk.air.no2')}: ${no2Text}`;

  const heatText = riskData.climate_stress.heat_value != null
    ? `${riskData.climate_stress.heat_value.toFixed(2)} (${t(`risk.level.${riskData.climate_stress.heat_level}`)})`
    : t(`risk.level.${riskData.climate_stress.heat_level}`);
  const waterText = riskData.climate_stress.water_value != null
    ? `${riskData.climate_stress.water_value.toFixed(2)} (${t(`risk.level.${riskData.climate_stress.water_level}`)})`
    : t(`risk.level.${riskData.climate_stress.water_level}`);
  const climateMetric = `${t('risk.climate.heat')}: ${heatText} • ${t('risk.climate.water')}: ${waterText}`;

  return (
    <section className="risk-cards">
      <h2 className="risk-cards__title">{t('risk.sectionTitle')}</h2>
      {error && <p className="risk-cards__error">{t('risk.fetchError')}</p>}
      <div className="risk-cards__grid">
        <RiskCard
          id="noise"
          level={riskData.noise.level}
          metric={metricOrUnavailable(noiseMetric, t)}
          questionKey="risk.noise.question"
          source={riskData.noise.source}
          sourceDate={riskData.noise.source_date}
          sampledAt={riskData.noise.sampled_at}
          warning={riskData.noise.message}
        />
        <RiskCard
          id="air"
          level={riskData.air_quality.level}
          metric={airMetric}
          questionKey="risk.air.question"
          source={riskData.air_quality.source}
          sourceDate={riskData.air_quality.source_date}
          sampledAt={riskData.air_quality.sampled_at}
          warning={riskData.air_quality.message}
        />
        <RiskCard
          id="climate"
          level={riskData.climate_stress.level}
          metric={climateMetric}
          questionKey="risk.climate.question"
          source={riskData.climate_stress.source}
          sourceDate={riskData.climate_stress.source_date}
          sampledAt={riskData.climate_stress.sampled_at}
          warning={riskData.climate_stress.message}
        />
      </div>
      <p className="risk-cards__disclaimer">{t('risk.disclaimer')}</p>
    </section>
  );
}
