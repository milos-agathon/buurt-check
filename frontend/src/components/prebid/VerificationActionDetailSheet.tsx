import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrebidVerificationAction } from '../../types/api';
import './VerificationActionDetailSheet.css';

interface VerificationActionDetailSheetProps {
  action: PrebidVerificationAction;
  onClose: () => void;
}

function stateLabels(action: PrebidVerificationAction): string[] {
  const states = action.states ?? {};
  const labels: string[] = [];
  if (states.needs_human_review) labels.push('Needs human review');
  if (states.queued_for_review) labels.push('Queued for review');
  if (states.data_incomplete) labels.push('Data incomplete');
  if (states.source_incomplete) labels.push('Source incomplete');
  return labels;
}

export default function VerificationActionDetailSheet({
  action,
  onClose,
}: VerificationActionDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const isNl = i18n.resolvedLanguage?.startsWith('nl') ?? i18n.language.startsWith('nl');
  const finding = isNl && action.finding_nl ? action.finding_nl : action.finding;
  const why = isNl && action.why_it_matters_nl ? action.why_it_matters_nl : action.why_it_matters;
  const ask = isNl && action.ask_this.nl ? action.ask_this.nl : action.ask_this.en;
  const request = isNl && action.request_this_nl ? action.request_this_nl : action.request_this;
  const limitation = isNl && action.limitation_nl ? action.limitation_nl : action.limitation;
  const visibleStateLabels = stateLabels(action);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section
      className="verification-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-detail-title"
      data-testid="verification-action-detail"
    >
      <div className="verification-detail__panel">
        <div className="verification-detail__header">
          <div>
            <p className="verification-detail__eyebrow">{t('prebid.detail.eyebrow', 'Evidence detail')}</p>
            <h2 id="verification-detail-title">{finding}</h2>
          </div>
          <button ref={closeRef} type="button" className="verification-detail__close" onClick={onClose}>
            {t('common.close', 'Close')}
          </button>
        </div>

        <section className="verification-detail__section">
          <h3>{t('prebid.detail.why', 'Why it matters')}</h3>
          <p>{why}</p>
        </section>
        <section className="verification-detail__section">
          <h3>{t('prebid.action.ask', 'Ask this')}</h3>
          <p>{ask}</p>
        </section>
        <section className="verification-detail__section">
          <h3>{t('prebid.action.request', 'Request or check')}</h3>
          <p>{request}</p>
        </section>
        <section className="verification-detail__section">
          <h3>{t('prebid.action.who', 'Who to ask')}</h3>
          <p>{action.who_to_ask.join(', ')}</p>
        </section>

        <section className="verification-detail__section">
          <h3>{t('prebid.detail.evidence', 'Evidence')}</h3>
          <ul className="verification-detail__sources">
            {action.source_refs.map((source) => (
              <li key={source.id ?? source.name}>
                <strong>{source.name}</strong>
                <span>{[source.source_date ?? source.checked_at, source.method, source.version, source.coverage_status].filter(Boolean).join(' · ')}</span>
                <p>{isNl && source.limitation_nl ? source.limitation_nl : source.limitation}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="verification-detail__section">
          <h3>{t('prebid.detail.confidence', 'Confidence')}</h3>
          <p>{t(`prebid.confidence.${action.confidence}`, action.confidence.replace(/_/g, ' '))}</p>
        </section>

        <section className="verification-detail__section">
          <h3>{t('prebid.detail.limitation', 'Limitation')}</h3>
          <p>{limitation}</p>
        </section>

        {visibleStateLabels.length > 0 && (
          <section className="verification-detail__section verification-detail__section--review">
            <h3>{t('prebid.detail.reviewState', 'Review state')}</h3>
            <ul>
              {visibleStateLabels.map((label) => <li key={label}>{label}</li>)}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
