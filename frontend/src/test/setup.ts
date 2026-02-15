import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';

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
    AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'animate-presence' }, children),
    LayoutGroup: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
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
      matches: false,
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

afterEach(cleanup);
