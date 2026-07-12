import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';

function getReducedMotionMockValue(): boolean {
  if (typeof document === 'undefined') return true;
  const attr = document.documentElement.getAttribute('data-test-reduced-motion');
  // Default to true (so AnimatedScore renders immediately in tests).
  // Only return false when explicitly set to 'false'.
  if (attr === 'false') return false;
  return true;
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

// Mock matchMedia for jsdom (required by theme service + AnimatedScore)
// Default: reduced-motion=true so AnimatedScore renders immediately.
// Override per-test via data-test-reduced-motion="false" attribute or local matchMedia override.
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

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock IntersectionObserver for jsdom (required by viewport-gated 3D fetch + AnimatedScore)
// Stores ALL observer instances so tests can trigger specific ones or broadcast to all.
interface MockObserverEntry { callback: IntersectionObserverCallback; targets: Set<Element>; disconnected: boolean }
(globalThis as Record<string, unknown>).__intersectionObservers = [] as MockObserverEntry[];
// Legacy single-callback for backward compat with existing test helpers
(globalThis as Record<string, unknown>).__intersectionObserverCallback = null;
(globalThis as Record<string, unknown>).__intersectionObserverTarget = null;

if (typeof globalThis.IntersectionObserver === 'undefined') {
  const MockIntersectionObserver = function (this: Record<string, unknown>, callback: IntersectionObserverCallback) {
    const entry: MockObserverEntry = { callback, targets: new Set(), disconnected: false };
    ((globalThis as Record<string, unknown>).__intersectionObservers as MockObserverEntry[]).push(entry);
    // Legacy: also store last callback for simple helpers
    (globalThis as Record<string, unknown>).__intersectionObserverCallback = callback;
    this.observe = (target: Element) => {
      entry.targets.add(target);
      (globalThis as Record<string, unknown>).__intersectionObserverTarget = target;
    };
    this.unobserve = (target: Element) => { entry.targets.delete(target); };
    this.disconnect = () => { entry.disconnected = true; entry.targets.clear(); };
    this.takeRecords = () => [];
    this.root = null;
    this.rootMargin = '';
    this.thresholds = [0];
  } as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

afterEach(cleanup);
