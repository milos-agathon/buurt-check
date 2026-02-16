import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { SPRING_EXPAND } from '../config/springs';
import SeverityBadge from './ui/SeverityBadge';
import ScoreBar from './ui/ScoreBar';
import AnimatedScore from './ui/AnimatedScore';
import type { SeverityLevel, ViewingQuestion } from '../types/api';
import './RiskDetailView.css';

interface ComparisonRow {
  label: string;
  value: number;
  pattern?: 'dashed';
}

interface RiskDetailViewProps {
  category: string;
  titleKey: string;
  score?: number;
  severity: SeverityLevel;
  useSharedElement?: boolean;
  meaning?: string;
  comparisons?: ComparisonRow[];
  questions?: ViewingQuestion[];
  checkedQuestions?: Set<string>;
  onToggleQuestion?: (id: string) => void;
  source?: string;
  sourceDate?: string;
  onBack: () => void;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}

export default function RiskDetailView({
  category,
  titleKey,
  score,
  severity,
  useSharedElement = true,
  meaning,
  comparisons,
  questions,
  checkedQuestions,
  onToggleQuestion,
  source,
  sourceDate,
  onBack,
  onAnimationStart,
  onAnimationComplete,
}: RiskDetailViewProps) {
  const { t, i18n } = useTranslation();
  const isNl = i18n.language === 'nl';

  return (
    <motion.div
      className="risk-detail"
      layoutId={useSharedElement ? `risk-tile-${category}` : undefined}
      initial={useSharedElement ? undefined : { opacity: 0 }}
      animate={useSharedElement ? undefined : { opacity: 1 }}
      exit={useSharedElement ? undefined : { opacity: 0 }}
      transition={useSharedElement ? SPRING_EXPAND : { duration: 0.2, ease: 'easeOut' }}
      onAnimationStart={onAnimationStart}
      onAnimationComplete={onAnimationComplete}
      data-testid={`risk-detail-${category}`}
    >
      <nav className="risk-detail__nav">
        <button className="risk-detail__back" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="risk-detail__nav-title">{t(titleKey)}</span>
      </nav>

      <div className="risk-detail__content">
        <div className="risk-detail__score-section">
          <div className="risk-detail__score-row">
            {score != null ? (
              <AnimatedScore value={score} className={`risk-detail__score risk-detail__score--${severity}`} />
            ) : (
              <span className="risk-detail__score risk-detail__score--unavailable">--</span>
            )}
            <SeverityBadge severity={severity} size="md" />
          </div>
          {score != null && <ScoreBar score={score} severity={severity} />}
        </div>

        {meaning && (
          <section className="risk-detail__section">
            <h3 className="risk-detail__section-title">{t('risk.detail.whatThisMeans', 'What this means')}</h3>
            <p className="risk-detail__meaning">{meaning}</p>
          </section>
        )}

        {comparisons && comparisons.length > 0 && (
          <section className="risk-detail__section">
            <h3 className="risk-detail__section-title">{t('risk.detail.howItCompares', 'How it compares')}</h3>
            <div className="risk-detail__comparisons">
              {comparisons.map((row) => (
                <div key={row.label} className="risk-detail__comparison-row">
                  <span className="risk-detail__comparison-label">{row.label}</span>
                  <div className="risk-detail__comparison-bar-track">
                    <div
                      className={`risk-detail__comparison-bar-fill${row.pattern === 'dashed' ? ' risk-detail__comparison-bar-fill--dashed' : ''}`}
                      style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
                    />
                  </div>
                  <span className="risk-detail__comparison-value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {questions && questions.length > 0 && (
          <section className="risk-detail__section risk-detail__questions">
            <h3 className="risk-detail__section-title">{t('risk.detail.askAtViewing', 'Ask at your viewing')}</h3>
            <div className="risk-detail__question-list">
              {questions.map((q, i) => {
                const id = `${category}-q-${i}`;
                const text = isNl ? q.text_nl : q.text_en;
                return (
                  <label key={id} className="risk-detail__question-item">
                    <input
                      type="checkbox"
                      className="risk-detail__checkbox"
                      checked={checkedQuestions?.has(id) ?? false}
                      onChange={() => onToggleQuestion?.(id)}
                    />
                    <span>{text}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {source && (
          <footer className="risk-detail__footer">
            <p className="risk-detail__source">
              {sourceDate
                ? t('risk.sourceDate', { source, date: sourceDate })
                : source}
            </p>
            <p className="risk-detail__disclaimer">{t('risk.disclaimer')}</p>
          </footer>
        )}
      </div>
    </motion.div>
  );
}
