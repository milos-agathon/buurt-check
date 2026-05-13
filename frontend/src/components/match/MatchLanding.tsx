import { useTranslation } from 'react-i18next';
import { recordMatchEvent } from '../../services/matchAnalytics';
import './MatchLanding.css';

interface MatchLandingProps {
  onStartQuiz: () => void;
  onCompareKnown: () => void;
  onLanguageChange?: (language: 'en' | 'nl') => void;
}

export default function MatchLanding({
  onStartQuiz,
  onCompareKnown,
  onLanguageChange,
}: MatchLandingProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('nl') ? 'nl' : 'en';

  const handleStartQuiz = () => {
    recordMatchEvent('match_quiz_started', { locale, source: 'match_landing' });
    onStartQuiz();
  };

  const handleLanguageChange = async (language: 'en' | 'nl') => {
    await i18n.changeLanguage(language);
    onLanguageChange?.(language);
  };

  return (
    <section className="match-landing" aria-labelledby="match-landing-title">
      <div className="match-landing__language">
        <label htmlFor="match-language">{t('match.landing.language')}</label>
        <select
          id="match-language"
          value={locale}
          onChange={(event) => void handleLanguageChange(event.target.value as 'en' | 'nl')}
        >
          <option value="en">{t('language.english')}</option>
          <option value="nl">{t('language.dutch')}</option>
        </select>
      </div>

      <div className="match-landing__content">
        <p className="match-landing__eyebrow">{t('match.landing.eyebrow')}</p>
        <h1 id="match-landing-title">{t('match.landing.title')}</h1>
        <p className="match-landing__body">{t('match.landing.body')}</p>
        <div className="match-landing__actions" aria-label={t('match.landing.actionsLabel')}>
          <button type="button" className="match-landing__primary" onClick={handleStartQuiz}>
            {t('match.landing.findCta')}
          </button>
          <button type="button" className="match-landing__secondary" onClick={onCompareKnown}>
            {t('match.landing.compareCta')}
          </button>
        </div>
      </div>
    </section>
  );
}
