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
  unavailable?: boolean;
  onTap?: () => void;
}

function RiskTile({
  category,
  labelKey,
  score,
  severity,
  unavailable = false,
  onTap,
}: RiskTileProps) {
  const { t } = useTranslation();
  const interactive = !!onTap && !unavailable;

  return (
    <motion.button
      className={`risk-tile${unavailable ? ' risk-tile--unavailable' : ''}`}
      id={`section-risk-${category}`}
      onClick={interactive ? onTap : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      layoutId={`risk-tile-${category}`}
      data-testid={`risk-tile-${category}`}
      aria-label={score != null
        ? t('risk.tileAria', { label: t(labelKey), score, max: 100 })
        : t('risk.tileAriaUnavailable', { label: t(labelKey) })}
      disabled={!interactive}
    >
      <div className="risk-tile__score-area">
        {score != null ? (
          <AnimatedScore value={score} className={`risk-tile__score risk-tile__score--${severity}`} showScale />
        ) : (
          <span className="risk-tile__score risk-tile__score--unavailable">--</span>
        )}
      </div>
      <div className="risk-tile__header">
        <span className="risk-tile__label">{t(labelKey)}</span>
        {!unavailable && <SeverityBadge severity={severity} size="sm" />}
      </div>
      {interactive && (
        <svg className="risk-tile__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </motion.button>
  );
}

export default memo(RiskTile);
