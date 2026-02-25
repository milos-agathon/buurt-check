import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PropertyWarningsResponse, SeverityLevel } from '../types/api';
import SeverityBadge from './ui/SeverityBadge';
import SectionSkeleton from './ui/SectionSkeleton';
import './PropertyWarningsCard.css';

interface Props {
  data?: PropertyWarningsResponse;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const ERFPACHT_NOTE_MUNICIPALITY_ONLY = 'ERFPACHT_NOTE_MUNICIPALITY_ONLY';

function mapFoundationLevel(level: PropertyWarningsResponse['foundation_risk']['level']): SeverityLevel {
  if (level === 'high') return 'poor';
  if (level === 'medium') return 'moderate';
  if (level === 'low') return 'good';
  return 'unavailable';
}

function severityClass(level: PropertyWarningsResponse['foundation_risk']['level']): string {
  return mapFoundationLevel(level);
}

function PropertyWarningsCard({ data, loading, error, onRetry }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section className="property-warnings" data-testid="property-warnings">
        <SectionSkeleton variant="property-warnings" />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="property-warnings" data-testid="property-warnings" data-state="error">
        <p className="property-warnings__error">{error || t('warnings.error')}</p>
        {onRetry && (
          <button
            type="button"
            className="app__retry-button property-warnings__retry"
            onClick={onRetry}
          >
            {t('error.retry', 'Retry')}
          </button>
        )}
      </section>
    );
  }

  if (!data) return null;

  const { foundation_risk, erfpacht, vve, asbestos } = data;
  const hasFoundation = foundation_risk.level !== 'low' || foundation_risk.soil_type;
  const hasErfpacht = erfpacht.detected;
  const hasVve = vve.is_apartment;
  const hasAsbestos = asbestos.flagged;
  const erfpachtBadge =
    erfpacht.confidence === 'confirmed'
      ? t('warnings.erfpacht.badge.confirmed')
      : t('warnings.erfpacht.badge.likely');
  const showMunicipalityOnlyNote = erfpacht.messages.includes(
    ERFPACHT_NOTE_MUNICIPALITY_ONLY,
  );

  return (
    <section className="property-warnings" data-testid="property-warnings">
      {/* Foundation risk — always shown when data available */}
      {hasFoundation && (
        <article className={`property-warnings__card property-warnings__card--${severityClass(foundation_risk.level)}`}>
          <h4 className="property-warnings__card-title">{t('warnings.foundation.title')}</h4>
          <SeverityBadge severity={mapFoundationLevel(foundation_risk.level)} size="sm" />
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
            {erfpachtBadge}
          </span>
          <p className="property-warnings__description">
            {t('warnings.erfpacht.likely', { municipality: erfpacht.municipality ?? '' })}
          </p>
          {showMunicipalityOnlyNote && (
            <p className="property-warnings__note">
              <strong>{t('warnings.erfpacht.note_label')}:</strong>{' '}
              {t('warnings.erfpacht.municipality_only_note')}
            </p>
          )}
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

export default memo(PropertyWarningsCard);
