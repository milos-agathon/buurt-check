import { useTranslation } from 'react-i18next';
import type { ShortlistItem, SeverityLevel } from '../types/api';
import './ShortlistScreen.css';

interface Props {
  items: ShortlistItem[];
  onRemove: (vboId: string) => void;
  onCompare: () => void;
  onSelectAddress: (vboId: string) => void;
}

function severityFromScore(score: number | undefined): SeverityLevel {
  if (score == null) return 'unavailable';
  if (score >= 70) return 'good';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'poor';
  return 'critical';
}

const DOT_CATEGORIES = ['noise', 'air', 'climate', 'sunlight'] as const;

export default function ShortlistScreen({ items, onRemove, onCompare, onSelectAddress }: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="shortlist-screen" data-testid="shortlist-screen">
        <div className="shortlist-screen__empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="shortlist-screen__empty-title">{t('shortlist.empty')}</h2>
          <p className="shortlist-screen__empty-subtitle">{t('shortlist.emptySubtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shortlist-screen" data-testid="shortlist-screen">
      <div className="shortlist-screen__list">
        {items.map(item => (
          <div key={item.vboId} className="shortlist-screen__card" onClick={() => onSelectAddress(item.vboId)}>
            <div className="shortlist-screen__card-info">
              <span className="shortlist-screen__card-address">{item.address}</span>
              <span className="shortlist-screen__card-city">
                {[item.postcode, item.city].filter(Boolean).join(' ')}
              </span>
            </div>
            <div className="shortlist-screen__dots">
              {DOT_CATEGORIES.map(cat => {
                const score = item.riskScores[cat];
                const sev = severityFromScore(score);
                return (
                  <span
                    key={cat}
                    className={`shortlist-screen__dot shortlist-screen__dot--${sev}`}
                    title={`${cat}: ${score ?? '?'}`}
                  />
                );
              })}
            </div>
            <button
              className="shortlist-screen__remove"
              onClick={(e) => { e.stopPropagation(); onRemove(item.vboId); }}
              aria-label={t('shortlist.remove')}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        className="shortlist-screen__compare-btn"
        onClick={onCompare}
        disabled={items.length < 2}
      >
        {t('shortlist.compare')}
      </button>
    </div>
  );
}
