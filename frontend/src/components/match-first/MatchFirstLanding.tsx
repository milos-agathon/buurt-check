import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HeroMapBackground from './HeroMapBackground';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';
import './MatchFirstLanding.css';

interface MatchFirstLandingProps {
  onStartMatch: () => void;
  onSearchAddress: () => void;
  onLanguageChange?: (language: 'en' | 'nl') => void;
  sessionErrorKey?: string | null;
}

export default function MatchFirstLanding({
  onStartMatch,
  onSearchAddress,
  onLanguageChange,
  sessionErrorKey,
}: MatchFirstLandingProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('nl') ? 'nl' : 'en';

  useEffect(() => {
    recordMatchFirstEvent('match_landing_cta_shown', { locale, source: 'landing' });
  }, [locale]);

  const handleStartMatch = () => {
    recordMatchFirstEvent('match_landing_cta_clicked', { locale, source: 'landing' });
    onStartMatch();
  };

  const handleSearchAddress = () => {
    recordMatchFirstEvent('match_first_search_link_clicked', { locale, source: 'landing' });
    onSearchAddress();
  };

  const handleLanguageChange = async (language: 'en' | 'nl') => {
    await i18n.changeLanguage(language);
    onLanguageChange?.(language);
  };

  return (
    <section className="match-first-landing" aria-labelledby="match-first-landing-title">
      <HeroMapBackground />

      <div className="match-first-landing__language" role="group" aria-label={t('matchFirst.landing.language')}>
        <button
          type="button"
          aria-label={t('language.dutch')}
          aria-pressed={locale === 'nl'}
          className={`match-first-landing__lang-btn${locale === 'nl' ? ' match-first-landing__lang-btn--active' : ''}`}
          onClick={() => void handleLanguageChange('nl')}
        >
          {t('language.nlShort')}
        </button>
        <button
          type="button"
          aria-label={t('language.english')}
          aria-pressed={locale === 'en'}
          className={`match-first-landing__lang-btn${locale === 'en' ? ' match-first-landing__lang-btn--active' : ''}`}
          onClick={() => void handleLanguageChange('en')}
        >
          {t('language.enShort')}
        </button>
      </div>

      <div className="match-first-landing__content">
        <p className="match-first-landing__eyebrow">{t('matchFirst.landing.eyebrow')}</p>
        <h1 id="match-first-landing-title">{t('matchFirst.landing.title')}</h1>
        <p className="match-first-landing__body">{t('matchFirst.landing.body')}</p>
        {sessionErrorKey && (
          <p className="match-first-landing__validation" role="alert">
            {t(sessionErrorKey)}
          </p>
        )}

        <div className="match-first-landing__actions">
          <button type="button" className="match-first-landing__cta" onClick={handleStartMatch}>
            {t('matchFirst.landing.cta')}
          </button>
          <a className="match-first-landing__address-link" href="#/search" onClick={handleSearchAddress}>
            {t('matchFirst.landing.addressLink')}
          </a>
        </div>
      </div>
    </section>
  );
}
