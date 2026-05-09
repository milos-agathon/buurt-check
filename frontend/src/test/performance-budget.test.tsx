import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import CompareScreen from '../components/CompareScreen';
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
          onSearchAddress={() => {}}
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
    expect(elapsed).toBeLessThan(2000);
  });

});
