import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import SeverityBadge from './ui/SeverityBadge';
import AnimatedScore from './ui/AnimatedScore';
import type { SeverityLevel } from '../types/api';
import './RiskTile.css';

interface RiskTileProps {
  category: string;
  labelKey: string;
  score?: number;
  severity: SeverityLevel;
  summary?: string;
  warnings?: string[];
  unavailable?: boolean;
  source?: string;
  sourceDate?: string;
  confidence?: string;
  questionCount?: number;
  firstQuestion?: string;
  limitation?: string;
  onTap?: () => void;
}

function RiskTile({
  category,
  labelKey,
  score,
  severity,
  summary,
  warnings = [],
  unavailable = false,
  source,
  sourceDate,
  confidence,
  questionCount,
  firstQuestion,
  limitation,
  onTap,
}: RiskTileProps) {
  const { t } = useTranslation();
  const interactive = !!onTap && !unavailable;
  const label = t(labelKey);
  const displaySummary = unavailable
    ? t('risk.tileUnavailable')
    : summary;
  const sourceLabel = source ?? t('risk.sourceUnknown');
  const dateLabel = sourceDate ?? t('risk.sourceDateUnknown');
  const confidenceLabel = confidence ?? (unavailable ? t('risk.confidence.unavailable') : t('risk.confidence.indicative'));
  const warningText = warnings.length > 0 ? t(`risk.warning.${warnings[0]}`, warnings[0]) : undefined;
  const questionLine = typeof questionCount === 'number' && questionCount > 0
    ? t('risk.tileQuestionCount', { count: questionCount })
    : firstQuestion
      ? t('risk.tileFirstQuestion', { question: firstQuestion })
      : t('risk.tileQuestionsUnavailable');
  const ariaLabel = score != null
    ? t('risk.tileAriaDetailed', {
      label,
      score,
      max: 100,
      severity: t(`severity.${severity}`, severity),
      source: sourceLabel,
      date: dateLabel,
      confidence: confidenceLabel,
    })
    : t('risk.tileAriaUnavailableDetailed', {
      label,
      source: sourceLabel,
      date: dateLabel,
      confidence: confidenceLabel,
    });

  return (
    <motion.button
      className={`risk-tile${unavailable ? ' risk-tile--unavailable' : ''}`}
      id={`section-risk-${category}`}
      onClick={interactive ? onTap : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      layoutId={`risk-tile-${category}`}
      data-testid={`risk-tile-${category}`}
      aria-label={ariaLabel}
      disabled={!interactive}
    >
      <div className="risk-tile__header">
        <span className="risk-tile__label">{label}</span>
        <SeverityBadge severity={severity} size="sm" />
      </div>
      {(displaySummary || warningText) && (
        <p className="risk-tile__consequence risk-tile__summary">
          {displaySummary && <span>{displaySummary}</span>}
          {warningText && (
            <span className="risk-tile__warning" data-testid={`risk-tile-warning-${category}`}>
              {displaySummary ? ` · ${warningText}` : warningText}
            </span>
          )}
        </p>
      )}
      <p className="risk-tile__question-line">{questionLine}</p>
      <div className="risk-tile__score-area">
        <span className="risk-tile__score-label">{t('risk.tileScoreLabel', 'Risk score')}</span>
        {score != null ? (
          <AnimatedScore value={score} className={`risk-tile__score risk-tile__score--${severity}`} showScale />
        ) : (
          <span className="risk-tile__score risk-tile__score--unavailable">--</span>
        )}
      </div>
      <p className="risk-tile__evidence-meta">
        <span className="risk-tile__evidence-source">{sourceLabel}</span>
        <span className="risk-tile__evidence-date">{dateLabel}</span>
        <span className="risk-tile__evidence-confidence">{confidenceLabel}</span>
      </p>
      {limitation && (
        <span className="sr-only">{t('risk.detail.limitation')}: {limitation}</span>
      )}
      {interactive && (
        <svg className="risk-tile__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </motion.button>
  );
}

export default memo(RiskTile);
