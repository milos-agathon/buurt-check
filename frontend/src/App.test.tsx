import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
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
}));

vi.mock('./components/NeighborhoodViewer3D', () => ({
  default: ({ buildings, loading }: { buildings: unknown[]; loading?: boolean }) => (
    <div data-testid="viewer-3d">
      {loading ? '3D Viewer loading...' : `3D Viewer (${buildings.length} buildings)`}
    </div>
  ),
}));

vi.mock('./components/SunlightRiskCard', () => ({
  default: ({ loading, unavailable, orientationDeg }: { loading?: boolean; unavailable?: boolean; orientationDeg?: number }) => (
    <div data-testid="sunlight-card" data-orientation={orientationDeg}>
      {loading ? 'Loading sunlight...' : unavailable ? 'Sunlight unavailable' : 'Sunlight card'}
    </div>
  ),
}));

vi.mock('./components/RiskCardsPanel', () => ({
  default: ({ loading, error }: { loading?: boolean; error?: boolean }) => (
    <div data-testid="risk-cards">
      {loading ? 'Loading risk cards...' : error ? 'Risk cards error' : 'Risk cards'}
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
} from './services/api';
const mockLookup = vi.mocked(lookupAddress);
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
let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(() => {
  mockLookup.mockReset();
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
  // Resolve Phase 1 quickly with empty data so dossier sheet expands while
  // Phase 2 neighborhood fetch still controls 3D content in tests.
  mockBuilding3D.mockResolvedValue(
    makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
  );
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
});

function renderApp() {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <App />
    </I18nextProvider>,
  );
}

/**
 * Simulates selecting an address: type query, trigger debounce, click suggestion.
 * Uses fake timers briefly to advance the 300ms debounce, then restores real timers
 * so waitFor can poll normally for async state updates.
 */
async function selectAddress() {
  const suggestion = makeSuggestion();
  mockSuggest.mockResolvedValue({ suggestions: [suggestion] });

  vi.useFakeTimers();
  const input = screen.getByRole('textbox');
  await act(async () => {
    fireEvent.change(input, { target: { value: 'keizersgracht' } });
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
  vi.useRealTimers();

  await waitFor(() => {
    expect(screen.getByRole('option')).toBeInTheDocument();
  });
  await act(async () => {
    fireEvent.mouseDown(screen.getByRole('option'));
  });
}

describe('initial render', () => {
  it('renders app title and search input', () => {
    renderApp();
    expect(screen.getByAltText('Buurt Check')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not render building card or map', () => {
    renderApp();
    expect(screen.queryByText('Building Facts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});

describe('address selection flow', () => {
  it('calls lookupAddress then getBuildingFacts on selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith(makeSuggestion().id);
    });
    await waitFor(() => {
      expect(mockBuilding).toHaveBeenCalledWith('vbo-123');
    });
    await waitFor(() => {
      expect(mockRiskCards).toHaveBeenCalledTimes(1);
    });
  });

  it('shows dossier sheet immediately when address selected', async () => {
    mockLookup.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    });
  });

  it('shows risk loading state while risk cards are fetching', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading risk cards...')).toBeInTheDocument();
    });
  });

  it('renders building facts after successful fetch', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
      expect(screen.getByText('0363100012345678')).toBeInTheDocument();
    });
  });

  it('skips getBuildingFacts when no vbo_id', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ adresseerbaar_object_id: undefined }));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalled();
    });
    expect(mockBuilding).not.toHaveBeenCalled();
  });

  it('passes only vboId to getBuildingFacts', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockBuilding).toHaveBeenCalledTimes(1);
    });
    expect(mockBuilding).toHaveBeenCalledWith('vbo-123');
  });
});

