import { useCallback, useRef } from 'react';

interface UseAnimationPerformanceOptions {
  frameBudgetMs?: number;
  droppedFrameThreshold?: number;
}

interface UseAnimationPerformanceResult {
  startMonitoring: () => void;
  stopMonitoring: () => void;
  shouldUseFallback: () => boolean;
  resetFallback: () => void;
}

export function useAnimationPerformance({
  frameBudgetMs = 32,
  droppedFrameThreshold = 3,
}: UseAnimationPerformanceOptions = {}): UseAnimationPerformanceResult {
  const isReducedMotion =
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const frameRequestIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const droppedFramesRef = useRef(0);
  const fallbackEnabledRef = useRef(false);

  const sampleFrame = useCallback((timestamp: number) => {
    if (lastFrameTimeRef.current != null) {
      const delta = timestamp - lastFrameTimeRef.current;
      if (delta > frameBudgetMs) {
        droppedFramesRef.current += 1;
      }
    }
    lastFrameTimeRef.current = timestamp;
    frameRequestIdRef.current = requestAnimationFrame(sampleFrame);
  }, [frameBudgetMs]);

  const startMonitoring = useCallback(() => {
    if (isReducedMotion || fallbackEnabledRef.current) return;

    if (frameRequestIdRef.current != null) {
      cancelAnimationFrame(frameRequestIdRef.current);
      frameRequestIdRef.current = null;
    }

    droppedFramesRef.current = 0;
    lastFrameTimeRef.current = null;
    frameRequestIdRef.current = requestAnimationFrame(sampleFrame);
  }, [isReducedMotion, sampleFrame]);

  const stopMonitoring = useCallback(() => {
    if (frameRequestIdRef.current != null) {
      cancelAnimationFrame(frameRequestIdRef.current);
      frameRequestIdRef.current = null;
    }

    if (droppedFramesRef.current > droppedFrameThreshold) {
      fallbackEnabledRef.current = true;
    }

    lastFrameTimeRef.current = null;
    droppedFramesRef.current = 0;
  }, [droppedFrameThreshold]);

  const shouldUseFallback = useCallback(
    () => isReducedMotion || fallbackEnabledRef.current,
    [isReducedMotion],
  );

  const resetFallback = useCallback(() => {
    if (isReducedMotion) return;
    fallbackEnabledRef.current = false;
    droppedFramesRef.current = 0;
    lastFrameTimeRef.current = null;

    if (frameRequestIdRef.current != null) {
      cancelAnimationFrame(frameRequestIdRef.current);
      frameRequestIdRef.current = null;
    }
  }, [isReducedMotion]);

  return {
    startMonitoring,
    stopMonitoring,
    shouldUseFallback,
    resetFallback,
  };
}
