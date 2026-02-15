import type { SeverityLevel } from '../types/api';
import './SummaryStrip.css';

interface SummaryPill {
  category: string;
  labelKey: string;
  score?: number;
  severity: SeverityLevel;
}

interface SummaryStripProps {
  pills: SummaryPill[];
  onPillTap?: (category: string) => void;
}

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  good: 'var(--color-risk-good)',
  moderate: 'var(--color-risk-moderate)',
  poor: 'var(--color-risk-poor)',
  critical: 'var(--color-risk-critical)',
  unavailable: 'var(--color-risk-unavailable)',
};

const CATEGORY_ICONS: Record<string, string> = {
  noise: 'M15.536 8.464a5 5 0 010 7.072M12 12v.01',
  air: 'M3 15h4l3-8 4 16 3-8h4',
  climate: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707',
  sunlight: 'M12 3v1m0 16v1m9-9h-1M4 12H3m3.343-5.657L5.636 5.636m12.728 0l-.707.707',
};

export default function SummaryStrip({ pills, onPillTap }: SummaryStripProps) {

  return (
    <div className="summary-strip" data-testid="summary-strip" role="list">
      {pills.map(pill => (
        <button
          key={pill.category}
          className="summary-strip__pill"
          role="listitem"
          style={{ '--pill-color': SEVERITY_COLORS[pill.severity] } as React.CSSProperties}
          onClick={() => onPillTap?.(pill.category)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={CATEGORY_ICONS[pill.category] || CATEGORY_ICONS.noise} />
          </svg>
          <span className="summary-strip__score">
            {pill.score != null ? pill.score : '--'}
          </span>
        </button>
      ))}
    </div>
  );
}
