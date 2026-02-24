import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import TopBar from './TopBar';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderTopBar(props: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TopBar title="buurt-check" {...props} />
    </I18nextProvider>,
  );
}

describe('TopBar', () => {
  it('renders logo when title is buurt-check', () => {
    renderTopBar();
    expect(screen.getByAltText('Buurt Check')).toBeInTheDocument();
    expect(screen.getByLabelText('Buurt Check home')).toBeInTheDocument();
  });

  it('renders text title for non-default screens', () => {
    renderTopBar({ title: 'Saved Homes' });
    expect(screen.getByText('Saved Homes')).toBeInTheDocument();
    expect(screen.queryByAltText('Buurt Check')).not.toBeInTheDocument();
  });

  it('renders language toggle with EN and NL', () => {
    renderTopBar();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('NL')).toBeInTheDocument();
  });

  it('marks current language as active', () => {
    renderTopBar();
    const enBtn = screen.getByText('EN');
    expect(enBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('switches language on NL click', () => {
    renderTopBar();
    fireEvent.click(screen.getByText('NL'));
    const nlBtn = screen.getByText('NL');
    expect(nlBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('renders settings button when handler provided', () => {
    renderTopBar({ onSettingsClick: vi.fn() });
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('does not render settings button by default', () => {
    renderTopBar();
    expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument();
  });

  it('calls onSettingsClick when settings clicked', () => {
    const onClick = vi.fn();
    renderTopBar({ onSettingsClick: onClick });
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders translated aria labels in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <TopBar title="buurt-check" onSettingsClick={vi.fn()} />
      </I18nextProvider>,
    );

    expect(screen.getByLabelText('Startpagina Buurt Check')).toBeInTheDocument();
    expect(screen.getByLabelText('Taal')).toBeInTheDocument();
    expect(screen.getByLabelText('Instellingen')).toBeInTheDocument();
  });
});
