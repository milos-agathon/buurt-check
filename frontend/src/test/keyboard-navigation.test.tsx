import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import ActionBar from '../components/ActionBar';
import TabBar from '../components/TabBar';
import TopBar from '../components/TopBar';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderWithI18n(ui: ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('Keyboard navigation', () => {
  it('TabBar tabs can be activated with keyboard', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    renderWithI18n(<TabBar activeTab="search" onTabChange={onTabChange} savedCount={2} />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Search' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('search');

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Briefing' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('briefing');
  });

  it('TopBar language controls are keyboard operable', async () => {
    const user = userEvent.setup();
    renderWithI18n(<TopBar title="buurt-check" />);

    const en = screen.getByRole('radio', { name: 'EN' });
    const nl = screen.getByRole('radio', { name: 'NL' });
    expect(en).toHaveAttribute('aria-checked', 'true');

    await user.tab();
    await user.tab();
    expect(nl).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(nl).toHaveAttribute('aria-checked', 'true');
  });

  it('ActionBar primary actions are keyboard operable', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onExport = vi.fn();
    renderWithI18n(
      <ActionBar onAddToShortlist={onAdd} onExportBriefing={onExport} />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: /Add to Shortlist|Opslaan in lijst/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { name: /Export Briefing|Exporteer briefing/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
