import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import SharedPrebidScreen from './SharedPrebidScreen';
import { briefing, pack } from './testFixtures';

describe('SharedPrebidScreen', () => {
  it('does not render valid shared briefing content and still renders shared packs', async () => {
    const i18n = await setupTestI18n('en');
    const noop = () => undefined;

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <SharedPrebidScreen
          response={{ state: 'valid', mode: 'briefing', briefing }}
          onSearch={noop}
          onSaved={noop}
          onOpenPrivacy={noop}
          onOpenTerms={noop}
        />
      </I18nextProvider>,
    );
    expect(screen.queryByTestId('prebid-briefing-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /unavailable/i })).toBeInTheDocument();

    rerender(
      <I18nextProvider i18n={i18n}>
        <SharedPrebidScreen
          response={{ state: 'valid', mode: 'pack', pack }}
          onSearch={noop}
          onSaved={noop}
          onOpenPrivacy={noop}
          onOpenTerms={noop}
        />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('pack-view')).toBeInTheDocument();
  });

  it('renders expired shared recovery without silent redirect', async () => {
    const i18n = await setupTestI18n('en');
    const noop = () => undefined;

    render(
      <I18nextProvider i18n={i18n}>
        <SharedPrebidScreen
          response={{ state: 'expired', mode: 'pack', support_email: 'support@buurt-check.nl' }}
          onSearch={noop}
          onSaved={noop}
          onOpenPrivacy={noop}
          onOpenTerms={noop}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: /expired/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search an address/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open saved homes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact support/i })).toHaveAttribute('href', 'mailto:support@buurt-check.nl');
  });
});
