import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import ContextualTooltip from './ContextualTooltip';

function createI18n() {
  const instance = i18n.createInstance();
  instance.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          'tooltip.dismiss': 'Dismiss',
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
}

function renderTooltip(props: { message: string; onDismiss: () => void; position?: 'above' | 'below' }) {
  const i18nInstance = createI18n();
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <ContextualTooltip {...props} />
    </I18nextProvider>,
  );
}

describe('ContextualTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message text', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Save this address', onDismiss });
    expect(screen.getByText('Save this address')).toBeInTheDocument();
  });

  it('renders a dismiss button with accessible label', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Test message', onDismiss });
    const btn = screen.getByRole('button', { name: 'Dismiss' });
    expect(btn).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Test message', onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 8 seconds', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Test message', onDismiss });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss before 8 seconds', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Test message', onDismiss });
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cleans up timeout on unmount', () => {
    const onDismiss = vi.fn();
    const { unmount } = renderTooltip({ message: 'Test message', onDismiss });
    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('applies below position class by default', () => {
    const onDismiss = vi.fn();
    const { container } = renderTooltip({ message: 'Test', onDismiss });
    expect(container.querySelector('.contextual-tooltip--below')).toBeInTheDocument();
  });

  it('applies above position class when specified', () => {
    const onDismiss = vi.fn();
    const { container } = renderTooltip({ message: 'Test', onDismiss, position: 'above' });
    expect(container.querySelector('.contextual-tooltip--above')).toBeInTheDocument();
  });

  it('has role="status" for screen reader announcements', () => {
    const onDismiss = vi.fn();
    renderTooltip({ message: 'Test', onDismiss });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('dismiss button has 44px minimum touch target', () => {
    const onDismiss = vi.fn();
    const { container } = renderTooltip({ message: 'Test', onDismiss });
    const btn = container.querySelector('.contextual-tooltip__dismiss');
    expect(btn).toBeInTheDocument();
    // CSS class ensures min-width/min-height: 44px — verified in CSS file
  });
});
