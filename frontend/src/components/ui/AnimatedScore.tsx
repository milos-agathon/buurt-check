import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './AnimatedScore.css';

interface AnimatedScoreProps {
  value: number;
  duration?: number;
  className?: string;
  showScale?: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedScore({ value, duration = 600, className, showScale = false }: AnimatedScoreProps) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>(0);
  const prefersReducedMotion = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    try {
      prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      prefersReducedMotion.current = false;
    }
  }, []);

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setDisplay(value);
      return;
    }

    const startTime = performance.now();
    const startValue = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      const current = Math.round(startValue + (value - startValue) * eased);
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={className} aria-live="polite" aria-label={String(value)}>
      {display}
      {showScale && (
        <span className="animated-score__scale" aria-hidden="true">
          {t('score.scale', '/100')}
        </span>
      )}
    </span>
  );
}
