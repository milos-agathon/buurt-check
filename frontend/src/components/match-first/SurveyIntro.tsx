import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import './MatchFirstLanding.css';
import './SurveyIntro.css';

interface SurveyIntroProps {
  sessionId?: string | null;
  sessionErrorKey?: string | null;
  onStartSurvey: () => void;
}

function normalizeLocale(language: string | undefined): 'en' | 'nl' {
  return language?.startsWith('nl') ? 'nl' : 'en';
}

export default function SurveyIntro({ sessionId, sessionErrorKey, onStartSurvey }: SurveyIntroProps) {
  const { t, i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    recordMatchFirstEvent('match_first_survey_intro_shown', {
      locale,
      source: 'survey_intro',
      session_id: sessionId ?? 'default',
    });
  }, [locale, sessionId]);

  const startSurvey = () => {
    recordMatchFirstEvent('match_first_survey_started', {
      locale,
      source: 'survey_intro',
      session_id: sessionId ?? 'default',
    });
    onStartSurvey();
  };

  return (
    <section
      className="match-first-landing match-first-landing--simple match-first-survey-intro"
      aria-labelledby="match-survey-intro-title"
    >
      <div className="match-first-landing__content">
        <p className="match-first-landing__eyebrow">{t('matchFirst.intro.eyebrow')}</p>
        <h1 id="match-survey-intro-title">{t('matchFirst.intro.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.intro.body')}</p>
        {sessionErrorKey && (
          <p className="match-first-landing__validation" role="alert">
            {t(sessionErrorKey)}
          </p>
        )}
        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__cta" onClick={startSurvey}>
            {t('matchFirst.intro.cta')}
          </button>
        </div>
      </div>
    </section>
  );
}
