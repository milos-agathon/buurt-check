import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import VerificationActionDetailSheet from './VerificationActionDetailSheet';
import { action } from './testFixtures';

describe('VerificationActionDetailSheet', () => {
  it('renders complete action detail and closes with the close button', async () => {
    const i18n = await setupTestI18n('en');
    const onClose = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <VerificationActionDetailSheet action={action} onClose={onClose} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('dialog', { name: action.finding })).toBeInTheDocument();
    expect(screen.getByText(action.why_it_matters)).toBeInTheDocument();
    expect(screen.getByText(action.ask_this.en)).toBeInTheDocument();
    expect(screen.getByText(action.request_this)).toBeInTheDocument();
    expect(screen.getByText(/Selling agent, Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-03/i)).toBeInTheDocument();
    expect(screen.getAllByText(/checked/i).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