describe('error handling', () => {
  it('shows error when lookupAddress fails', async () => {
    mockLookup.mockRejectedValue(new Error('Lookup failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error when getBuildingFacts fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockRejectedValue(new Error('Building failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('clears error on new selection', async () => {
    mockLookup.mockRejectedValueOnce(new Error('fail'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });

    // Second selection succeeds
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    await selectAddress();

    await waitFor(() => {
      expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
    });
  });

  it('does not crash when getRiskCards fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValue(new Error('Risk API down'));

    renderApp();
    await selectAddress();

    // Should still render building facts card without error
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    // No error shown to user for risk cards failure
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });

  it('clears previous building data on new selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('0363100012345678')).toBeInTheDocument();
    });

    // New selection — building data should be cleared during loading
    mockLookup.mockReturnValue(new Promise(() => {}));
    await selectAddress();

    await waitFor(() => {
      expect(screen.queryByText('0363100012345678')).not.toBeInTheDocument();
    });
  });
});

describe('map rendering', () => {
  it('renders map when lat/lng present', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeInTheDocument();
    });
  });
});

describe('3D viewer integration', () => {
  it('renders 3D viewer when neighborhood data is available', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/2 buildings/)).toBeInTheDocument();
    });
  });

  it('does not crash when getNeighborhood3D fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();

    // Should still render building facts card without error
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    expect(screen.getByText(/1 buildings/)).toBeInTheDocument();
    // No error shown to user for 3D failure
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
    // Loading indicator should not be stuck after failure
    expect(screen.queryByText('Loading 3D data...')).not.toBeInTheDocument();
  });

  it('shows sunlight unavailable when 3D fetch fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Sunlight unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('shows loading message while 3D data is fetching', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    // Never-resolving promise to keep loading state active
    mockNeighborhood3D.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('3D Viewer loading...')).toBeInTheDocument();
    });
    expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
  });

  it('keeps instant target building when both 3D endpoints return empty context', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockBuilding3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/1 buildings/)).toBeInTheDocument();
    });
    expect(screen.queryByText('No 3D building data available.')).not.toBeInTheDocument();
  });

  it('keeps phase-1 target building when neighborhood fetch returns empty', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    const phase1 = makeNeighborhood3DResponse({
      buildings: [makeNeighborhood3DResponse().buildings[0]],
    });
    mockBuilding3D.mockResolvedValue(phase1);
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/1 buildings/)).toBeInTheDocument();
    });
    expect(screen.queryByText('No 3D building data available.')).not.toBeInTheDocument();
    expect(screen.getByText('Sunlight unavailable')).toBeInTheDocument();
  });

  it('shows sunlight unavailable when 3D returns empty buildings', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Sunlight unavailable')).toBeInTheDocument();
    });
    // Should NOT show loading spinner
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('shows sunlight loading when 3D has buildings and sunlight pending', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading sunlight...')).toBeInTheDocument();
    });
  });

  it('keeps sunlight loading when neighborhood omits target_pand_id but instant target exists', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading sunlight...')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
  });
});

describe('risk cards error handling', () => {
  it('shows risk error state when getRiskCards fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValue(new Error('Risk API down'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Risk cards error')).toBeInTheDocument();
    });
    // Building facts should still show
    expect(screen.getByText('Building Facts')).toBeInTheDocument();
  });

  it('clears risk error on new address selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValueOnce(new Error('Risk API down'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Risk cards error')).toBeInTheDocument();
    });

    // Second selection succeeds
    mockRiskCards.mockResolvedValue(makeRiskCardsResponse());
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Risk cards')).toBeInTheDocument();
    });
    expect(screen.queryByText('Risk cards error')).not.toBeInTheDocument();
  });
});

