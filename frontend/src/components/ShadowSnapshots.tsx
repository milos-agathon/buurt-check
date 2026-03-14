import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShadowSnapshot } from '../types/api';
import './ShadowSnapshots.css';

interface Props {
  snapshots?: ShadowSnapshot[];
  loading?: boolean;
}

const LABEL_KEYS: Record<string, string> = {
  top: 'snapshots.top',
  front: 'snapshots.front',
  rear: 'snapshots.rear',
};

function snapshotViewKey(label: string, viewpoint?: string): string {
  if (viewpoint) return viewpoint;
  return label.split('_')[0];
}

function ShadowSnapshots({ snapshots, loading }: Props) {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const openLightbox = useCallback((index: number) => {
    setExpandedIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setExpandedIndex((prev) => {
      // Return focus to the thumbnail that was expanded
      if (prev !== null && thumbnailRefs.current[prev]) {
        requestAnimationFrame(() => {
          thumbnailRefs.current[prev]?.focus();
        });
      }
      return null;
    });
  }, []);

  // Focus the close button when lightbox opens
  useEffect(() => {
    if (expandedIndex !== null && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [expandedIndex]);

  // Escape key to dismiss
  useEffect(() => {
    if (expandedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedIndex, closeLightbox]);

  if (loading) {
    return (
      <div className="shadow-snapshots">
        <h2 className="shadow-snapshots__title">{t('snapshots.title')}</h2>
        <p className="shadow-snapshots__loading">{t('snapshots.loading')}</p>
      </div>
    );
  }

  if (!snapshots) return null;

  const getLabel = (snap: ShadowSnapshot) => {
    const viewKey = snapshotViewKey(snap.label, snap.viewpoint);
    const hour = String(snap.hour).padStart(2, '0');
    return `${t(LABEL_KEYS[viewKey] ?? viewKey)} (${hour}:00)`;
  };

  return (
    <div className="shadow-snapshots">
      <h2 className="shadow-snapshots__title">{t('snapshots.title')}</h2>
      <p className="shadow-snapshots__subtitle">{t('snapshots.subtitle')}</p>
      <div className="shadow-snapshots__grid">
        {snapshots.map((snap, index) => (
          <div key={snap.label} className="shadow-snapshots__item">
            <button
              ref={(el) => { thumbnailRefs.current[index] = el; }}
              className="shadow-snapshots__thumbnail-btn"
              onClick={() => openLightbox(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(index);
                }
              }}
              aria-label={t('snapshots.expandLabel')}
              type="button"
            >
              <img
                src={snap.dataUrl}
                alt={getLabel(snap)}
                className="shadow-snapshots__image"
                loading="lazy"
              />
            </button>
            <span className="shadow-snapshots__label">
              {getLabel(snap)}
            </span>
          </div>
        ))}
      </div>
      <p className="shadow-snapshots__source">{t('snapshots.source')}</p>

      {expandedIndex !== null && snapshots[expandedIndex] && (
        <div
          className="shadow-snapshots__lightbox"
          role="dialog"
          aria-label={t('snapshots.expandLabel')}
          onClick={closeLightbox}
        >
          <div
            className="shadow-snapshots__lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              className="shadow-snapshots__lightbox-close"
              onClick={closeLightbox}
              aria-label={t('snapshots.closeLabel')}
              type="button"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <img
              src={snapshots[expandedIndex].dataUrl}
              alt={getLabel(snapshots[expandedIndex])}
              className="shadow-snapshots__lightbox-img"
            />
            <p className="shadow-snapshots__lightbox-label">
              {getLabel(snapshots[expandedIndex])}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ShadowSnapshots);
