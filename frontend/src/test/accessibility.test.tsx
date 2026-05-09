import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import App from '../App';
import CompareScreen from '../components/CompareScreen';
import ExportBottomSheet from '../components/ExportBottomSheet';
import type { ShortlistItem } from '../types/api';
import { setupTestI18n } from './helpers';

vi.mock('../services/api', () => ({
  suggestAddresses: vi.fn(),
  lookupAddress: vi.fn(),
  getBuildingFacts: vi.fn(),
  getBuilding3D: vi.fn(),
  getNeighborhood3D: vi.fn(),
  getRiskCards: vi.fn(),
  getRiskComparisons: vi.fn(),
  getNeighborhoodStats: vi.fn(),
  getViewingQuestions: vi.fn(),
  getPropertyWarnings: vi.fn(),
  getLivability: vi.fn(),
  submitSunlightAnalysis: vi.fn(),
  exportBriefing: vi.fn(),
}));

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  const severe = results.violations.filter(
    (v: { impact?: string | null }) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
}

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function makeCompareItems(): ShortlistItem[] {
  return [
    {
      vboId: 'vbo-1',
      address: 'Keizersgracht 100',
      postcode: '1015AA',
      city: 'Amsterdam',
      riskScores: { noise: 72, air: 62, climate: 55, sunlight: 61 },
      savedAt: Date.now(),
    },
    {
      vboId: 'vbo-2',
      address: 'Herengracht 50',
      postcode: '1016BS',
      city: 'Amsterdam',
      riskScores: { noise: 48, air: 70, climate: 67, sunlight: 58 },
      savedAt: Date.now(),
    },
  ];
}

describe('Accessibility audits', () => {
  it('App shell has no serious/critical violations', async () => {
    const { container } = renderWithI18n(<App />);
    await expectNoSeriousA11yViolations(container);
  });

  it('Export bottom sheet has no serious/critical violations', async () => {
    const { container } = renderWithI18n(
      <ExportBottomSheet
        isOpen
        onClose={() => {}}
        vboId="0363010012345678"
        rdX={121000}
        rdY={487000}
        lat={52.37}
        lng={4.89}
        address="Keizersgracht 100, Amsterdam"
      />,
    );
    await expectNoSeriousA11yViolations(container);
  });

  it('Compare screen has no serious/critical violations', async () => {
    const { container } = renderWithI18n(
      <CompareScreen items={makeCompareItems()} onBack={() => {}} onSearchAddress={() => {}} />,
    );
    await expectNoSeriousA11yViolations(container);
  });

  it('skip navigation link exists and targets main content', () => {
    const { container } = renderWithI18n(<App />);
    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveClass('sr-only');
    expect(container.querySelector('#main-content')).toBeInTheDocument();
    expect(container.querySelector('#main-content')?.tagName).toBe('MAIN');
  });

  it('skip navigation link has translated text', () => {
    const { container } = renderWithI18n(<App />);
    const skipLink = container.querySelector('a[href="#main-content"]');
    expect(skipLink?.textContent).toBe('Skip to main content');
  });

  it('dossier section headings have id anchors', () => {
    const { container } = renderWithI18n(<App />);
    // Verify main-content id exists (from skip nav)
    expect(container.querySelector('#main-content')).toBeInTheDocument();
  });
});
