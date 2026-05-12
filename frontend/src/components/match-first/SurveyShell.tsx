import { useTranslation } from 'react-i18next';
import './SurveyShell.css';

export default function SurveyShell() {
  const { t } = useTranslation();

  return (
    <section className="match-survey-shell" aria-labelledby="match-survey-shell-title">
      <div className="match-survey-shell__progress">
        <div
          className="match-survey-shell__bar"
          role="progressbar"
          aria-label={t('matchFirst.survey.progressLabel')}
          aria-valuemin={1}
          aria-valuemax={1}
          aria-valuenow={1}
        >
          <span />
        </div>
        <p>{t('matchFirst.survey.progressLabel')}</p>
      </div>

      <div className="match-survey-shell__question">
        <p className="match-survey-shell__eyebrow">{t('matchFirst.survey.placeholderEyebrow')}</p>
        <h1 id="match-survey-shell-title">{t('matchFirst.survey.placeholderQuestion')}</h1>
        <button type="button" className="match-survey-shell__choice">
          {t('matchFirst.survey.placeholderAnswer')}
        </button>
      </div>
    </section>
  );
}
