import { useTranslation } from 'react-i18next';
import './AnalyticsConsentBanner.css';

interface AnalyticsConsentBannerProps {
  onAccept: () => void;
  onReject: () => void;
}

export default function AnalyticsConsentBanner({
  onAccept,
  onReject,
}: AnalyticsConsentBannerProps) {
  const { t } = useTranslation();

  return (
    <section
      className="analytics-consent-banner"
      data-testid="analytics-consent-banner"
      aria-label={t('analytics.title')}
    >
      <div className="analytics-consent-banner__content">
        <h2 className="analytics-consent-banner__title">{t('analytics.title')}</h2>
        <p className="analytics-consent-banner__body">{t('analytics.body')}</p>
        <p className="analytics-consent-banner__note">{t('analytics.note')}</p>
      </div>

      <div className="analytics-consent-banner__actions">
        <button
          type="button"
          className="analytics-consent-banner__button analytics-consent-banner__button--ghost"
          onClick={onReject}
        >
          {t('analytics.essentialOnly')}
        </button>
        <button
          type="button"
          className="analytics-consent-banner__button analytics-consent-banner__button--primary"
          onClick={onAccept}
        >
          {t('analytics.allow')}
        </button>
      </div>
    </section>
  );
}
