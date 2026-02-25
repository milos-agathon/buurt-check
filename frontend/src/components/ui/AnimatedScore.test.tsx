import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AnimatedScore from './AnimatedScore';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderScore(props: Parameters<typeof AnimatedScore>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AnimatedScore {...props} />
    </I18nextProvider>,
  );
}

describe('AnimatedScore', () => {
  it('renders the final value', () => {
    renderScore({ value: 75 });
    // aria-label should have final value for accessibility
    const el = screen.getByLabelText('75');
    expect(el).toBeInTheDocument();
  });

  it('respects prefers-reduced-motion by showing value instantly', () => {
    // Mock matchMedia to return reduced motion
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    renderScore({ value: 42 });
    expect(screen.getByLabelText('42')).toHaveTextContent('42');

    // Restore
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('applies custom className', () => {
    renderScore({ value: 80, className: 'my-score' });
    const el = screen.getByLabelText('80');
    expect(el).toHaveClass('my-score');
  });

  it('renders /100 scale when showScale is true', () => {
    renderScore({ value: 65, showScale: true });
    const el = screen.getByLabelText('65');
    expect(el.textContent).toContain('/100');
  });

  it('does not render scale text when showScale is false', () => {
    renderScore({ value: 65, showScale: false });
    const el = screen.getByLabelText('65');
    expect(el.textContent).not.toContain('/100');
  });

  it('starts counting when element enters viewport', async () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    const originalObserver = (window as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      observe() {}

      unobserve() {}

      disconnect() {}

      takeRecords() {
        return [];
      }
    }

    (window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

    renderScore({ value: 55, duration: 50 });
    const el = screen.getByLabelText('55');
    expect(el).toHaveTextContent('0');

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => {
      expect(el).toHaveTextContent('55');
    });

    (window as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver = originalObserver;
  });
});
