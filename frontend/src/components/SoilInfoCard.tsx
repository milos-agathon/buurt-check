import { useTranslation } from 'react-i18next';
import type { PropertyWarningsResponse } from '../types/api';
import './SoilInfoCard.css';

interface Props {
  warnings?: PropertyWarningsResponse;
}

export default function SoilInfoCard({ warnings }: Props) {
  const { t } = useTranslation();

  const hasLeadPipe = warnings?.lead_pipe?.flagged ?? false;
  const leadYear = warnings?.lead_pipe?.construction_year;

  return (
    <section className="soil-info-card" data-testid="soil-info-card">
      <h2 className="soil-info-card__title">{t('soil.title')}</h2>

      {/* Bodemloket — static info + link */}
      <article className="soil-info-card__item soil-info-card__item--info">
        <h4 className="soil-info-card__item-title">{t('soil.contamination.title')}</h4>
        <p className="soil-info-card__item-text">{t('soil.contamination.description')}</p>
        <a
          className="soil-info-card__link"
          href="https://www.bodemloket.nl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('soil.contamination.link')} &#x2197;
        </a>
      </article>

      {/* Lead pipe proxy */}
      {hasLeadPipe && (
        <article className="soil-info-card__item soil-info-card__item--caution" data-testid="lead-pipe-warning">
          <h4 className="soil-info-card__item-title">{t('soil.leadPipe.title')}</h4>
          <p className="soil-info-card__item-text">
            {t('soil.leadPipe.description', { year: leadYear ?? '?' })}
          </p>
          <p className="soil-info-card__item-text">{t('soil.leadPipe.action')}</p>
        </article>
      )}

      <p className="soil-info-card__source">{t('soil.source')}</p>
    </section>
  );
}
