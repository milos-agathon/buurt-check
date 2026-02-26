import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContextualTooltip from './ui/ContextualTooltip';
import { hasSeenTooltip, markTooltipSeen } from '../services/tooltipTracker';
import './ActionBar.css';

interface ActionBarProps {
  isBookmarked?: boolean;
  onAddToShortlist?: () => void;
  onExportBriefing?: () => void;
  showBookmarkTooltip?: boolean;
  bookmarkPending?: boolean;
  exportPending?: boolean;
  visible?: boolean;
}

type BookmarkAnimationState = 'saving' | 'removing' | null;

const BOOKMARK_ANIMATION_TOTAL_MS = 420;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function ActionBar({
  isBookmarked = false,
  onAddToShortlist,
  onExportBriefing,
  showBookmarkTooltip = false,
  bookmarkPending = false,
  exportPending = false,
  visible = true,
}: ActionBarProps) {
  const { t } = useTranslation();
  const [bookmarkAnimation, setBookmarkAnimation] = useState<BookmarkAnimationState>(null);
  const previousBookmarked = useRef(isBookmarked);
  const userTapped = useRef(false);
  const animationTimeout = useRef<number | null>(null);

  // Bookmark tooltip: show once on first dossier load
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipChecked = useRef(false);

  useEffect(() => {
    if (showBookmarkTooltip && !tooltipChecked.current && !hasSeenTooltip('bookmark')) {
      tooltipChecked.current = true;
      setTooltipVisible(true);
    }
  }, [showBookmarkTooltip]);

  const dismissBookmarkTooltip = useCallback(() => {
    setTooltipVisible(false);
    markTooltipSeen('bookmark');
  }, []);

  const handleBookmarkClick = () => {
    if (bookmarkPending) return;
    userTapped.current = true;
    onAddToShortlist?.();
  };

  useEffect(() => {
    const wasBookmarked = previousBookmarked.current;
    if (wasBookmarked === isBookmarked) return;
    previousBookmarked.current = isBookmarked;

    // Only animate/vibrate when the user actually tapped the button,
    // not on hydration from localStorage or other programmatic changes
    if (!userTapped.current) return;
    userTapped.current = false;

    if (isBookmarked && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }

    if (prefersReducedMotion()) {
      setBookmarkAnimation(null);
      return;
    }

    if (animationTimeout.current != null) {
      window.clearTimeout(animationTimeout.current);
    }
    setBookmarkAnimation(isBookmarked ? 'saving' : 'removing');
    animationTimeout.current = window.setTimeout(() => {
      setBookmarkAnimation(null);
      animationTimeout.current = null;
    }, BOOKMARK_ANIMATION_TOTAL_MS);
  }, [isBookmarked]);

  useEffect(() => () => {
    if (animationTimeout.current != null) {
      window.clearTimeout(animationTimeout.current);
    }
  }, []);

  const bookmarkIconClass = [
    'action-bar__icon',
    'action-bar__bookmark-icon',
    isBookmarked ? 'action-bar__bookmark-icon--saved' : '',
    bookmarkAnimation ? `action-bar__bookmark-icon--${bookmarkAnimation}` : '',
  ].filter(Boolean).join(' ');

  const barClass = [
    'action-bar',
    visible ? 'action-bar--visible' : 'action-bar--hidden',
  ].join(' ');

  return (
    <div className={barClass} data-testid="action-bar" aria-hidden={!visible}>
      <div className="action-bar__btn-wrapper">
        <button
          type="button"
          className={`action-bar__btn action-bar__btn--secondary${isBookmarked ? ' action-bar__btn--saved' : ''}`}
          onClick={handleBookmarkClick}
          aria-pressed={isBookmarked}
          disabled={bookmarkPending}
          aria-busy={bookmarkPending || undefined}
        >
          <svg className={bookmarkIconClass} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path className="action-bar__bookmark-fill" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            <path className="action-bar__bookmark-stroke" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" pathLength={1} />
          </svg>
          {isBookmarked
            ? t('action.saved', 'Saved')
            : t('action.addToShortlist', 'Add to Shortlist')}
        </button>
        {tooltipVisible && (
          <ContextualTooltip
            message={t('tooltip.bookmark')}
            onDismiss={dismissBookmarkTooltip}
            position="above"
          />
        )}
      </div>
      <button
        type="button"
        className="action-bar__btn action-bar__btn--primary"
        onClick={onExportBriefing}
        disabled={exportPending}
        aria-busy={exportPending || undefined}
      >
        <svg className="action-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        {exportPending
          ? t('export.generating', 'Generating...')
          : t('action.exportBriefing', 'Export Briefing')}
      </button>
    </div>
  );
}
