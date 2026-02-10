import { useTranslation } from 'react-i18next';
import './ActionBar.css';

interface ActionBarProps {
  isBookmarked?: boolean;
  onAddToShortlist?: () => void;
  onExportBriefing?: () => void;
}

export default function ActionBar({
  isBookmarked = false,
  onAddToShortlist,
  onExportBriefing,
}: ActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="action-bar" data-testid="action-bar">
      <button
        type="button"
        className={`action-bar__btn action-bar__btn--secondary${isBookmarked ? ' action-bar__btn--saved' : ''}`}
        onClick={onAddToShortlist}
      >
        <svg className="action-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {isBookmarked
          ? t('action.saved', 'Saved')
          : t('action.addToShortlist', 'Add to Shortlist')}
      </button>
      <button
        type="button"
        className="action-bar__btn action-bar__btn--primary"
        onClick={onExportBriefing}
      >
        <svg className="action-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        {t('action.exportBriefing', 'Export Briefing')}
      </button>
    </div>
  );
}
