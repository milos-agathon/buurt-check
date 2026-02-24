import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import {
  makeBuildingResponse,
  makeNeighborhood3DResponse,
  makeNeighborhoodStatsResponse,
  makeRiskComparisonsResponse,
  makeResolvedAddress,
  makeRiskCardsResponse,
  makeSuggestion,
  setupTestI18n,
} from './test/helpers';

vi.mock('./services/api', () => ({
  suggestAddresses: vi.fn(),
  lookupAddress: vi.fn(),
  lookupAddressByVbo: vi.fn(),
  getBuildingFacts: vi.fn(),
  getBuilding3D: vi.fn(),
  getNeighborhood3D: vi.fn(),
  getRiskCards: vi.fn(),
  getRiskComparisons: vi.fn(),
  getNeighborhoodStats: vi.fn(),
  getViewingQuestions: vi.fn(),
  getTierBData: vi.fn(),
  getPropertyWarnings: vi.fn(),
  getLivability: vi.fn(),
  submitSunlightAnalysis: vi.fn(),
}));

vi.mock('./components/NeighborhoodViewer3D', () => ({
  default: ({ buildings, loading }: { buildings: unknown[]; loading?: boolean }) => (
    <div data-testid="viewer-3d">
      {loading ? '3D Viewer loading...' : `3D Viewer (${buildings.length} buildings)`}
    </div>
  ),
}));

vi.mock('./components/ShadowTimeSlider', () => ({
  default: () => (
    <div data-testid="shadow-time-slider">
      Shadow time slider
    </div>
  ),
}));

vi.mock('./components/SunlightRiskCard', () => ({
  default: ({ loading, unavailable }: { loading?: boolean; unavailable?: boolean }) => (
    <div data-testid="sunlight-card">
      {loading ? 'Loading sunlight...' : unavailable ? 'Sunlight unavailable' : 'Sunlight card'}
    </div>
  ),
}));

vi.mock('./components/NeighborhoodStatsCard', () => ({
  default: ({ loading, error }: { loading?: boolean; error?: boolean }) => (
    <div data-testid="neighborhood-stats">
      {loading ? 'Loading neighborhood...' : error ? 'Neighborhood error' : 'Neighborhood stats'}
    </div>
  ),
}));

import {
  lookupAddress,
  lookupAddressByVbo,
  getBuildingFacts,
  getBuilding3D,
  suggestAddresses,
  getNeighborhood3D,
  getRiskCards,
  getRiskComparisons,
  getNeighborhoodStats,
  getViewingQuestions,
  getTierBData,
  getPropertyWarnings,
  getLivability,
  submitSunlightAnalysis,
} from './services/api';

const mockLookup = vi.mocked(lookupAddress);
const mockLookupByVbo = vi.mocked(lookupAddressByVbo);
const mockBuilding = vi.mocked(getBuildingFacts);
const mockBuilding3D = vi.mocked(getBuilding3D);
const mockSuggest = vi.mocked(suggestAddresses);
const mockNeighborhood3D = vi.mocked(getNeighborhood3D);
const mockRiskCards = vi.mocked(getRiskCards);
const mockRiskComparisons = vi.mocked(getRiskComparisons);
const mockNeighborhoodStats = vi.mocked(getNeighborhoodStats);
const mockViewingQuestions = vi.mocked(getViewingQuestions);
const mockTierBData = vi.mocked(getTierBData);
const mockPropertyWarnings = vi.mocked(getPropertyWarnings);
const mockLivability = vi.mocked(getLivability);
const mockSubmitSunlightAnalysis = vi.mocked(submitSunlightAnalysis);

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  mockLookup.mockReset();
  mockLookupByVbo.mockReset();
  mockBuilding.mockReset();
  mockBuilding3D.mockReset();
  mockSuggest.mockReset();
  mockNeighborhood3D.mockReset();
  mockRiskCards.mockReset();
  mockRiskComparisons.mockReset();
  mockNeighborhoodStats.mockReset();
  mockViewingQuestions.mockReset();
  mockTierBData.mockReset();
  mockPropertyWarnings.mockReset();
  mockLivability.mockReset();
  mockSubmitSunlightAnalysis.mockReset();

  mockLookupByVbo.mockResolvedValue(makeResolvedAddress({
    adresseerbaar_object_id: '0363010000696734',
  }));
  mockBuilding3D.mockResolvedValue(
    makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
  );
  mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
  mockRiskCards.mockResolvedValue(makeRiskCardsResponse());
  mockRiskComparisons.mockResolvedValue(makeRiskComparisonsResponse());
  mockNeighborhoodStats.mockResolvedValue(makeNeighborhoodStatsResponse());
  mockViewingQuestions.mockResolvedValue({ address_id: 'vbo-123', categories: [] });
  mockTierBData.mockResolvedValue({
    address_id: 'vbo-123',
    energy_label: { source: 'EP-Online' },
    crime: { source: 'CBS OData 47018NED/47022NED' },
  });
  mockPropertyWarnings.mockResolvedValue({
    address_id: 'vbo-123',
    attention_summary: { flag_count: 0, flags: [], risk_categories_assessed: 0, risk_categories_total: 4 },
    foundation_risk: { level: 'low', messages: [] },
    erfpacht: { detected: false, messages: [] },
    vve: { is_apartment: false, messages: [] },
    asbestos: { flagged: false, messages: [] },
    lead_pipe: { flagged: false, messages: [] },
  });
  mockLivability.mockResolvedValue({
    available: true,
    buurt_code: 'BU0363AB10',
    buurt_name: 'Testbuurt',
    gemeente: 'Amsterdam',
    year: '2024',
    overall_score: 7,
    overall_normalized: 75,
    dimensions: [],
    trend: [],
    comparison: [],
    source: 'Leefbaarometer 3.0',
    messages: [],
  });
  mockSubmitSunlightAnalysis.mockResolvedValue();
});

function renderApp() {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <App />
    </I18nextProvider>,
  );
}

async function selectAddress() {
  const suggestion = makeSuggestion();
  mockSuggest.mockResolvedValue({ suggestions: [suggestion] });

  fireEvent.change(screen.getByPlaceholderText('Paste or type an address...'), {
    target: { value: 'Keizers' },
  });
  vi.useFakeTimers();
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
  vi.useRealTimers();

  await waitFor(() => {
    expect(screen.getByRole('option')).toBeInTheDocument();
  });
  await act(async () => {
    fireEvent.mouseDown(screen.getByRole('option'));
    await Promise.resolve();
  });
}

describe('App risk retry integration', () => {
  it('renders the real risk retry button and retries risk cards from App', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValueOnce(new Error('Risk API down'));
    mockRiskCards.mockResolvedValueOnce(makeRiskCardsResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(
        screen.getByText('Risk data could not be loaded right now. Please try again later.'),
      ).toBeInTheDocument();
    });

    const riskSection = screen.getByTestId('risk-cards');
    const retryButton = within(riskSection).getByRole('button', { name: 'Retry' });
    expect(retryButton).toHaveClass('app__retry-button');
    expect(retryButton).toHaveClass('risk-cards__retry');

    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(
        screen.queryByText('Risk data could not be loaded right now. Please try again later.'),
      ).not.toBeInTheDocument();
    });
    expect(mockRiskCards).toHaveBeenCalledTimes(2);
  });
});
