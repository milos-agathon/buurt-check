import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { SPRING_EXPAND } from '../config/springs';
import SeverityBadge from './ui/SeverityBadge';
import ScoreBar from './ui/ScoreBar';
import AnimatedScore from './ui/AnimatedScore';
import useFocusTrap from '../hooks/useFocusTrap';
import type { SeverityLevel, ViewingQuestion } from '../types/api';
import './RiskDetailView.css';

type ComparisonColorKey = 'address' | 'peer' | 'national' | 'who' | 'air_target' | 'climate_target' | 'daylight_target';

interface ComparisonRow {
  label: string;
  value: number;
  pattern?: 'dashed';
  colorKey: ComparisonColorKey;
}

interface RiskDetailViewProps {
  category: string;
  titleKey: string;
  score?: number;
  severity: SeverityLevel;
  useSharedElement?: boolean;
  meaning?: string;
  warnings?: string[];
  comparisons?: ComparisonRow[];
  comparisonsError?: string | null;
  onRetryComparisons?: () => void;
  questions?: ViewingQuestion[];
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
  warnings = [],
  comparisons,
  comparisonsError,
  onRetryComparisons,
  questions,
  source,
  sourceDate,
  onBack,
  onAnimationStart,
  onAnimationComplete,
}: RiskDetailViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    isOpen: true,
    containerRef,
    onRequestClose: onBack,
    initialFocusSelector: '.risk-detail__back',
  });

  return (
    <motion.div
      ref={containerRef}
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
        <button className="risk-detail__back" onClick={onBack} aria-label={t('common.back')}>
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
              <AnimatedScore value={score} className={`risk-detail__score risk-detail__score--${severity}`} showScale />
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

        {warnings.length > 0 && (
          <section className="risk-detail__section" data-testid="risk-detail-warnings">
            <h3 className="risk-detail__section-title">{t('risk.detail.limitations', 'Limitations')}</h3>
            <ul className="risk-detail__warnings">
              {warnings.map((code) => (
                <li key={code} className="risk-detail__warning">
                  {t(`risk.warning.${code}`, code)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="risk-detail__section">
          <h3 className="risk-detail__section-title">{t('risk.detail.howItCompares', 'How it compares')}</h3>
          {comparisons && comparisons.length > 0 ? (
            <>
              <div className="risk-detail__legend" data-testid="comparison-legend">
                {(['address', 'peer', 'national', 'who', 'air_target', 'climate_target', 'daylight_target'] as const)
                  .filter((key) => comparisons.some((r) => r.colorKey === key))
                  .map((key) => (
                    <span key={key} className="risk-detail__legend-item">
                      <span className={`risk-detail__legend-dot risk-detail__legend-dot--${key}`} />
                      {t(`compare.legend.${key}`)}
                    </span>
                  ))}
              </div>
              <div className="risk-detail__comparisons">
                {comparisons.map((row) => (
                  <div key={row.label} className="risk-detail__comparison-row">
                    <span className="risk-detail__comparison-label">{row.label}</span>
                    <div className="risk-detail__comparison-bar-track">
                      <div
                        className={`risk-detail__comparison-bar-fill risk-detail__comparison-bar-fill--${row.colorKey}${row.pattern === 'dashed' ? ' risk-detail__comparison-bar-fill--dashed' : ''}`}
                        style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
                      />
                    </div>
                    <span className="risk-detail__comparison-value">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="risk-detail__directionality" data-testid="comparison-directionality">
                {t('compare.legend.higher_is_better')}
              </p>
            </>
          ) : (
            <div
              className="risk-detail__comparison-unavailable"
              role={comparisonsError ? 'alert' : undefined}
            >
              <p className="risk-detail__comparison-unavailable-text">
                {t(
                  'risk.detail.comparisonsUnavailable',
                  'Comparison benchmarks are temporarily unavailable for this address.',
                )}
              </p>
              {comparisonsError && (
                <p className="risk-detail__comparison-error">{comparisonsError}</p>
              )}
              {comparisonsError && onRetryComparisons && (
                <button
                  type="button"
                  className="app__retry-button risk-detail__comparison-retry"
                  onClick={onRetryComparisons}
                >
                  {t('error.retry', 'Retry')}
                </button>
              )}
            </div>
          )}
        </section>

        {questions && questions.length > 0 && (
          <section className="risk-detail__section">
            <div className="risk-detail__checklist-callout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              <span>
                {t('risk.detail.checklistCallout', {
                  count: questions.length,
                  defaultValue: '{{count}} viewing questions saved to your checklist',
                })}
              </span>
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
