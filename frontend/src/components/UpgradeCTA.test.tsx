import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../test/helpers';
import UpgradeCTA from './UpgradeCTA';

const mockTrackEvent = vi.fn();

vi.mock('../services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;
let observerCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = '';
  thresholds = [];
}

beforeEach(async () => {
  i18n = await setupTestI18n('en');
  mockTrackEvent.mockReset();
  observerCallback = null;
  (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

function renderUpgradeCTA(onUpgrade = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <UpgradeCTA onUpgrade={onUpgrade} price="3.99" />
    </I18nextProvider>,
  );
}

describe('UpgradeCTA', () => {
  it('renders title, included features, and CTA button', () => {
    renderUpgradeCTA();
    expect(screen.getByTestId('upgrade-cta')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /unlock the full dossier/i })).toBeInTheDocument();
    expect(screen.getByText(/Detailed property warning cards/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock full dossier/i })).toBeInTheDocument();
  });

  it('tracks click event and calls onUpgrade', () => {
    const onUpgrade = vi.fn();
    renderUpgradeCTA(onUpgrade);

    fireEvent.click(screen.getByRole('button', { name: /unlock full dossier/i }));

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_cta_clicked');
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('tracks viewed event once when entering viewport', () => {
    renderUpgradeCTA();
    expect(observerCallback).not.toBeNull();

    observerCallback?.([
      {
        isIntersecting: true,
        target: screen.getByTestId('upgrade-cta'),
        time: 0,
        intersectionRatio: 1,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
      },
    ], {} as IntersectionObserver);

    observerCallback?.([
      {
        isIntersecting: true,
        target: screen.getByTestId('upgrade-cta'),
        time: 1,
        intersectionRatio: 1,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
      },
    ], {} as IntersectionObserver);

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_cta_viewed');
  });
});

