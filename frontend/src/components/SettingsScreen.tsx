import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from '../services/theme';
import ConfirmSheet from './ui/ConfirmSheet';
import './SettingsScreen.css';

const GITHUB_ISSUES_URL = 'https://github.com/milosblag/buurt-check/issues';
const PRIVACY_POLICY_URL = '/privacy.html';
const TERMS_URL = '/terms.html';

const DATA_SOURCE_KEYS = [
  'bag',
  'threebag',
  'rivm',
  'climate',
  'cbs',
  'livability',
  'energy',
  'suncalc',
  'pdok',
] as const;

const appVersion = import.meta.env.VITE_APP_VERSION || __APP_VERSION__ || '0.0.0';

interface Props {
  onClearRecent: () => void;
  onClearShortlist: () => void;
  theme?: ThemePreference;
  onThemeChange?: (pref: ThemePreference) => void;
}

export default function SettingsScreen({ onClearRecent, onClearShortlist, theme = 'system', onThemeChange }: Props) {
  const { t, i18n } = useTranslation();
  const [confirmTarget, setConfirmTarget] = useState<'recent' | 'shortlist' | null>(null);

  const handleConfirmClear = () => {
    if (confirmTarget === 'recent') {
      onClearRecent();
    } else if (confirmTarget === 'shortlist') {
      onClearShortlist();
    }
    setConfirmTarget(null);
  };

  return (
    <div className="settings-screen" data-testid="settings-screen">
      <div className="settings-screen__group">
        <div className="settings-screen__row settings-screen__row--toggle">
          <span className="settings-screen__label">{t('settings.language')}</span>
          <div
            className="settings-screen__lang-toggle"
            role="radiogroup"
            aria-label={t('settings.language')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={i18n.language === 'en'}
              className={`settings-screen__lang-btn ${i18n.language === 'en' ? 'settings-screen__lang-btn--active' : ''}`}
              onClick={() => i18n.changeLanguage('en')}
            >
              EN
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={i18n.language === 'nl'}
              className={`settings-screen__lang-btn ${i18n.language === 'nl' ? 'settings-screen__lang-btn--active' : ''}`}
              onClick={() => i18n.changeLanguage('nl')}
            >
              NL
            </button>
          </div>
        </div>
        {onThemeChange && (
          <div className="settings-screen__row settings-screen__row--toggle">
            <span className="settings-screen__label">{t('settings.appearance', 'Appearance')}</span>
            <div
              className="settings-screen__theme-toggle"
              data-testid="theme-toggle"
              role="radiogroup"
              aria-label={t('settings.appearance', 'Appearance')}
            >
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'system'}
                className={`settings-screen__theme-btn${theme === 'system' ? ' settings-screen__theme-btn--active' : ''}`}
                onClick={() => onThemeChange('system')}
              >
                {t('settings.theme.system', 'System')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                className={`settings-screen__theme-btn${theme === 'light' ? ' settings-screen__theme-btn--active' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                {t('settings.theme.light', 'Light')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                className={`settings-screen__theme-btn${theme === 'dark' ? ' settings-screen__theme-btn--active' : ''}`}
                onClick={() => onThemeChange('dark')}
              >
                {t('settings.theme.dark', 'Dark')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-screen__group">
        <button
          className="settings-screen__action settings-screen__action--danger"
          onClick={() => setConfirmTarget('recent')}
        >
          {t('settings.clearRecent')}
        </button>
        <button
          className="settings-screen__action settings-screen__action--danger"
          onClick={() => setConfirmTarget('shortlist')}
        >
          {t('settings.clearShortlist')}
        </button>
      </div>

      <div className="settings-screen__group settings-screen__group--info">
        <h3 className="settings-screen__section-title">{t('settings.about.title')}</h3>
        <p className="settings-screen__description">{t('settings.about.description')}</p>
      </div>

      <div className="settings-screen__group settings-screen__group--info">
        <h3 className="settings-screen__section-title">{t('settings.data_sources.title')}</h3>
        <ul className="settings-screen__source-list">
          {DATA_SOURCE_KEYS.map((key) => (
            <li key={key} className="settings-screen__source-item">
              {t(`settings.data_sources.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="settings-screen__group settings-screen__group--info">
        <h3 className="settings-screen__section-title">{t('settings.scoring.title')}</h3>
        <p className="settings-screen__description">{t('settings.scoring.description')}</p>
      </div>

      <div className="settings-screen__group settings-screen__group--info">
        <h3 className="settings-screen__section-title">{t('settings.legal.title')}</h3>
        <p className="settings-screen__description">{t('settings.legal.description')}</p>
        <div className="settings-screen__link-list">
          <a href={PRIVACY_POLICY_URL} className="settings-screen__link">
            {t('settings.legal.privacy')}
          </a>
          <a href={TERMS_URL} className="settings-screen__link">
            {t('settings.legal.terms')}
          </a>
        </div>
      </div>

      <div className="settings-screen__group settings-screen__group--info">
        <h3 className="settings-screen__section-title">{t('settings.feedback.title')}</h3>
        <a
          href={GITHUB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="settings-screen__link"
        >
          {t('settings.feedback.link')}
        </a>
      </div>

      <div className="settings-screen__group">
        <div className="settings-screen__row">
          <span className="settings-screen__label">{t('settings.version')}</span>
          <span className="settings-screen__value">{appVersion}</span>
        </div>
      </div>

      <ConfirmSheet
        isOpen={confirmTarget != null}
        onClose={() => setConfirmTarget(null)}
        title={t('settings.clearConfirmTitle', 'Confirm clear')}
        message={confirmTarget === 'shortlist'
          ? t('settings.clearShortlistConfirmMessage', 'This removes all saved properties from this device.')
          : t('settings.clearRecentConfirmMessage', 'This removes your recent address history from this device.')}
        confirmLabel={t('settings.clearConfirmAction', 'Clear now')}
        cancelLabel={t('settings.clearConfirmCancel', 'Cancel')}
        onConfirm={handleConfirmClear}
      />
    </div>
  );
}
