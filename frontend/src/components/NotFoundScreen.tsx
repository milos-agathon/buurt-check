import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './NotFoundScreen.css';

interface NotFoundScreenProps {
  route?: string;
  onSearch: () => void;
  onSaved: () => void;
  matchRecovery?: boolean;
  onMatchRecovery?: () => void;
}

export default function NotFoundScreen({
  route,
  onSearch,
  onSaved,
  matchRecovery = false,
  onMatchRecovery,
}: NotFoundScreenProps) {
  const { t } = useTranslation();
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryActionRef.current?.focus();
  }, []);

  return (
    <section className="not-found" data-testid="not-found-screen" aria-labelledby="not-found-title">
      <div className="not-found__panel">
        <p className="not-found__eyebrow">{t('notFound.eyebrow')}</p>
        <h1 id="not-found-title">{t('notFound.title')}</h1>
        <p>{t('notFound.body')}</p>
        {route && <code aria-label={t('notFound.routeLabel')}>{route}</code>}
        <div className="not-found__actions">
          {matchRecovery && onMatchRecovery ? (
            <button ref={primaryActionRef} type="button" onClick={onMatchRecovery}>
              {t('notFound.matchCta')}
            </button>
          ) : (
            <button ref={primaryActionRef} type="button" onClick={onSearch}>
              {t('notFound.searchCta')}
            </button>
          )}
          {matchRecovery && (
            <button type="button" onClick={onSearch}>
              {t('notFound.searchCta')}
            </button>
          )}
          <button type="button" onClick={onSaved}>
            {t('notFound.savedCta')}
          </button>
          <a href="/privacy.html">{t('settings.legal.privacy')}</a>
          <a href="/terms.html">{t('settings.legal.terms')}</a>
          <a href="mailto:support@buurt-check.nl">{t('notFound.supportCta')}</a>
        </div>
      </div>
    </section>
  );
}
