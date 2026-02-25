import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import './SoilInfoCard.css';

interface SoilInfoCardProps {
  leadPipeFlagged?: boolean;
  constructionYear?: number;
}

function SoilInfoCard({ leadPipeFlagged, constructionYear }: SoilInfoCardProps) {
  const { t } = useTranslation();

  return (
    <section className="soil-info-card" data-testid="soil-info-card">
      <h2 className="soil-info-card__title">{t('soil.title')}</h2>

      {/* Bodemloket — static info + link */}
      <article className="soil-info-card__item soil-info-card__item--info">
        <p className="soil-info-card__item-text">{t('soil.description')}</p>
        <a
          className="soil-info-card__link"
          href="https://www.bodemloket.nl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('soil.link_label')} &#x2197;
        </a>
      </article>

      {/* Viewing questions — collapsible per v7 spec */}
      <details className="soil-info-card__questions" data-testid="soil-questions">
        <summary className="soil-info-card__questions-summary">
          {t('soil.viewing_questions_label', 'Viewing questions')}
        </summary>
        <ul className="soil-info-card__question-list">
          <li>{t('soil.question_1')}</li>
          <li>{t('soil.question_2')}</li>
          <li>{t('soil.question_3')}</li>
        </ul>
      </details>

      {/* Lead pipe sub-section — shown ONLY when flagged */}
      {leadPipeFlagged && (
        <article className="soil-info-card__item soil-info-card__item--caution" data-testid="lead-pipe-warning">
          <h4 className="soil-info-card__item-title">{t('soil.lead_pipe_title')}</h4>
          <p className="soil-info-card__item-text">
            {t('soil.lead_pipe_note', { constructionYear: constructionYear ?? '?' })}
          </p>
          <p className="soil-info-card__item-text">{t('soil.lead_pipe_viewing_question')}</p>
          <p className="soil-info-card__source">{t('soil.lead_pipe_source')}</p>
        </article>
      )}

      <p className="soil-info-card__disclaimer">{t('soil.disclaimer')}</p>
      <p className="soil-info-card__source">{t('soil.source')}</p>
    </section>
  );
}

export default memo(SoilInfoCard);
