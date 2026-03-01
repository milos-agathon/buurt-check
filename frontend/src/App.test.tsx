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
  makeSunlightResult,
  makeSuggestion,
  setupTestI18n,
} from './test/helpers';

type MockNeighborhoodViewer3DProps = {
  buildings: unknown[];
  loading?: boolean;
  onSunlightAnalysis?: (result: unknown) => void;
};

const neighborhoodViewer3DPropsRef = vi.hoisted(
  () => ({ current: null as MockNeighborhoodViewer3DProps | null }),
);

vi.mock('./services/api', async () => {
  const actual = await vi.importActual<typeof import('./services/api')>('./services/api');
  return {
    createShortReport: vi.fn(),
    checkEntitlement: vi.fn(),
    createCheckoutSession: vi.fn(),
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
    submitSunlightAnalysis: vi.fn(),
    mapApiError: actual.mapApiError,
    ApiError: actual.ApiError,
  };
});

vi.mock('./config/pricing', () => ({
  fetchPrice: vi.fn().mockResolvedValue('14.99'),
  getDossierPrice: vi.fn(() => '14.99'),
}));

vi.mock('./components/NeighborhoodViewer3D', () => ({
  default: (props: MockNeighborhoodViewer3DProps) => {
    neighborhoodViewer3DPropsRef.current = props;
    const { buildings, loading } = props;
    return (
    <div data-testid="viewer-3d">
      {loading ? '3D Viewer loading...' : `3D Viewer (${buildings.length} buildings)`}
    </div>
    );
  },
}));

vi.mock('./components/ShadowTimeSlider', () => ({
  default: () => (
    <div data-testid="shadow-time-slider">Shadow time slider</div>
  ),
}));

vi.mock('./components/SunlightRiskCard', () => ({
  default: ({ loading, unavailable, orientationDeg }: { loading?: boolean; unavailable?: boolean; orientationDeg?: number }) => (
    <div data-testid="sunlight-card" data-orientation={orientationDeg}>
      {loading ? 'Loading sunlight...' : unavailable ? 'Sunlight unavailable' : 'Sunlight card'}
    </div>
  ),
}));

vi.mock('./components/NeighborhoodStatsCard', () => ({
  default: ({ loading, error }: { loading?: boolean; error?: string | null }) => (
    <div data-testid="neighborhood-stats">
      {loading ? 'Loading neighborhood...' : error ? 'Neighborhood error' : 'Neighborhood stats'}
    </div>
  ),
}));

import {
  checkEntitlement,
  createCheckoutSession,
  createShortReport,
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
  submitSunlightAnalysis,
} from './services/api';
const mockLookup = vi.mocked(lookupAddress);
const mockCreateShortReport = vi.mocked(createShortReport);
const mockCheckEntitlement = vi.mocked(checkEntitlement);
const mockCreateCheckoutSession = vi.mocked(createCheckoutSession);
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
  localStorage.clear();
  sessionStorage.clear();
  // Reset IntersectionObserver globals between tests to prevent leakage
  (globalThis as Record<string, unknown>).__intersectionObserverCallback = null;
  (globalThis as Record<string, unknown>).__intersectionObserverTarget = null;
  mockCreateShortReport.mockReset();
  mockCheckEntitlement.mockReset();
  mockCreateCheckoutSession.mockReset();
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
  mockSubmitSunlightAnalysis.mockReset();
  neighborhoodViewer3DPropsRef.current = null;
  mockCreateShortReport.mockResolvedValue({
    report_id: 'report-123',
    report_type: 'short',
    already_purchased: false,
  });
  mockCheckEntitlement.mockResolvedValue({
    report_id: 'report-123',
    entitled: true,
    report_type: 'short',
  });
  mockCreateCheckoutSession.mockResolvedValue({
    checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  });
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

/**
 * Simulates the 3D section scrolling into the viewport by triggering the
 * IntersectionObserver that watches the viewer-3d-sentinel element.
 * Must be called after selectAddress() so the observer has been created.
 *
 * Uses the array-based mock to find the observer whose target is the sentinel,
 * avoiding conflicts with AnimatedScore observers that also use IntersectionObserver.
 */
