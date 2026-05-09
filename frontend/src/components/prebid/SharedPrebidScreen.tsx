import { useTranslation } from 'react-i18next';
import type { SharedPrebidResponse } from '../../types/api';
import PackView from './PackView';
import './SharedPrebidScreen.css';

interface SharedPrebidScreenProps {
  response: SharedPrebidResponse;
  onSearch: () => void;
  onSaved: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

function stateTitle(state: SharedPrebidResponse['state'], mode: SharedPrebidResponse['mode']) {
  if (state === 'valid') {
    return mode === 'pack' ? 'Shared Questions Pack' : 'Shared link unavailable';
  }
  if (state === 'expired') return 'This shared link expired';
  if (state === 'revoked') return 'This shared link was revoked';
  if (state === 'deleted') return 'This shared content was deleted';
  if (state === 'forbidden') return 'This shared link is not available';
  return 'Shared link not found';
}

export default function SharedPrebidScreen({
  response,
  onSearch,
  onSaved,
  onOpenPrivacy,
  onOpenTerms,
}: SharedPrebidScreenProps) {
  const { t } = useTranslation();

  if (response.state === 'valid' && response.mode === 'pack' && response.pack) {
    return (
      <div className="shared-prebid" data-testid="shared-prebid-screen">
        <PackView
          pack={response.pack}
          onBackToBriefing={onSearch}
          onShare={() => undefined}
          onDelete={() => undefined}
        />
      </div>
    );
  }

  return (
    <section className="shared-prebid shared-prebid--recovery" data-testid="shared-prebid-screen" aria-labelledby="shared-prebid-title">
      <div className="shared-prebid__panel">
        <p className="shared-prebid__eyebrow">{t('prebid.shared.eyebrow', 'Shared-link recovery')}</p>
        <h1 id="shared-prebid-title">{t(`prebid.shared.state.${response.state}`, stateTitle(response.state, response.mode))}</h1>
        <p>
          {t(
            'prebid.shared.body',
            'We cannot show this shared briefing or pack from the link alone. Start a new search or use the legal/support links below.',
          )}
        </p>
        <div className="shared-prebid__actions">
          <button type="button" onClick={onSearch}>{t('notFound.searchCta', 'Search an address')}</button>
          <button type="button" onClick={onSaved}>{t('notFound.savedCta', 'Open saved homes')}</button>
          <button type="button" onClick={onOpenPrivacy}>{t('settings.privacy', 'Privacy')}</button>
          <button type="button" onClick={onOpenTerms}>{t('settings.terms', 'Terms')}</button>
          <a href={`mailto:${response.support_email ?? 'support@buurt-check.nl'}`}>
            {t('notFound.supportCta', 'Contact support')}
          </a>
        </div>
      </div>
    </section>
  );
}
