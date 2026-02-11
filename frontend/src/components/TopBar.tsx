import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './TopBar.css';

interface TopBarProps {
  title: string;
  onSettingsClick?: () => void;
}

const LOGO_TITLE = 'buurt-check';

export default function TopBar({ title, onSettingsClick }: TopBarProps) {
  const { i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const isLogo = title === LOGO_TITLE;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`top-bar${scrolled ? ' top-bar--scrolled' : ''}`}>
      {isLogo ? (
        <a className="top-bar__logo" href="/" aria-label="Buurt-Check home">
          <img
            src="/logos/buurt-check-lockup-horizontal-reverse.svg"
            alt="Buurt-Check"
            className="top-bar__logo-img"
          />
        </a>
      ) : (
        <h1 className="top-bar__title">{title}</h1>
      )}
      <div className="top-bar__actions">
        <div className="top-bar__lang-toggle" role="radiogroup" aria-label="Language">
          <button
            type="button"
            role="radio"
            aria-checked={i18n.language === 'en'}
            className={`top-bar__lang-btn${i18n.language === 'en' ? ' top-bar__lang-btn--active' : ''}`}
            onClick={() => i18n.changeLanguage('en')}
          >
            EN
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={i18n.language === 'nl'}
            className={`top-bar__lang-btn${i18n.language === 'nl' ? ' top-bar__lang-btn--active' : ''}`}
            onClick={() => i18n.changeLanguage('nl')}
          >
            NL
          </button>
        </div>
        {onSettingsClick && (
          <button type="button" className="top-bar__settings" onClick={onSettingsClick} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
