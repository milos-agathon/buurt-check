import { useTranslation } from 'react-i18next';
import type { PrebidVerificationAction } from '../../types/api';
import './VerificationActionCard.css';

interface VerificationActionCardProps {
  action: PrebidVerificationAction;
  rank?: number;
  onOpen?: (action: PrebidVerificationAction) => void;
}

function confidenceLabel(value: PrebidVerificationAction['confidence']) {
  return `prebid.confidence.${value}`;
}

function confidenceFallback(value: PrebidVerificationAction['confidence']) {
  switch (value) {
    case 'high': return 'High confidence';
    case 'medium': return 'Medium confidence';
    case 'low': return 'Low confidence';
    case 'needs_review': return 'Needs review';
    case 'data_incomplete': return 'Data incomplete';
    default: return value;
  }
}

export default function VerificationActionCard({ action, rank, onOpen }: VerificationActionCardProps) {
  const { t, i18n } = useTranslation();
  const isNl = i18n.resolvedLanguage?.startsWith('nl') ?? i18n.language.startsWith('nl');
  const finding = isNl && action.finding_nl ? action.finding_nl : action.finding;
  const why = isNl && action.why_it_matters_nl ? action.why_it_matters_nl : action.why_it_matters;
  const ask = isNl && action.ask_this.nl ? action.ask_this.nl : action.ask_this.en;
  const request = isNl && action.request_this_nl ? action.request_this_nl : action.request_this;
  const source = action.source_refs[0];
  const limitation = isNl && action.limitation_nl ? action.limitation_nl : action.limitation;

  return (
    <article className="verification-action" data-testid={`verification-action-${action.id}`}>
      <div className="verification-action__header">
        <span className="verification-action__rank">
          {rank != null ? t('prebid.action.rank', 'Check {{count}}', { count: rank }) : t('prebid.action.check', 'Check')}
        </span>
        <span className="verification-action__confidence">
          {t(confidenceLabel(action.confidence), confidenceFallback(action.confidence))}
        </span>
      </div>
      <h3>{finding}</h3>
      <p className="verification-action__why">{why}</p>
      <dl className="verification-action__facts">
        <div className="verification-action__fact verification-action__fact--primary">
          <dt>{t('prebid.action.ask', 'Ask')}</dt>
          <dd>{ask}</dd>
        </div>
        <div className="verification-action__fact sr-only">
          <dt>{t('prebid.action.request', 'Request')}</dt>
          <dd>{request}</dd>
        </div>
        <div className="verification-action__fact sr-only">
          <dt>{t('prebid.action.who', 'Recipient')}</dt>
          <dd>{action.who_to_ask.join(', ')}</dd>
        </div>
        <div className="verification-action__fact verification-action__fact--source">
          <dt>{t('prebid.action.source', 'Source')}</dt>
          <dd>{[source.name, source.source_date ?? source.checked_at].filter(Boolean).join(' · ')}</dd>
        </div>
      </dl>
      <p className="verification-action__limitation sr-only">{limitation}</p>
      {onOpen && (
        <button type="button" className="verification-action__open" onClick={() => onOpen(action)}>
          {t('prebid.action.openDetail', 'Open evidence detail')}
        </button>
      )}
    </article>
  );
}
