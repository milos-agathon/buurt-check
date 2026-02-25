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
    renderWithI18n(<TabBar activeTab="home" onTabChange={onTabChange} savedCount={2} hasDossier />);

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('home');

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Viewing checklist' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('briefing');

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Saved' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onTabChange).toHaveBeenCalledWith('saved');
  });

  it('TopBar language controls are keyboard operable', async () => {
    const user = userEvent.setup();
    renderWithI18n(<TopBar title="buurt-check" />);

    const en = screen.getByRole('radio', { name: 'EN' });
    const nl = screen.getByRole('radio', { name: 'NL' });
    expect(en).toHaveAttribute('aria-checked', 'true');

    await user.tab(); // logo link
    await user.tab(); // NL button
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
    expect(screen.getByRole('button', { name: /^Save$|^Opslaan$/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { name: /Download viewing checklist|Bezichtigingschecklist downloaden/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
