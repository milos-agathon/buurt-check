import { useTranslation } from 'react-i18next';
import type { PropertyWarningsResponse } from '../types/api';
import './PropertyWarningsCard.css';

interface Props {
  data?: PropertyWarningsResponse;
  loading?: boolean;
  error?: boolean;
}

function severityClass(level: string): string {
  if (level === 'high') return 'poor';
  if (level === 'medium') return 'moderate';
  if (level === 'low') return 'good';
  return 'unavailable';
}

export default function PropertyWarningsCard({ data, loading, error }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="property-warnings" data-testid="property-warnings">
        <p className="property-warnings__loading">{t('warnings.loading')}</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="property-warnings" data-testid="property-warnings">
        <p className="property-warnings__error">{t('warnings.error')}</p>
      </section>
    );
  }

  if (!data) return null;

  const { foundation_risk, erfpacht, vve, asbestos } = data;
  const hasFoundation = foundation_risk.level !== 'low' || foundation_risk.soil_type;
  const hasErfpacht = erfpacht.detected;
  const hasVve = vve.is_apartment;
  const hasAsbestos = asbestos.flagged;

  return (
    <section className="property-warnings" data-testid="property-warnings">
      {/* Foundation risk — always shown when data available */}
      {hasFoundation && (
        <article className={`property-warnings__card property-warnings__card--${severityClass(foundation_risk.level)}`}>
          <h4 className="property-warnings__card-title">{t('warnings.foundation.title')}</h4>
          <span className={`property-warnings__badge property-warnings__badge--${severityClass(foundation_risk.level)}`}>
            {foundation_risk.level}
          </span>
          <p className="property-warnings__description">
            {t(`warnings.foundation.${foundation_risk.level}`, {
              year: foundation_risk.construction_year ?? '?',
              soil: foundation_risk.soil_type ?? '?',
              rate: foundation_risk.subsidence_rate_mm_per_year ?? '?',
            })}
          </p>
          <details className="property-warnings__questions">
            <summary>{t('warnings.foundation.title')} — {t('warnings.foundation.question_1').split('.')[0]}...</summary>
            <ul>
              <li>{t('warnings.foundation.question_1')}</li>
              <li>{t('warnings.foundation.question_2')}</li>
              <li>{t('warnings.foundation.question_3')}</li>
              <li>{t('warnings.foundation.question_4')}</li>
            </ul>
          </details>
          <p className="property-warnings__source">{t('warnings.foundation.source')}</p>
          <p className="property-warnings__disclaimer">{t('warnings.foundation.disclaimer')}</p>
        </article>
      )}

      {/* Erfpacht — only shown when detected */}
      {hasErfpacht && (
        <article className="property-warnings__card property-warnings__card--info">
          <h4 className="property-warnings__card-title">{t('warnings.erfpacht.title')}</h4>
          <span className="property-warnings__badge property-warnings__badge--info">
            {erfpacht.confidence === 'confirmed' ? 'confirmed' : 'likely'}
          </span>
          <p className="property-warnings__description">
            {t('warnings.erfpacht.likely', { municipality: erfpacht.municipality ?? '' })}
          </p>
          <details className="property-warnings__questions">
            <summary>{t('warnings.erfpacht.title')} — {t('warnings.erfpacht.question_1').split('?')[0]}?</summary>
            <ul>
              <li>{t('warnings.erfpacht.question_1')}</li>
              <li>{t('warnings.erfpacht.question_2')}</li>
              <li>{t('warnings.erfpacht.question_3')}</li>
              <li>{t('warnings.erfpacht.question_4')}</li>
              <li>{t('warnings.erfpacht.question_5')}</li>
            </ul>
          </details>
          <p className="property-warnings__source">{t('warnings.erfpacht.source')}</p>
          <p className="property-warnings__disclaimer">{t('warnings.erfpacht.disclaimer')}</p>
        </article>
      )}

      {/* VvE — only shown for apartments */}
      {hasVve && (
        <article className="property-warnings__card property-warnings__card--info">
          <h4 className="property-warnings__card-title">{t('warnings.vve.title')}</h4>
          <p className="property-warnings__description">
            {t('warnings.vve.description', { units: vve.num_units ?? '?' })}
          </p>
          <details className="property-warnings__questions">
            <summary>{t('warnings.vve.title')} — {t('warnings.vve.question_1').split('?')[0]}?</summary>
            <ul>
              <li>{t('warnings.vve.question_1')}</li>
              <li>{t('warnings.vve.question_2')}</li>
              <li>{t('warnings.vve.question_3')}</li>
              <li>{t('warnings.vve.question_4')}</li>
              <li>{t('warnings.vve.question_5')}</li>
              <li>{t('warnings.vve.question_6')}</li>
            </ul>
          </details>
          <p className="property-warnings__source">{t('warnings.vve.source')}</p>
        </article>
      )}

      {/* Asbestos — only shown for pre-1994 buildings */}
      {hasAsbestos && (
        <article className="property-warnings__card property-warnings__card--caution">
          <h4 className="property-warnings__card-title">{t('warnings.asbestos.title')}</h4>
          <p className="property-warnings__description">
            {t('warnings.asbestos.description', { year: asbestos.construction_year ?? '?' })}
          </p>
          <details className="property-warnings__questions">
            <summary>{t('warnings.asbestos.title')} — {t('warnings.asbestos.question_1').split('?')[0]}?</summary>
            <ul>
              <li>{t('warnings.asbestos.question_1')}</li>
              <li>{t('warnings.asbestos.question_2')}</li>
              <li>{t('warnings.asbestos.question_3')}</li>
              <li>{t('warnings.asbestos.question_4')}</li>
            </ul>
          </details>
          <p className="property-warnings__source">{t('warnings.asbestos.source')}</p>
          <p className="property-warnings__disclaimer">{t('warnings.asbestos.disclaimer')}</p>
        </article>
      )}
    </section>
  );
}