interface MockObserverEntry { callback: IntersectionObserverCallback; targets: Set<Element>; disconnected: boolean }
async function triggerViewer3DIntersection() {
  // Wait for the sentinel element to be observed
  await waitFor(() => {
    const observers = (globalThis as Record<string, unknown>).__intersectionObservers as MockObserverEntry[];
    const sentinel = document.querySelector('[data-testid="viewer-3d-sentinel"]');
    expect(sentinel).not.toBeNull();
    const match = observers.find(o => !o.disconnected && sentinel && o.targets.has(sentinel));
    expect(match).toBeDefined();
  });

  const observers = (globalThis as Record<string, unknown>).__intersectionObservers as MockObserverEntry[];
  const sentinel = document.querySelector('[data-testid="viewer-3d-sentinel"]')!;
  const match = observers.find(o => !o.disconnected && o.targets.has(sentinel))!;
  await act(async () => {
    match.callback([{
      isIntersecting: true,
      target: sentinel,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: 1,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    }], {} as IntersectionObserver);
  });
}

/**
 * Simulates selecting an address: type query, trigger debounce, click suggestion.
 * Uses fake timers briefly to advance the 300ms debounce, then restores real timers
 * so waitFor can poll normally for async state updates.
 *
 * If the search screen is not visible (e.g. we're on the dossier screen),
 * navigates to the Home tab first so the combobox is rendered.
 */
async function selectAddress() {
  const suggestion = makeSuggestion();
  mockSuggest.mockResolvedValue({ suggestions: [suggestion] });

  // If on the dossier/briefing screen, navigate to Home tab first
  if (!screen.queryByRole('combobox')) {
    const homeTab = screen.getByRole('tab', { name: 'Home' });
    await act(async () => {
      fireEvent.click(homeTab);
    });
  }

  vi.useFakeTimers();
  const input = screen.getByRole('combobox');
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
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not render building card or map', () => {
    renderApp();
    expect(screen.queryByText('Building Facts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});

describe('tab content transitions', () => {
  it('renders saved content after switching tabs', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    await waitFor(() => {
      expect(screen.getByTestId('shortlist-screen')).toBeInTheDocument();
    });
  });
});

describe('hash route recovery', () => {
  it('redirects bare dossier hash without lookup to search and shows a toast', async () => {
    window.location.hash = '#/address/0363100012345678';
    renderApp();

    await waitFor(() => {
      expect(window.location.hash).toBe('#/search');
    });
    expect(
      screen.getByText("We couldn't reopen this address. Try searching for it again."),
    ).toBeInTheDocument();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('address selection flow', () => {
  it('calls lookupAddress then getBuildingFacts on selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith(makeSuggestion().id, expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(mockBuilding).toHaveBeenCalledWith('vbo-123', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(mockRiskCards).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading screen immediately when address selected', async () => {
    mockLookup.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dossier-sheet')).not.toBeInTheDocument();
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
    expect(mockBuilding).toHaveBeenCalledWith('vbo-123', expect.any(AbortSignal));
  });
});

describe('error handling', () => {
  it('shows error when lookupAddress fails', async () => {
    mockLookup.mockRejectedValue(new Error('Lookup failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong on our end. Your data is safe — try refreshing.')).toBeInTheDocument();
    });
  });

  it('shows error when getBuildingFacts fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockRejectedValue(new Error('Building failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong on our end. Your data is safe — try refreshing.')).toBeInTheDocument();
    });
  });

  it('clears error on new selection', async () => {
    mockLookup.mockRejectedValueOnce(new Error('fail'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong on our end. Your data is safe — try refreshing.')).toBeInTheDocument();
    });

    // Second selection succeeds
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
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
    expect(screen.queryByText('Something went wrong on our end. Your data is safe — try refreshing.')).not.toBeInTheDocument();
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
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/2 buildings/)).toBeInTheDocument();
    });
  });

  it('submits sunlight analysis only once when irradiance enrichment triggers a second callback', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis).toBeTypeOf('function');
    });

    const baseResult = makeSunlightResult({ svf: 0.63 });
    const enrichedResult = {
      ...baseResult,
      irradianceKwhM2: 948.4,
      irradianceDirectKwhM2: 612.1,
      irradianceDiffuseKwhM2: 336.3,
    };

    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(baseResult);
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(enrichedResult);
    });

    await waitFor(() => {
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalledTimes(1);
    });
    expect(mockSubmitSunlightAnalysis).toHaveBeenCalledWith('vbo-123', baseResult, 'report-123');
  });

  it('does not crash when getNeighborhood3D fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    // Should still render building facts card without error
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    expect(screen.getByText(/1 buildings/)).toBeInTheDocument();
    // No error shown to user for 3D failure
    expect(screen.queryByText('Something went wrong on our end. Your data is safe — try refreshing.')).not.toBeInTheDocument();
    // Loading indicator should not be stuck after failure
    expect(screen.queryByText('Loading 3D data...')).not.toBeInTheDocument();
  });

  it('does not render sunlight card when 3D fetch fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('shows loading message while 3D data is fetching', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    // Never-resolving promise to keep loading state active
    mockNeighborhood3D.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

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
    await triggerViewer3DIntersection();

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
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/1 buildings/)).toBeInTheDocument();
    });
    expect(screen.queryByText('No 3D building data available.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
  });

  it('does not render sunlight card when 3D returns empty buildings', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('does not render sunlight loading card when sunlight is pending', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('does not render sunlight card when neighborhood omits target_pand_id', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
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
    }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockTierBData).toHaveBeenCalledWith('vbo-123', {
        buurtCode: 'BU0363AD07',
      }, expect.any(AbortSignal), 'report-123');
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
        expect.any(AbortSignal),
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
    expect(screen.queryByText('Something went wrong on our end. Your data is safe — try refreshing.')).not.toBeInTheDocument();
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
    expect(screen.getByText(/leefbaarometer coverage/i)).toBeInTheDocument();

    // Detail view should NOT be present (no tap handler when unavailable)
    expect(screen.queryByTestId('livability-detail')).not.toBeInTheDocument();
  });
});

