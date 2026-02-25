import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';

function getReducedMotionMockValue(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-test-reduced-motion') === 'true';
}

// Mock framer-motion — renders motion.div as plain div, etc.
vi.mock('framer-motion', () => {
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      const Component = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
        const {
          layoutId: _a, initial: _b, animate: _c, exit: _d, transition: _e,
          whileTap: _f, whileHover: _g, drag: _h, dragConstraints: _i,
          onDragEnd: _j, variants: _k, layout: _l, onAnimationStart: _m,
          onAnimationComplete: _n, dragElastic: _o, style,
          ...domProps
        } = props;
        return createElement(prop, { ...domProps, style }, children);
      };
      return Component;
    },
  });
  return {
    motion,
    MotionConfig: ({
      children,
      reducedMotion,
    }: {
      children: React.ReactNode;
      reducedMotion?: 'always' | 'never' | 'user';
    }) => createElement(
      'div',
      {
        'data-testid': 'motion-config',
        'data-reduced-motion': reducedMotion,
      },
      children,
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'animate-presence' }, children),
    LayoutGroup: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => {
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
      return getReducedMotionMockValue();
    },
    useMotionValue: (initial: number) => ({ get: () => initial, set: () => {} }),
    useDragControls: () => ({ start: () => {} }),
    useAnimation: () => ({ start: () => Promise.resolve(), stop: () => {} }),
  };
});

// Mock matchMedia for jsdom (required by theme service)
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? getReducedMotionMockValue() : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Mock IntersectionObserver for jsdom (required by viewport-gated 3D fetch)
// Stores the most recent callback and target so tests can simulate intersections.
(globalThis as Record<string, unknown>).__intersectionObserverCallback = null;
(globalThis as Record<string, unknown>).__intersectionObserverTarget = null;

if (typeof globalThis.IntersectionObserver === 'undefined') {
  const MockIntersectionObserver = function (this: Record<string, unknown>, callback: IntersectionObserverCallback) {
    (globalThis as Record<string, unknown>).__intersectionObserverCallback = callback;
    this.observe = (target: Element) => {
      (globalThis as Record<string, unknown>).__intersectionObserverTarget = target;
    };
    this.unobserve = () => {};
    this.disconnect = () => {};
    this.takeRecords = () => [];
    this.root = null;
    this.rootMargin = '';
    this.thresholds = [0];
  } as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

afterEach(cleanup);
