import { useTranslation } from 'react-i18next';
import type { RiskCardsResponse, RiskLevel } from '../types/api';
import './RiskCardsPanel.css';

interface Props {
  risks?: RiskCardsResponse;
  loading?: boolean;
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
  const date = sourceDate ?? sampledAt;

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
      {warning && <p className="risk-card__warning">{warning}</p>}
    </article>
  );
}

function metricOrUnavailable(value: string | null, t: (key: string) => string): string {
  return value ?? t('risk.metricUnavailable');
}

export default function RiskCardsPanel({ risks, loading }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="risk-cards">
        <h2 className="risk-cards__title">{t('risk.sectionTitle')}</h2>
        <p className="risk-cards__loading">{t('risk.loading')}</p>
      </section>
    );
  }

  if (!risks) return null;

  const noiseMetric = risks.noise.lden_db != null
    ? t('risk.noise.metric', { value: risks.noise.lden_db.toFixed(1) })
    : null;

  const pm25Text = risks.air_quality.pm25_ug_m3 != null
    ? `${risks.air_quality.pm25_ug_m3.toFixed(1)} µg/m³ (${t(`risk.level.${risks.air_quality.pm25_level}`)})`
    : t('risk.metricUnavailable');
  const no2Text = risks.air_quality.no2_ug_m3 != null
    ? `${risks.air_quality.no2_ug_m3.toFixed(1)} µg/m³ (${t(`risk.level.${risks.air_quality.no2_level}`)})`
    : t('risk.metricUnavailable');
  const airMetric = `${t('risk.air.pm25')}: ${pm25Text} • ${t('risk.air.no2')}: ${no2Text}`;

  const heatText = risks.climate_stress.heat_value != null
    ? `${risks.climate_stress.heat_value.toFixed(2)} (${t(`risk.level.${risks.climate_stress.heat_level}`)})`
    : t(`risk.level.${risks.climate_stress.heat_level}`);
  const waterText = risks.climate_stress.water_value != null
    ? `${risks.climate_stress.water_value.toFixed(2)} (${t(`risk.level.${risks.climate_stress.water_level}`)})`
    : t(`risk.level.${risks.climate_stress.water_level}`);
  const climateMetric = `${t('risk.climate.heat')}: ${heatText} • ${t('risk.climate.water')}: ${waterText}`;

  return (
    <section className="risk-cards">
      <h2 className="risk-cards__title">{t('risk.sectionTitle')}</h2>
      <div className="risk-cards__grid">
        <RiskCard
          id="noise"
          level={risks.noise.level}
          metric={metricOrUnavailable(noiseMetric, t)}
          questionKey="risk.noise.question"
          source={risks.noise.source}
          sourceDate={risks.noise.source_date}
          sampledAt={risks.noise.sampled_at}
          warning={risks.noise.message}
        />
        <RiskCard
          id="air"
          level={risks.air_quality.level}
          metric={airMetric}
          questionKey="risk.air.question"
          source={risks.air_quality.source}
          sourceDate={risks.air_quality.source_date}
          sampledAt={risks.air_quality.sampled_at}
          warning={risks.air_quality.message}
        />
        <RiskCard
          id="climate"
          level={risks.climate_stress.level}
          metric={climateMetric}
          questionKey="risk.climate.question"
          source={risks.climate_stress.source}
          sourceDate={risks.climate_stress.source_date}
          sampledAt={risks.climate_stress.sampled_at}
          warning={risks.climate_stress.message}
        />
      </div>
      <p className="risk-cards__disclaimer">{t('risk.disclaimer')}</p>
    </section>
  );
}