describe('neighborhood stats integration', () => {
  it('calls getNeighborhoodStats on address selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockNeighborhoodStats).toHaveBeenCalledTimes(1);
    });
  });

  it('calls getTierBData with resolved address context', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({
      buurt_code: 'BU0363AD07',
      postcode: '1015AA',
      house_number: '100',
      house_letter: 'A',
      addition: '1',
    }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockTierBData).toHaveBeenCalledWith('vbo-123', {
        buurtCode: 'BU0363AD07',
        postcode: '1015AA',
        houseNumber: '100',
        houseLetter: 'A',
        addition: '1',
      });
    });
  });

  it('passes buurt_code from resolved address', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ buurt_code: 'BU0363AD07' }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockNeighborhoodStats).toHaveBeenCalledWith(
        'vbo-123',
        52.3676,
        4.8846,
        'BU0363AD07',
      );
    });
  });

  it('renders neighborhood stats card after loading', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('neighborhood-stats')).toBeInTheDocument();
      expect(screen.getByText('Neighborhood stats')).toBeInTheDocument();
    });
  });

  it('does not crash when getNeighborhoodStats fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhoodStats.mockRejectedValue(new Error('CBS down'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });

  it('shows neighborhood error state when fetch fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhoodStats.mockRejectedValue(new Error('CBS down'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Neighborhood error')).toBeInTheDocument();
    });
  });
});

describe('livability unavailable flow', () => {
  it('renders unavailable card and does not open detail view when available:false', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockLivability.mockResolvedValue({ available: false, message: 'LIVABILITY_NO_DATA' });

    renderApp();
    await selectAddress();

    // Livability card should render with unavailable state
    await waitFor(() => {
      expect(screen.getByTestId('livability-card')).toBeInTheDocument();
    });
    expect(screen.getByText(/not available/i)).toBeInTheDocument();

    // Detail view should NOT be present (no tap handler when unavailable)
    expect(screen.queryByTestId('livability-detail')).not.toBeInTheDocument();
  });
});

describe('dossier section order (v7 canonical)', () => {
  it('renders sections in the full v7 canonical order', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    // Provide 3D data so viewer-3d and sunlight-card render deterministically
    const n3d = makeNeighborhood3DResponse();
    mockBuilding3D.mockResolvedValue(n3d);
    mockNeighborhood3D.mockResolvedValue(n3d);
    // Provide viewing questions so checklist renders
    mockViewingQuestions.mockResolvedValue({
      address_id: 'vbo-123',
      categories: [{
        name: 'general',
        name_nl: 'Algemeen',
        severity: 'moderate' as const,
        questions: [{ text_en: 'Check foundation', text_nl: 'Controleer fundering' }],
      }],
    });

    renderApp();
    await selectAddress();

    // Wait for all sections to render (including 3D and sunlight)
    await waitFor(() => {
      expect(screen.getByTestId('attention-summary')).toBeInTheDocument();
      expect(screen.getByTestId('address-header')).toBeInTheDocument();
      expect(screen.getByTestId('summary-strip')).toBeInTheDocument();
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
      expect(screen.getByTestId('risk-cards')).toBeInTheDocument();
      expect(screen.getByTestId('property-warnings')).toBeInTheDocument();
      expect(screen.getByTestId('soil-info-card')).toBeInTheDocument();
      expect(screen.getByTestId('livability-card')).toBeInTheDocument();
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByTestId('sunlight-card')).toBeInTheDocument();
      expect(screen.getByTestId('neighborhood-stats')).toBeInTheDocument();
      expect(screen.getByTestId('tier-b-card')).toBeInTheDocument();
      expect(screen.getByTestId('viewing-checklist')).toBeInTheDocument();
      expect(screen.getByTestId('action-bar')).toBeInTheDocument();
    });

    // Get the dossier sheet container and verify relative ordering
    const dossier = screen.getByTestId('dossier-sheet');
    const all = dossier.querySelectorAll(
      '[data-testid="attention-summary"], ' +
      '[data-testid="address-header"], ' +
      '[data-testid="summary-strip"], ' +
      '.building-card, ' +
      '[data-testid="risk-cards"], ' +
      '[data-testid="property-warnings"], ' +
      '[data-testid="soil-info-card"], ' +
      '[data-testid="livability-card"], ' +
      '[data-testid="viewer-3d"], ' +
      '[data-testid="sunlight-card"], ' +
      '[data-testid="neighborhood-stats"], ' +
      '[data-testid="tier-b-card"], ' +
      '[data-testid="viewing-checklist"], ' +
      '[data-testid="action-bar"]'
    );
    const order = Array.from(all).map((el) => {
      const tid = el.getAttribute('data-testid');
      if (tid === 'attention-summary') return 'attention';
      if (tid === 'address-header') return 'address-header';
      if (tid === 'summary-strip') return 'summary-strip';
      if (el.classList.contains('building-card')) return 'building';
      if (tid === 'risk-cards') return 'risk';
      if (tid === 'property-warnings') return 'warnings';
      if (tid === 'soil-info-card') return 'soil';
      if (tid === 'livability-card') return 'livability';
      if (tid === 'viewer-3d') return 'viewer-3d';
      if (tid === 'sunlight-card') return 'sunlight';
      if (tid === 'neighborhood-stats') return 'stats';
      if (tid === 'tier-b-card') return 'tierb';
      if (tid === 'viewing-checklist') return 'checklist';
      if (tid === 'action-bar') return 'actionbar';
      return 'unknown';
    });

    // Verify full v7 canonical order (tasks/todo.md:1076-1097)
    // AttentionSummary → AddressHeader → SummaryStrip → BuildingFacts →
    // RiskTiles → PropertyWarnings → SoilInfo → Livability →
    // 3D Viewer → Sunlight → NeighborhoodStats → TierB →
    // ViewingChecklist → ActionBar
    const expected = [
      'attention', 'address-header', 'summary-strip', 'building', 'risk',
      'warnings', 'soil', 'livability', 'viewer-3d', 'sunlight',
      'stats', 'tierb', 'checklist', 'actionbar',
    ];
    const filtered = order.filter(s => expected.includes(s));
    expect(filtered).toEqual(expected);
  });
});

