import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import CompareScreen from '../components/CompareScreen';
import TierBSignalsCard from '../components/TierBSignalsCard';
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

describe('Performance budgets (unit-level)', () => {
  it('renders compare screen 20x under budget', () => {
    const start = performance.now();

    for (let i = 0; i < 20; i += 1) {
      const { unmount } = renderWithI18n(
        <CompareScreen
          onBack={() => {}}
          items={[
            {
              vboId: `vbo-a-${i}`,
              address: 'Keizersgracht 100',
              postcode: '1015AA',
              city: 'Amsterdam',
              savedAt: Date.now(),
              riskScores: { noise: 72, air: 64, climate: 55, sunlight: 60 },
            },
            {
              vboId: `vbo-b-${i}`,
              address: 'Herengracht 50',
              postcode: '1016BS',
              city: 'Amsterdam',
              savedAt: Date.now(),
              riskScores: { noise: 54, air: 70, climate: 63, sunlight: 57 },
            },
            {
              vboId: `vbo-c-${i}`,
              address: 'Prinsengracht 263',
              postcode: '1016GV',
              city: 'Amsterdam',
              savedAt: Date.now(),
              riskScores: { noise: 48, air: 58, climate: 77, sunlight: 52 },
            },
          ]}
        />,
      );
      unmount();
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1500);
  });

  it('renders Tier-B card 100x under budget', () => {
    const start = performance.now();

    for (let i = 0; i < 100; i += 1) {
      const { unmount } = renderWithI18n(
        <TierBSignalsCard
          data={{
            address_id: `vbo-${i}`,
            energy_label: {
              label: 'A',
              source: 'EP-Online',
              source_date: '2025-05-01',
            },
            crime: {
              total_per_1000: 12.5,
              burglary_per_1000: 1.1,
              violent_per_1000: 0.7,
              monthly_total_per_1000: 1.2,
              monthly_period: '2025MM12',
              source: 'CBS OData 47018NED/47022NED',
              source_date: '2025JJ00',
            },
          }}
        />,
      );
      unmount();
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1200);
  });
});
