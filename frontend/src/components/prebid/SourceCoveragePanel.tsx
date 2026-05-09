import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrebidCoverageRow, PrebidCoverageStatus } from '../../types/api';
import './SourceCoveragePanel.css';

interface SourceCoveragePanelProps {
  rows: PrebidCoverageRow[];
  open?: boolean;
  onClose?: () => void;
}

const STATUS_KEYS: Record<PrebidCoverageStatus, string> = {
  checked: 'prebid.coverage.status.checked',
  failed: 'prebid.coverage.status.failed',
  unavailable: 'prebid.coverage.status.unavailable',
  not_supported: 'prebid.coverage.status.notSupported',
  manual_review: 'prebid.coverage.status.review',
  skipped: 'prebid.coverage.status.skipped',
  review: 'prebid.coverage.status.review',
};

const STATUS_FALLBACKS: Record<PrebidCoverageStatus, string> = {
  checked: 'Checked',
  failed: 'Failed',
  unavailable: 'Unavailable',
  not_supported: 'Not supported',
  manual_review: 'Needs review',
  skipped: 'Skipped',
  review: 'Needs review',
};

function countRows(rows: PrebidCoverageRow[]) {
  return rows.reduce<Record<PrebidCoverageStatus, number>>((counts, row) => {
    counts[row.status] += 1;
    return counts;
  }, {
    checked: 0,
    failed: 0,
    unavailable: 0,
    not_supported: 0,
    manual_review: 0,
    skipped: 0,
    review: 0,
  });
}

export default function SourceCoveragePanel({ rows, open = true, onClose }: SourceCoveragePanelProps) {
  const { t, i18n } = useTranslation();
  const counts = useMemo(() => countRows(rows), [rows]);
  const isNl = i18n.resolvedLanguage?.startsWith('nl') ?? i18n.language.startsWith('nl');

  if (!open) return null;

  return (
    <section
      className="source-coverage"
      role={onClose ? 'dialog' : 'region'}
      aria-modal={onClose ? 'true' : undefined}
      aria-labelledby="source-coverage-title"
      data-testid="source-coverage-panel"
    >
      <div className="source-coverage__header">
        <div>
          <p className="source-coverage__eyebrow">{t('prebid.coverage.eyebrow', 'Source coverage')}</p>
          <h2 id="source-coverage-title">{t('prebid.coverage.title', 'What was checked')}</h2>
        </div>
        {onClose && (
          <button type="button" className="source-coverage__close" onClick={onClose}>
            {t('common.close', 'Close')}
          </button>
        )}
      </div>

      <dl className="source-coverage__summary" aria-label={t('prebid.coverage.summary', 'Coverage summary')}>
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="source-coverage__summary-item" data-status={status}>
            <dt>{t(STATUS_KEYS[status as PrebidCoverageStatus], STATUS_FALLBACKS[status as PrebidCoverageStatus])}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>

      <div className="source-coverage__rows">
        {rows.map((row) => (
          <article key={row.id} className="source-coverage__row" data-status={row.status}>
            <div className="source-coverage__row-heading">
              <h3>{row.label}</h3>
              <span>{t(STATUS_KEYS[row.status], STATUS_FALLBACKS[row.status])}</span>
            </div>
            <dl className="source-coverage__meta">
              <div>
                <dt>{t('prebid.coverage.authority', 'Authority')}</dt>
                <dd>{row.authority}</dd>
              </div>
              {(row.source_date || row.checked_at) && (
                <div>
                  <dt>{t('prebid.coverage.date', 'Date')}</dt>
                  <dd>{row.source_date ?? row.checked_at}</dd>
                </div>
              )}
              {(row.basis || row.radius_m) && (
                <div>
                  <dt>{t('prebid.coverage.basis', 'Basis')}</dt>
                  <dd>{row.basis ?? t('prebid.coverage.radius', '{{count}} m radius', { count: row.radius_m })}</dd>
                </div>
              )}
              {(row.method || row.version) && (
                <div>
                  <dt>{t('prebid.coverage.method', 'Method')}</dt>
                  <dd>{[row.method, row.version].filter(Boolean).join(' ')}</dd>
                </div>
              )}
              {row.duration_ms != null && (
                <div>
                  <dt>{t('prebid.coverage.duration', 'Duration')}</dt>
                  <dd>{t('prebid.coverage.durationMs', '{{count}} ms', { count: row.duration_ms })}</dd>
                </div>
              )}
              {row.error_code && (
                <div>
                  <dt>{t('prebid.coverage.errorCode', 'Error')}</dt>
                  <dd>{row.error_code}</dd>
                </div>
              )}
            </dl>
            <p className="source-coverage__limitation">
              {isNl && row.limitation_nl ? row.limitation_nl : row.limitation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
