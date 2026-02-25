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

function getReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function AnimatedScore({ value, duration = 600, className, showScale = false }: AnimatedScoreProps) {
  const reducedMotion = useRef(getReducedMotion());
  const [display, setDisplay] = useState(() => reducedMotion.current ? value : 0);
  const [isVisible, setIsVisible] = useState(() => reducedMotion.current);
  const rafRef = useRef<number>(0);
  const animatedValueRef = useRef<number | null>(reducedMotion.current ? value : null);
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (reducedMotion.current || isVisible) return;

    const node = elementRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    if (reducedMotion.current) {
      setDisplay(value);
      animatedValueRef.current = value;
      return;
    }

    if (animatedValueRef.current === value) return;

    const startTime = performance.now();
    const startValue = animatedValueRef.current ?? 0;

    const animate = () => {
      const elapsed = Math.max(0, performance.now() - startTime);
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      const current = Math.round(startValue + (value - startValue) * eased);
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        animatedValueRef.current = value;
      }
    };

    if (duration <= 0) {
      setDisplay(value);
      animatedValueRef.current = value;
      return;
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration, isVisible]);

  return (
    <span ref={elementRef} className={className} aria-live="polite" aria-label={String(value)}>
      {display}
      {showScale && (
        <span className="animated-score__scale" aria-hidden="true">
          {t('score.scale', '/100')}
        </span>
      )}
    </span>
  );
}
