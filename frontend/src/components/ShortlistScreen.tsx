import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import ContextualTooltip from './ui/ContextualTooltip';
import { hasSeenTooltip, markTooltipSeen } from '../services/tooltipTracker';
import type { ShortlistItem, SeverityLevel } from '../types/api';
import './ShortlistScreen.css';

interface Props {
  items: ShortlistItem[];
  onRemove: (vboId: string) => void;
  onCompare: () => void;
  onSelectAddress: (vboId: string) => void;
  onSearchAddress: () => void;
}

function severityFromScore(score: number | undefined): SeverityLevel {
  if (score == null) return 'unavailable';
  if (score >= 70) return 'good';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'poor';
  return 'critical';
}

const DOT_CATEGORIES = ['noise', 'air', 'climate', 'sunlight'] as const;

export default function ShortlistScreen({ items, onRemove, onCompare, onSelectAddress, onSearchAddress }: Props) {
  const { t } = useTranslation();

  // Compare tooltip: show once when 2+ items
  const [compareTooltipVisible, setCompareTooltipVisible] = useState(false);
  const compareTooltipChecked = useRef(false);

  useEffect(() => {
    if (items.length >= 2 && !compareTooltipChecked.current && !hasSeenTooltip('compare')) {
      compareTooltipChecked.current = true;
      setCompareTooltipVisible(true);
    }
  }, [items.length]);

  const dismissCompareTooltip = useCallback(() => {
    setCompareTooltipVisible(false);
    markTooltipSeen('compare');
  }, []);

  if (items.length === 0) {
    return (
      <div className="shortlist-screen" data-testid="shortlist-screen">
        <div className="shortlist-screen__empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="shortlist-screen__empty-title">{t('shortlist.empty')}</h2>
          <p className="shortlist-screen__empty-subtitle">{t('shortlist.emptySubtitle')}</p>
          <button
            type="button"
            className="shortlist-screen__cta"
            onClick={onSearchAddress}
          >
            {t('shortlist.searchCta')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shortlist-screen" data-testid="shortlist-screen">
      <div className="shortlist-screen__list">
        {items.map(item => (
          <div
            key={item.vboId}
            className="shortlist-screen__card"
            onClick={() => onSelectAddress(item.vboId)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectAddress(item.vboId);
              }
            }}
          >
            <div className="shortlist-screen__thumb" aria-hidden="true">
              <svg className="shortlist-screen__thumb-map" viewBox="0 0 56 56">
                <rect x="1" y="1" width="54" height="54" rx="12" />
                <path d="M12 20h32M12 30h32M12 40h32M20 12v32M30 12v32M40 12v32" />
              </svg>
              <svg className="shortlist-screen__thumb-pin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 22s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" />
                <circle cx="12" cy="12" r="2.2" />
              </svg>
              {item.buildingYear && (
                <span className="shortlist-screen__thumb-year">{item.buildingYear}</span>
              )}
            </div>
            <div className="shortlist-screen__card-info">
              <span className="shortlist-screen__card-address">{item.address}</span>
              <span className="shortlist-screen__card-city">
                {[item.postcode, item.city].filter(Boolean).join(' ')}
              </span>
              <span className="shortlist-screen__card-cta">
                {t('shortlist.openDossier', 'Open dossier')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </span>
            </div>
            <div className="shortlist-screen__dots">
              {DOT_CATEGORIES.map(cat => {
                const score = item.riskScores[cat];
                const sev = severityFromScore(score);
                return (
                  <span
                    key={cat}
                    role="img"
                    aria-label={`${cat}: ${score ?? '?'}`}
                    className={`shortlist-screen__dot shortlist-screen__dot--${sev}`}
                  />
                );
              })}
            </div>
            <motion.button
              className="shortlist-screen__remove"
              onClick={(e) => { e.stopPropagation(); onRemove(item.vboId); }}
              whileTap={{ scale: 0.97 }}
              aria-label={t('shortlist.remove')}
            >
              &times;
            </motion.button>
          </div>
        ))}
      </div>
      <div className="shortlist-screen__compare-wrapper">
        <button
          className="shortlist-screen__compare-btn"
          onClick={onCompare}
          disabled={items.length < 2}
        >
          {t('shortlist.compare')}
        </button>
        {compareTooltipVisible && (
          <ContextualTooltip
            message={t('tooltip.compare')}
            onDismiss={dismissCompareTooltip}
            position="above"
          />
        )}
      </div>
    </div>
  );
}