describe('dossier section order (v7 canonical)', () => {
  it('renders sections in the full v7 canonical order', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    // Provide 3D data so viewer-3d renders deterministically
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
    await triggerViewer3DIntersection();

    // Wait for all sections to render in the viewer
    await waitFor(() => {
      expect(screen.getByTestId('attention-summary')).toBeInTheDocument();
      expect(screen.getByTestId('address-header')).toBeInTheDocument();
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
      expect(document.querySelector('.risk-tiles-grid')).toBeInTheDocument();
      expect(screen.getByTestId('property-warnings')).toBeInTheDocument();
      expect(screen.getByTestId('livability-card')).toBeInTheDocument();
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
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
      '.building-card, ' +
      '.risk-tiles-grid, ' +
      '[data-testid="property-warnings"], ' +
      '[data-testid="livability-card"], ' +
      '[data-testid="viewer-3d"], ' +
      '[data-testid="neighborhood-stats"], ' +
      '[data-testid="tier-b-card"], ' +
      '[data-testid="viewing-checklist"], ' +
      '[data-testid="action-bar"]'
    );
    const order = Array.from(all).map((el) => {
      const tid = el.getAttribute('data-testid');
      if (tid === 'attention-summary') return 'attention';
      if (tid === 'address-header') return 'address-header';
      if (el.classList.contains('building-card')) return 'building';
      if (el.classList.contains('risk-tiles-grid')) return 'risk';
      if (tid === 'property-warnings') return 'warnings';
      if (tid === 'livability-card') return 'livability';
      if (tid === 'viewer-3d') return 'viewer-3d';
      if (tid === 'neighborhood-stats') return 'stats';
      if (tid === 'tier-b-card') return 'tierb';
      if (tid === 'viewing-checklist') return 'checklist';
      if (tid === 'action-bar') return 'actionbar';
      return 'unknown';
    });

    // Verify canonical dossier order:
    // AttentionSummary → AddressHeader → BuildingFacts →
    // RiskTiles → PropertyWarnings → Livability →
    // 3D Viewer → NeighborhoodStats → TierB →
    // ViewingChecklist → ActionBar
    const expected = [
      'attention', 'address-header', 'building', 'risk',
      'warnings', 'livability', 'viewer-3d',
      'stats', 'tierb', 'checklist', 'actionbar',
    ];
    const filtered = order.filter(s => expected.includes(s));
    expect(filtered).toEqual(expected);
  });

  it('applies stagger indexes to dossier sections for reveal animation', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    const n3d = makeNeighborhood3DResponse();
    mockBuilding3D.mockResolvedValue(n3d);
    mockNeighborhood3D.mockResolvedValue(n3d);
    mockViewingQuestions.mockResolvedValue({
      address_id: 'vbo-123',
      categories: [{ name: 'general', name_nl: 'Algemeen', severity: 'moderate', questions: [{ text_en: 'Q', text_nl: 'V' }] }],
    });

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('action-bar')).toBeInTheDocument();
    });

    const dossier = screen.getByTestId('dossier-sheet');
    const sections = Array.from(dossier.querySelectorAll('.dossier-section'));
    const indexes = sections
      .map((section) => Number(section.getAttribute('data-section-index')))
      .filter((value) => Number.isInteger(value));
    const uniqueIndexes = [...new Set(indexes)];

    expect(indexes).toEqual(uniqueIndexes);
    expect(uniqueIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    sections.forEach((section) => {
      const attr = section.getAttribute('data-section-index');
      if (attr == null) return;
      expect((section as HTMLElement).style.getPropertyValue('--section-index')).toBe(attr);
    });
  });
});

