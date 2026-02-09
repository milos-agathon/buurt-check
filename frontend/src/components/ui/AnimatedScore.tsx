import { useEffect, useRef, useState } from 'react';

interface AnimatedScoreProps {
  value: number;
  duration?: number;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedScore({ value, duration = 600, className }: AnimatedScoreProps) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>(0);
  const prefersReducedMotion = useRef(false);

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
    </span>
  );
}
