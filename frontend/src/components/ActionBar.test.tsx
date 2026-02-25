import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ActionBar from './ActionBar';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
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

  it('fires onAddToShortlist when secondary button clicked', () => {
    const onClick = vi.fn();
    const { container } = renderActionBar({ onAddToShortlist: onClick });
    const secondary = container.querySelector('.action-bar__btn--secondary');
    fireEvent.click(secondary!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onExportBriefing when primary button clicked', () => {
    const onClick = vi.fn();
    const { container } = renderActionBar({ onExportBriefing: onClick });
    const primary = container.querySelector('.action-bar__btn--primary');
    fireEvent.click(primary!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderActionBar();
    expect(getByTestId('action-bar')).toBeInTheDocument();
  });
});