describe('property warnings param forwarding', () => {
  it('calls getPropertyWarnings with constructionYear, numUnits, and municipality from building facts and resolved address', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ municipality: 'Amsterdam' }));
    mockBuilding.mockResolvedValue(makeBuildingResponse({
      building: {
        pand_id: '0363100012345678',
        construction_year: 1875,
        status: 'Pand in gebruik',
        status_en: 'Building in use',
        intended_use: ['woonfunctie'],
        intended_use_en: ['residential'],
        num_units: 4,
        floor_area_m2: 120,
      },
    }));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockPropertyWarnings).toHaveBeenCalledTimes(1);
    });
    expect(mockPropertyWarnings).toHaveBeenCalledWith(
      'vbo-123',
      121000,
      487000,
      {
        constructionYear: 1875,
        numUnits: 4,
        municipality: 'Amsterdam',
      },
    );
  });
});

describe('early 3D fetch from lookup pand_id', () => {
  it('starts 3D fetches from lookup pand_id before building facts resolves', async () => {
    const buildingDeferred = { resolve: (_v: ReturnType<typeof makeBuildingResponse>) => {} };
    mockLookup.mockResolvedValue(makeResolvedAddress({ pand_id: '0363100012253924' }));
    mockBuilding.mockReturnValue(
      new Promise<ReturnType<typeof makeBuildingResponse>>((resolve) => {
        buildingDeferred.resolve = resolve;
      }),
    );
    mockBuilding3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockBuilding3D).toHaveBeenCalledWith(
        'vbo-123',
        '0363100012253924',
        121000,
        487000,
        52.3676,
        4.8846,
      );
    });
    await waitFor(() => {
      expect(mockNeighborhood3D).toHaveBeenCalledWith(
        'vbo-123',
        '0363100012253924',
        121000,
        487000,
        52.3676,
        4.8846,
      );
    });

    // Clean up unresolved building promise to avoid async state updates after test end.
    await act(async () => {
      buildingDeferred.resolve(makeBuildingResponse());
      await Promise.resolve();
    });
  });

  it('does not start duplicate 3D pipeline when lookup pand_id is present', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ pand_id: '0363100012253924' }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockBuilding3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockBuilding3D).toHaveBeenCalled();
      expect(mockNeighborhood3D).toHaveBeenCalled();
    });
    expect(mockBuilding3D).toHaveBeenCalledTimes(1);
    expect(mockNeighborhood3D).toHaveBeenCalledTimes(1);
  });
});
