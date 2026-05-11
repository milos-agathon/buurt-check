import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './NotFoundScreen.css';

interface NotFoundScreenProps {
  route?: string;
  onSearch: () => void;
  onSaved: () => void;
}

export default function NotFoundScreen({ route, onSearch, onSaved }: NotFoundScreenProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <section className="not-found" data-testid="not-found-screen" aria-labelledby="not-found-title">
      <div className="not-found__panel">
        <p className="not-found__eyebrow">{t('notFound.eyebrow', 'Recovery')}</p>
        <h1 id="not-found-title">{t('notFound.title', 'We could not find that page')}</h1>
        <p>
          {t(
            'notFound.body',
            'The route is not available or the shared link cannot be recovered from this browser state.',
          )}
        </p>
        {route && <code aria-label={t('notFound.routeLabel', 'Requested route')}>{route}</code>}
        <div className="not-found__actions">
          <button ref={searchRef} type="button" onClick={onSearch}>
            {t('notFound.searchCta', 'Search an address')}
          </button>
          <button type="button" onClick={onSaved}>
            {t('notFound.savedCta', 'Open saved homes')}
          </button>
          <a href="/privacy.html">{t('settings.privacy', 'Privacy')}</a>
          <a href="/terms.html">{t('settings.terms', 'Terms')}</a>
          <a href="mailto:support@buurt-check.nl">{t('notFound.supportCta', 'Contact support')}</a>
        </div>
      </div>
    </section>
  );
}
