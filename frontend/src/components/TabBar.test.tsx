import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import TabBar from './TabBar';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderTabBar(props: Partial<Parameters<typeof TabBar>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TabBar
        activeTab="home"
        onTabChange={vi.fn()}
        savedCount={0}
        {...props}
      />
    </I18nextProvider>,
  );
}

describe('TabBar', () => {
  it('renders 3 tabs', () => {
    renderTabBar();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
  });

  it('labels the primary address entry tab as Search', () => {
    renderTabBar();
    expect(screen.getByRole('tab', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('marks active tab', () => {
    renderTabBar({ activeTab: 'saved' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange when tab clicked', () => {
    const onTabChange = vi.fn();
    renderTabBar({ onTabChange });
    fireEvent.click(screen.getAllByRole('tab')[2]); // saved tab
    expect(onTabChange).toHaveBeenCalledWith('saved');
  });

  it('shows badge count on saved tab when > 0', () => {
    renderTabBar({ savedCount: 3 });
    const badge = document.querySelector('.tab-bar__badge');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('3');
  });

  it('hides badge when count is 0', () => {
    renderTabBar({ savedCount: 0 });
    expect(document.querySelector('.tab-bar__badge')).not.toBeInTheDocument();
  });

  it('has navigation role', () => {
    renderTabBar();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
