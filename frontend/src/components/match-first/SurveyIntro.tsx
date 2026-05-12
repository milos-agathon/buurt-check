import { useTranslation } from 'react-i18next';
import './MatchFirstLanding.css';

interface SurveyIntroProps {
  onStartSurvey: () => void;
  onBack: () => void;
}

export default function SurveyIntro({ onStartSurvey, onBack }: SurveyIntroProps) {
  const { t } = useTranslation();

  return (
    <section className="match-first-landing match-first-landing--simple" aria-labelledby="match-survey-intro-title">
      <div className="match-first-landing__content">
        <p className="match-first-landing__eyebrow">{t('matchFirst.intro.eyebrow')}</p>
        <h1 id="match-survey-intro-title">{t('matchFirst.intro.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.intro.body')}</p>
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__cta" onClick={onStartSurvey}>
            {t('matchFirst.intro.cta')}
          </button>
          <button type="button" className="match-first-landing__address-link" onClick={onBack}>
            {t('matchFirst.survey.back')}
          </button>
        </div>
      </div>
    </section>
  );
}
