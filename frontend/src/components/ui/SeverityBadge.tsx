import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeverityLevel } from '../../types/api';
import './SeverityBadge.css';

interface SeverityBadgeProps {
  severity: SeverityLevel;
  size?: 'sm' | 'md';
}

const SEVERITY_ICONS: Record<SeverityLevel, string> = {
  good: 'M9 12l2 2 4-4',                    // checkmark
  moderate: 'M5 12h14',                      // dash
  poor: 'M12 9v4M12 17h.01',                // triangle exclamation (just the marks)
  critical: 'M18 6L6 18M6 6l12 12',          // X
  unavailable: 'M12 8v4M12 16h.01',          // question-like
};

function SeverityBadge({ severity, size = 'md' }: SeverityBadgeProps) {
  const { t } = useTranslation();

  const label = t(`severity.${severity}`, severity);
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <span className={`severity-badge severity-badge--${severity} severity-badge--${size}`}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="severity-badge__icon"
        aria-hidden="true"
      >
        {severity === 'good' && <circle cx="12" cy="12" r="10" />}
        {severity === 'moderate' && <circle cx="12" cy="12" r="10" />}
        {severity === 'poor' && <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />}
        {severity === 'critical' && <circle cx="12" cy="12" r="10" />}
        {severity === 'unavailable' && <circle cx="12" cy="12" r="10" />}
        <path d={SEVERITY_ICONS[severity]} />
      </svg>
      <span className="severity-badge__label">{label}</span>
    </span>
  );
}

export default memo(SeverityBadge);
