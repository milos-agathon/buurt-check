import type { SeverityLevel } from '../../types/api';
import './ScoreBar.css';

interface ScoreBarProps {
  score: number;
  severity: SeverityLevel;
  animated?: boolean;
}

export default function ScoreBar({ score, severity, animated = true }: ScoreBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = animated && !prefersReducedMotion;

  return (
    <div className="score-bar" role="meter" aria-valuenow={clampedScore} aria-valuemin={0} aria-valuemax={100}>
      <div className="score-bar__track">
        <div
          className={`score-bar__fill score-bar__fill--${severity}${shouldAnimate ? ' score-bar__fill--animated' : ''}`}
          style={{ width: `${clampedScore}%` }}
        />
        <div
          className={`score-bar__dot score-bar__dot--${severity}${shouldAnimate ? ' score-bar__dot--animated' : ''}`}
          style={{ left: `${clampedScore}%` }}
        />
      </div>
    </div>
  );
}
