import { useTranslation } from 'react-i18next';
import type { SavedNeighborhood } from '../../types/match';
import MatchShareExport from './MatchShareExport';
import type { MatchLocale, ReportShareResponse } from '../../types/match';
import { getSavedNeighborhoodDisplayName } from './matchDisplayLabels';
import './MatchSaved.css';

interface MatchSavedProps {
  neighborhoods: SavedNeighborhood[];
  reportId: string | null;
  locale: MatchLocale;
  loading?: boolean;
  errorCode?: string | null;
  share?: ReportShareResponse | null;
  exportReady?: boolean;
  onDeleteNeighborhood: (savedNeighborhoodId: string) => void | Promise<void>;
  onSaveReport: () => void | Promise<void>;
  onShareReport: (consent: boolean) => void | Promise<void>;
  onExportReport: (exportType: 'pdf' | 'html' | 'json') => void | Promise<void>;
}

export default function MatchSaved({
  neighborhoods,
  reportId,
  locale,
  loading = false,
  errorCode = null,
  share = null,
  exportReady = false,
  onDeleteNeighborhood,
  onSaveReport,
  onShareReport,
  onExportReport,
}: MatchSavedProps) {
  const { t } = useTranslation();

  return (
    <section className="match-saved" aria-labelledby="match-saved-title">
      <header>
        <p className="match-saved__eyebrow">{t('match.saved.eyebrow')}</p>
        <h1 id="match-saved-title">{t('match.saved.title')}</h1>
      </header>

      {loading && <p role="status">{t('match.saved.loading')}</p>}
      {errorCode && <p role="alert">{t(errorCode)}</p>}

      <section className="match-saved__neighborhoods" aria-label={t('match.saved.neighborhoods')}>
        {neighborhoods.length === 0 ? (
          <p>{t('match.saved.empty')}</p>
        ) : (
          neighborhoods.map((saved) => (
            <article className="match-saved__item" key={saved.saved_neighborhood_id}>
              <h2>{getSavedNeighborhoodDisplayName(saved.neighborhood_id, saved.note, t)}</h2>
              <p>{t(`match.saved.from.${saved.saved_from}`)}</p>
              <button
                type="button"
                onClick={() => void onDeleteNeighborhood(saved.saved_neighborhood_id)}
              >
                {t('match.saved.unsave')}
              </button>
            </article>
          ))
        )}
      </section>

      <MatchShareExport
        reportId={reportId}
        locale={locale}
        share={share}
        exportReady={exportReady}
        onSaveReport={onSaveReport}
        onShareReport={onShareReport}
        onExportReport={onExportReport}
      />
    </section>
  );
}
