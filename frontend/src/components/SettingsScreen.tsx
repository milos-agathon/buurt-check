import { useTranslation } from 'react-i18next';
import type { ThemePreference } from '../services/theme';
import './SettingsScreen.css';

interface Props {
  onClearRecent: () => void;
  onClearShortlist: () => void;
  theme?: ThemePreference;
  onThemeChange?: (pref: ThemePreference) => void;
}

export default function SettingsScreen({ onClearRecent, onClearShortlist, theme = 'system', onThemeChange }: Props) {
  const { t, i18n } = useTranslation();

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
        <button className="settings-screen__action settings-screen__action--danger" onClick={onClearRecent}>
          {t('settings.clearRecent')}
        </button>
        <button className="settings-screen__action settings-screen__action--danger" onClick={onClearShortlist}>
          {t('settings.clearShortlist')}
        </button>
      </div>

      <div className="settings-screen__group">
        <div className="settings-screen__row">
          <span className="settings-screen__label">{t('settings.version')}</span>
          <span className="settings-screen__value">1.0.0</span>
        </div>
      </div>
    </div>
  );
}