describe('tab transition reduced-motion safety', () => {
  it('tab screen wrappers have no inline opacity/transition styles (Framer-only motion)', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    });

    // All .app__screen divs should have no inline opacity or transition CSS
    // Tab transitions must come exclusively from Framer Motion (covered by MotionConfig reducedMotion="user")
    const screens = document.querySelectorAll('.app__screen');
    screens.forEach((el) => {
      const style = (el as HTMLElement).style;
      expect(style.transition).toBe('');
      expect(style.opacity).toBe('');
    });
  });

  // MotionConfig reducedMotion="user" wrapping is tested in main.test.tsx.
  // Combined with the assertion above (no inline transition/opacity), this ensures
  // all tab screen motion comes exclusively from Framer Motion (which respects
  // prefers-reduced-motion via MotionConfig).
});

describe('dossier jump navigation', () => {
  it('shows a back-to-top button and scrolls to the top', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    });

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 420 });

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    const topButton = await screen.findByRole('button', { name: 'Top' });
    scrollToSpy.mockClear();

    await act(async () => {
      fireEvent.click(topButton);
    });

    const dossierRoot = document.getElementById('dossier-content') as HTMLElement | null;
    const usedWindowScroll = scrollToSpy.mock.calls.some((call) => {
      const optionArg = call[0] as ScrollToOptions | number | undefined;
      return typeof optionArg === 'object' && optionArg?.top === 0;
    });
    const usedContainerScroll = dossierRoot?.scrollTop === 0;
    expect(usedWindowScroll || usedContainerScroll).toBe(true);
    scrollToSpy.mockRestore();
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
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
      expect(mockPropertyWarnings).toHaveBeenCalled();
    });
    expect(mockPropertyWarnings).toHaveBeenLastCalledWith(
      'vbo-123',
      121000,
      487000,
      {
        constructionYear: 1875,
        numUnits: 4,
        municipality: 'Amsterdam',
      },
      expect.any(AbortSignal),
      'report-123',
    );
  });
});

describe('early 3D fetch from lookup pand_id', () => {
  it('starts 3D fetches from lookup pand_id after building facts resolves', async () => {
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

    expect(mockBuilding3D).not.toHaveBeenCalled();
    expect(mockNeighborhood3D).not.toHaveBeenCalled();

    await act(async () => {
      buildingDeferred.resolve(makeBuildingResponse());
      await Promise.resolve();
    });

    // After building facts resolves, deferred3DParams are set and observer is re-attached.
    // Trigger the IntersectionObserver to start the actual 3D fetches.
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(mockBuilding3D).toHaveBeenCalledWith(
        'vbo-123',
        '0363100012253924',
        121000,
        487000,
        52.3676,
        4.8846,
        expect.any(AbortSignal),
        'report-123',
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
        expect.any(AbortSignal),
        'report-123',
      );
    });
  });

  it('does not start duplicate 3D pipeline when lookup pand_id is present', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ pand_id: '0363100012253924' }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockBuilding3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(mockBuilding3D).toHaveBeenCalled();
      expect(mockNeighborhood3D).toHaveBeenCalled();
    });
    expect(mockBuilding3D).toHaveBeenCalledTimes(1);
    expect(mockNeighborhood3D).toHaveBeenCalledTimes(1);
  });
});
