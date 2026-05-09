import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './TopBar.css';

interface TopBarProps {
  title: string;
  onSettingsClick?: () => void;
  inert?: boolean;
  activeScreen?: string;
}

const LOGO_TITLE = 'buurt-check';
const SETTINGS_GEAR_ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

export default function TopBar({ title, onSettingsClick, inert, activeScreen }: TopBarProps) {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const isLogo = title === LOGO_TITLE;

  useEffect(() => {
    let dossierScrollRoot: HTMLElement | null = null;

    const handleScroll = () => {
      const windowTop = window.scrollY || document.documentElement.scrollTop || 0;
      const internalTop = dossierScrollRoot?.scrollTop ?? 0;
      setScrolled(windowTop > 10 || internalTop > 10);
    };

    if (activeScreen === 'dossier') {
      const candidate = document.getElementById('dossier-content');
      if (candidate instanceof HTMLElement) {
        dossierScrollRoot = candidate;
        dossierScrollRoot.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      dossierScrollRoot?.removeEventListener('scroll', handleScroll);
    };
  }, [activeScreen]);

  return (
    <header className={`top-bar${scrolled ? ' top-bar--scrolled' : ''}`} inert={inert || undefined}>
      {isLogo ? (
        <a className="top-bar__logo" href="/" aria-label={t('aria.home')}>
          <img
            src="/logos/buurt-check-lockup-horizontal.svg"
            alt="Buurt Check"
            className="top-bar__logo-img top-bar__logo-img--light"
          />
          <img
            src="/logos/buurt-check-lockup-horizontal-reverse.svg"
            alt=""
            aria-hidden="true"
            className="top-bar__logo-img top-bar__logo-img--dark"
          />
        </a>
      ) : (
        <h1 className="top-bar__title">{title}</h1>
      )}
      <div className="top-bar__actions">
        <div className="top-bar__lang-toggle" role="radiogroup" aria-label={t('aria.language')}>
          <button
            type="button"
            role="radio"
            aria-checked={i18n.language === 'nl'}
            className={`top-bar__lang-btn${i18n.language === 'nl' ? ' top-bar__lang-btn--active' : ''}`}
            onClick={() => i18n.changeLanguage('nl')}
          >
            NL
          </button>
          <span className="top-bar__lang-separator" aria-hidden="true">/</span>
          <button
            type="button"
            role="radio"
            aria-checked={i18n.language === 'en'}
            className={`top-bar__lang-btn${i18n.language === 'en' ? ' top-bar__lang-btn--active' : ''}`}
            onClick={() => i18n.changeLanguage('en')}
          >
            EN
          </button>
        </div>
        {onSettingsClick && (
          <button type="button" className="top-bar__settings" onClick={onSettingsClick} aria-label={t('aria.settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g fill="currentColor">
                {SETTINGS_GEAR_ROTATIONS.map((rotation) => (
                  <rect
                    key={rotation}
                    x="10.55"
                    y="1.85"
                    width="2.9"
                    height="5.05"
                    rx="1.25"
                    transform={`rotate(${rotation} 12 12)`}
                  />
                ))}
              </g>
              <circle cx="12" cy="12" r="6.35" fill="none" stroke="currentColor" strokeWidth="2.65" />
              <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
