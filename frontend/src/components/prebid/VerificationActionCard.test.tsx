import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import VerificationActionCard from './VerificationActionCard';
import { action } from './testFixtures';

describe('VerificationActionCard', () => {
  it('renders finding, source refs, recipients, question, request, confidence, and limitation', async () => {
    const i18n = await setupTestI18n('en');
    const onOpen = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <VerificationActionCard action={action} rank={1} onOpen={onOpen} />
      </I18nextProvider>,
    );

    expect(screen.getByText(action.finding)).toBeInTheDocument();
    expect(screen.getByText(action.ask_this.en)).toBeInTheDocument();
    expect(screen.getByText(action.request_this)).toBeInTheDocument();
    expect(screen.getByText(/Selling agent, Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/RIVM noise contours/i)).toBeInTheDocument();
    expect(screen.getByText(/Medium confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Modelled outdoor contours/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open evidence detail/i }));
    expect(onOpen).toHaveBeenCalledWith(action);
  });
});
