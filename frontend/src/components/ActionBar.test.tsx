import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ActionBar from './ActionBar';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
  // ActionBar bookmark animation is intentionally skipped when reduced-motion is active.
  // Override the global mock (setup.ts defaults to reduced-motion: true for AnimatedScore)
  // so animation tests can verify the saving/removing CSS classes.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function renderActionBar(props: Partial<Parameters<typeof ActionBar>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ActionBar {...props} />
    </I18nextProvider>,
  );
}

describe('ActionBar', () => {
  it('renders two buttons', () => {
    const { container } = renderActionBar();
    const btns = container.querySelectorAll('.action-bar__btn');
    expect(btns.length).toBe(2);
  });

  it('shows "Save" when not bookmarked', () => {
    const { container } = renderActionBar({ isBookmarked: false });
    const secondary = container.querySelector('.action-bar__btn--secondary');
    expect(secondary?.textContent).toBe('Save');
  });

  it('shows "Saved" when bookmarked', () => {
    const { container } = renderActionBar({ isBookmarked: true });
    const saved = container.querySelector('.action-bar__btn--saved');
    expect(saved?.textContent).toBe('Saved');
  });

  it('sets aria-pressed on bookmark button', () => {
    const { container } = renderActionBar({ isBookmarked: true });
    const secondary = container.querySelector('.action-bar__btn--secondary');
    expect(secondary).toHaveAttribute('aria-pressed', 'true');
  });

  it('animates bookmark icon to saving state on user-initiated save', () => {
    const onSave = vi.fn();
    const { rerender, container } = render(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked={false} onAddToShortlist={onSave} />
      </I18nextProvider>,
    );

    // Simulate user clicking the bookmark button
    const secondary = container.querySelector('.action-bar__btn--secondary');
    fireEvent.click(secondary!);

    // Parent re-renders with new bookmark state (as happens in real app)
    rerender(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked onAddToShortlist={onSave} />
      </I18nextProvider>,
    );

    const icon = container.querySelector('.action-bar__bookmark-icon');
    expect(icon).toHaveClass('action-bar__bookmark-icon--saving');
  });

  it('does NOT animate on programmatic prop change (hydration regression)', () => {
    const { rerender, container } = render(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked={false} />
      </I18nextProvider>,
    );

    // Prop flips without user click (e.g. shortlist loaded from localStorage)
    rerender(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked />
      </I18nextProvider>,
    );

    const icon = container.querySelector('.action-bar__bookmark-icon');
    expect(icon).not.toHaveClass('action-bar__bookmark-icon--saving');
  });

  it('fires navigator.vibrate(10) on user-initiated save', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      writable: true,
      configurable: true,
    });

    const onSave = vi.fn();
    const { rerender, container } = render(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked={false} onAddToShortlist={onSave} />
      </I18nextProvider>,
    );

    // Simulate user clicking the bookmark button
    const secondary = container.querySelector('.action-bar__btn--secondary');
    fireEvent.click(secondary!);

    rerender(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked onAddToShortlist={onSave} />
      </I18nextProvider>,
    );

    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('does NOT vibrate on programmatic prop change (hydration regression)', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrate,
      writable: true,
      configurable: true,
    });

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked={false} />
      </I18nextProvider>,
    );

    // Prop flips without user click
    rerender(
      <I18nextProvider i18n={i18n}>
        <ActionBar isBookmarked />
      </I18nextProvider>,
    );

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does NOT animate when mounted with isBookmarked={true} (direct hydration)', () => {
    const { container } = renderActionBar({ isBookmarked: true });
    const icon = container.querySelector('.action-bar__bookmark-icon');
    expect(icon).not.toHaveClass('action-bar__bookmark-icon--saving');
  });

  it('fires onAddToShortlist when secondary button clicked', () => {
    const onClick = vi.fn();
    const { container } = renderActionBar({ onAddToShortlist: onClick });
    const secondary = container.querySelector('.action-bar__btn--secondary');
    fireEvent.click(secondary!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onPrimaryAction when primary button clicked', () => {
    const onClick = vi.fn();
    renderActionBar({ onPrimaryAction: onClick, primaryLabel: 'Unlock dossier' });
    fireEvent.click(document.querySelector('[data-testid="action-bar-primary"]')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderActionBar();
    expect(getByTestId('action-bar')).toBeInTheDocument();
  });

  it('renders the permanent action bar root without hidden-state accessibility flags', () => {
    const { getByTestId } = renderActionBar();
    const bar = getByTestId('action-bar');
    expect(bar.className).toBe('action-bar');
    expect(bar).not.toHaveAttribute('aria-hidden');
  });
});
