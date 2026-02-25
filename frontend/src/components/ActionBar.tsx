import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ActionBar.css';

interface ActionBarProps {
  isBookmarked?: boolean;
  onAddToShortlist?: () => void;
  onExportBriefing?: () => void;
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
}: ActionBarProps) {
  const { t } = useTranslation();
  const [bookmarkAnimation, setBookmarkAnimation] = useState<BookmarkAnimationState>(null);
  const previousBookmarked = useRef(isBookmarked);
  const userTapped = useRef(false);
  const animationTimeout = useRef<number | null>(null);

  const handleBookmarkClick = () => {
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

  return (
    <div className="action-bar" data-testid="action-bar">
      <button
        type="button"
        className={`action-bar__btn action-bar__btn--secondary${isBookmarked ? ' action-bar__btn--saved' : ''}`}
        onClick={handleBookmarkClick}
        aria-pressed={isBookmarked}
      >
        <svg className={bookmarkIconClass} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path className="action-bar__bookmark-fill" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          <path className="action-bar__bookmark-stroke" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" pathLength={1} />
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
