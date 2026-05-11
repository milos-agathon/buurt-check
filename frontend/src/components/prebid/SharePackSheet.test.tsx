import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import SharePackSheet from './SharePackSheet';

describe('SharePackSheet', () => {
  it('requires email consent and exposes provider fallback copy-link flow', async () => {
    const i18n = await setupTestI18n('en');
    const onCopyLink = vi.fn();
    const onEmail = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <SharePackSheet
          shareUrl="https://app.buurt-check.nl/#/shared-pack/token-1"
          providerUnavailable
          onCopyLink={onCopyLink}
          onEmail={onEmail}
          onClose={() => undefined}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Email provider unavailable/i);
    fireEvent.click(screen.getByRole('button', { name: /Copy scoped link/i }));
    expect(onCopyLink).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Create email share/i })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Email address/i }), { target: { value: 'buyer@example.com' } });
    fireEvent.click(screen.getByLabelText(/permission to use this email address/i));
    fireEvent.click(screen.getByRole('button', { name: /Create email share/i }));
    expect(onEmail).toHaveBeenCalledWith('buyer@example.com');
  });
});
