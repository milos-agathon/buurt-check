import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrebidPackResponse, PrebidVerificationAction } from '../../types/api';
import VerificationActionCard from './VerificationActionCard';
import SourceCoveragePanel from './SourceCoveragePanel';
import './PackView.css';

interface PackViewProps {
  pack: PrebidPackResponse;
  onBackToBriefing: () => void;
  onShare: () => void;
  onDownload?: () => void;
  onDelete: () => void;
  onOpenAction?: (action: PrebidVerificationAction) => void;
}

function statusCopyKey(status: PrebidPackResponse['status']) {
  return `prebid.pack.status.${status}`;
}

function statusFallback(status: PrebidPackResponse['status']) {
  switch (status) {
    case 'ready': return 'Ready';
    case 'queued_for_review': return 'Queued for review';
    case 'pack_under_review': return 'Pack under review';
    case 'review_required': return 'Review required';
    case 'data_incomplete': return 'Data incomplete';
    case 'not_entitled': return 'Purchase required';
    case 'deleted': return 'Deleted';
    case 'expired': return 'Expired';
    case 'error': return 'Recoverable error';
    default: return status;
  }
}

export default function PackView({
  pack,
  onBackToBriefing,
  onShare,
  onDownload,
  onDelete,
  onOpenAction,
}: PackViewProps) {
  const { t, i18n } = useTranslation();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const isNl = i18n.resolvedLanguage?.startsWith('nl') ?? i18n.language.startsWith('nl');
  const disclaimer = isNl && pack.disclaimer_nl ? pack.disclaimer_nl : pack.disclaimer;
  const isReady = pack.status === 'ready';
  const isReviewState = pack.status === 'queued_for_review'
    || pack.status === 'pack_under_review'
    || pack.status === 'review_required'
    || pack.status === 'data_incomplete';
  const sourceCount = useMemo(() => pack.coverage.length, [pack.coverage]);

  return (
    <section className="pack-view" data-testid="pack-view" aria-labelledby="pack-view-title">
      <div className="pack-view__header">
        <button type="button" className="pack-view__back" onClick={onBackToBriefing}>
          {t('prebid.pack.back', 'Back to briefing')}
        </button>
        <div>
          <p className="pack-view__eyebrow">{t('prebid.pack.eyebrow', 'Buyer-bound pack')}</p>
          <h1 id="pack-view-title">{t('prebid.pack.title', 'Pre-Bid Evidence & Questions Pack')}</h1>
          <p>{pack.address_label}</p>
        </div>
        <span className="pack-view__status" data-status={pack.status}>
          {t(statusCopyKey(pack.status), statusFallback(pack.status))}
        </span>
      </div>

      <p className="pack-view__disclaimer">{disclaimer}</p>

      {isReviewState && (
        <div className="pack-view__notice" role="status">
          <strong>{t('prebid.pack.reviewTitle', 'Review pending')}</strong>
          <span>{t('prebid.pack.reviewBody', 'The pack is not presented as final while source coverage or human review is incomplete.')}</span>
        </div>
      )}

      <div className="pack-view__actions">
        <button type="button" onClick={onShare} disabled={!isReady && pack.status !== 'data_incomplete'}>
          {t('prebid.share.packCta', 'Share pack')}
        </button>
        <button type="button" onClick={onDownload} disabled={!isReady || !onDownload}>
          {t('prebid.pack.download', 'Download')}
        </button>
        <button type="button" className="pack-view__delete" onClick={onDelete}>
          {t('prebid.pack.delete', 'Delete or revoke')}
        </button>
      </div>

      <section className="pack-view__section">
        <h2>{t('prebid.pack.actionsTitle', 'Top verification items')}</h2>
        <div className="pack-view__action-list">
          {pack.actions.map((action, index) => (
            <VerificationActionCard
              key={action.id}
              action={action}
              rank={index + 1}
              onOpen={onOpenAction}
            />
          ))}
        </div>
      </section>

      <section className="pack-view__section">
        <h2>{t('prebid.pack.questionsTitle', 'Bilingual questions by recipient')}</h2>
        <div className="pack-view__question-groups">
          {pack.question_groups.map((group) => (
            <article key={group.recipient} className="pack-view__question-group">
              <h3>{group.recipient}</h3>
              <ul>
                {group.questions.map((question) => (
                  <li key={`${group.recipient}-${question.en}`}>
                    <strong>{question.en}</strong>
                    {question.nl && <span lang="nl">{question.nl}</span>}
                  </li>
                ))}
              </ul>
              <h4>{t('prebid.pack.requestsTitle', 'Document/source requests')}</h4>
              <ul>
                {group.requests.map((request) => <li key={request}>{request}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="pack-view__section">
        <button type="button" className="pack-view__coverage-toggle" onClick={() => setCoverageOpen((value) => !value)}>
          {coverageOpen
            ? t('prebid.pack.hideSources', 'Hide source appendix')
            : t('prebid.pack.showSources', 'Show source appendix ({{count}} sources)', { count: sourceCount })}
        </button>
        {coverageOpen && <SourceCoveragePanel rows={pack.coverage} />}
      </section>
    </section>
  );
}
