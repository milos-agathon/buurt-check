import { useEffect } from 'react';

export const VIEWPORT_BOTTOM_OFFSET_CSS_VAR = '--viewport-bottom-offset';

export function calculateViewportBottomOffset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
): number {
  if (!Number.isFinite(layoutViewportHeight) || !Number.isFinite(visualViewportHeight) || !Number.isFinite(visualViewportOffsetTop)) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(layoutViewportHeight - (visualViewportHeight + visualViewportOffsetTop)),
  );
}

function getLayoutViewportHeight(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0;
  }

  return Math.max(window.innerHeight, document.documentElement.clientHeight);
}

function getViewportBottomOffset(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }

  return calculateViewportBottomOffset(
    getLayoutViewportHeight(),
    viewport.height,
    viewport.offsetTop,
  );
}

export function useViewportBottomOffset() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    let rafId: number | null = null;

    const applyOffset = () => {
      rafId = null;
      root.style.setProperty(
        VIEWPORT_BOTTOM_OFFSET_CSS_VAR,
        `${getViewportBottomOffset()}px`,
      );
    };

    const scheduleApplyOffset = () => {
      if (rafId != null) {
        return;
      }

      rafId = window.requestAnimationFrame(applyOffset);
    };

    applyOffset();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', scheduleApplyOffset);
    viewport?.addEventListener('scroll', scheduleApplyOffset);
    window.addEventListener('resize', scheduleApplyOffset, { passive: true });
    window.addEventListener('orientationchange', scheduleApplyOffset);

    return () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }

      viewport?.removeEventListener('resize', scheduleApplyOffset);
      viewport?.removeEventListener('scroll', scheduleApplyOffset);
      window.removeEventListener('resize', scheduleApplyOffset);
      window.removeEventListener('orientationchange', scheduleApplyOffset);
      root.style.setProperty(VIEWPORT_BOTTOM_OFFSET_CSS_VAR, '0px');
    };
  }, []);
}
