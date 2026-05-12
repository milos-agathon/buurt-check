import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchLocale, ReportShareResponse } from '../../types/match';
import './MatchShareExport.css';

interface MatchShareExportProps {
  reportId: string | null;
  locale: MatchLocale;
  loading?: boolean;
  errorCode?: string | null;
  share?: ReportShareResponse | null;
  exportReady?: boolean;
  onSaveReport: () => void | Promise<void>;
  onShareReport: (consent: boolean) => void | Promise<void>;
  onExportReport: (exportType: 'pdf' | 'html' | 'json') => void | Promise<void>;
}

export default function MatchShareExport({
  reportId,
  locale,
  loading = false,
  errorCode = null,
  share = null,
  exportReady = false,
  onSaveReport,
  onShareReport,
  onExportReport,
}: MatchShareExportProps) {
  const { t } = useTranslation();
  const [consent, setConsent] = useState(false);

  return (
    <section className="match-share-export" aria-labelledby="match-share-export-title">
      <header>
        <p className="match-share-export__eyebrow">{t('match.share.eyebrow')}</p>
        <h1 id="match-share-export-title">{t('match.share.title')}</h1>
      </header>

      {!reportId && <p>{t('match.share.noReport')}</p>}
      {loading && <p role="status">{t('match.share.loading')}</p>}
      {errorCode && <p role="alert">{t(errorCode)}</p>}

      <dl className="match-share-export__meta">
        <div>
          <dt>{t('match.share.reportId')}</dt>
          <dd>{reportId ?? '-'}</dd>
        </div>
        <div>
          <dt>{t('match.share.locale')}</dt>
          <dd>{locale}</dd>
        </div>
      </dl>
      <p className="match-share-export__metadata-note">
        {t('match.share.metadataNote')}
      </p>

      <div className="match-share-export__actions">
        <button type="button" disabled={!reportId || loading} onClick={() => void onSaveReport()}>
          {t('match.share.saveReport')}
        </button>
        <label className="match-share-export__consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {t('match.share.consent')}
        </label>
        <button
          type="button"
          disabled={!reportId || !consent || loading}
          onClick={() => void onShareReport(consent)}
        >
          {t('match.share.createLink')}
        </button>
        <button type="button" disabled={!reportId || loading} onClick={() => void onExportReport('pdf')}>
          {t('match.share.exportPdf')}
        </button>
        <button type="button" disabled={!reportId || loading} onClick={() => void onExportReport('json')}>
          {t('match.share.exportJson')}
        </button>
      </div>

      {share && (
        <p className="match-share-export__link">
          {t('match.share.linkReady', { url: share.share_url })}
        </p>
      )}
      {exportReady && <p role="status">{t('match.share.exportReady')}</p>}
    </section>
  );
}
