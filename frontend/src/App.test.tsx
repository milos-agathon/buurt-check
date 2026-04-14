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
  makeSunlightResult,
  makeSuggestion,
  setupTestI18n,
} from './test/helpers';
import { getShortlist } from './services/shortlist';

type MockNeighborhoodViewer3DProps = {
  buildings: unknown[];
  loading?: boolean;
  onSunlightAnalysis?: (result: unknown) => void;
  onSunlightError?: () => void;
  onShadowSnapshots?: (snapshots: unknown[]) => void;
  onShadowSnapshotsError?: () => void;
};

const neighborhoodViewer3DPropsRef = vi.hoisted(
  () => ({ current: null as MockNeighborhoodViewer3DProps | null }),
);
const pricingConfigRef = vi.hoisted(
  () => ({ current: { price: '3.99', webCheckoutAvailable: true, serverRenderAvailable: true } }),
);

vi.mock('./services/api', async () => {
  const actual = await vi.importActual<typeof import('./services/api')>('./services/api');
  return {
    createShortReport: vi.fn(),
    checkEntitlement: vi.fn(),
    confirmStripeCheckoutSession: vi.fn(),
    createCheckoutSession: vi.fn(),
    verifyAppleAppStorePurchase: vi.fn(),
    verifyGooglePlayPurchase: vi.fn(),
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
    prewarmShadowEvidence: vi.fn(),
    submitSunlightAnalysis: vi.fn(),
    exportBriefing: vi.fn(),
    downloadPdfBlob: vi.fn(),
    toSunlightSubmissionPayload: actual.toSunlightSubmissionPayload,
    mapApiError: actual.mapApiError,
    ApiError: actual.ApiError,
  };
});

vi.mock('./services/appleBilling', () => ({
  beginAppleBillingPurchase: vi.fn(),
  clearPendingAppleBillingReport: vi.fn(),
  findPendingAppleBillingPurchase: vi.fn(),
  finishAppleBillingTransaction: vi.fn(),
  getPendingAppleBillingReport: vi.fn(() => null),
  isAppleBillingCancelledError: vi.fn(() => false),
  isAppleBillingPendingError: vi.fn(() => false),
}));

vi.mock('./services/playBilling', () => ({
  beginPlayBillingPurchase: vi.fn(),
  clearPendingPlayBillingReport: vi.fn(),
  completePlayBillingPurchase: vi.fn(),
  consumePlayBillingPurchaseToken: vi.fn(),
  findRestorablePlayBillingPurchase: vi.fn(),
  getPendingPlayBillingReport: vi.fn(() => null),
  isPlayBillingContextAvailableSync: vi.fn(() => false),
  isPlayBillingReady: vi.fn().mockResolvedValue(false),
}));

vi.mock('./services/billingProvider', () => ({
  resolveBillingProvider: vi.fn().mockResolvedValue({ provider: 'stripe' }),
}));

vi.mock('./services/navigation', () => ({
  navigateToExternal: vi.fn(),
}));

vi.mock('./services/analytics', async () => {
  const actual = await vi.importActual<typeof import('./services/analytics')>('./services/analytics');
  return {
    ...actual,
    trackEvent: vi.fn(),
    trackPageView: vi.fn(),
  };
});

vi.mock('./config/pricing', () => ({
  fetchPrice: vi.fn().mockImplementation(async () => pricingConfigRef.current.price),
  getDossierPrice: vi.fn(() => pricingConfigRef.current.price),
  isWebCheckoutAvailable: vi.fn(() => pricingConfigRef.current.webCheckoutAvailable),
  isServerRenderAvailable: vi.fn(() => pricingConfigRef.current.serverRenderAvailable),
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

vi.mock('./components/NeighborhoodStatsCard', () => ({
  default: ({ loading, error }: { loading?: boolean; error?: string | null }) => (
    <div data-testid="neighborhood-stats">
      {loading ? 'Loading neighborhood...' : error ? 'Neighborhood error' : 'Neighborhood stats'}
    </div>
  ),
}));

import {
  ApiError,
  checkEntitlement,
  confirmStripeCheckoutSession,
  createCheckoutSession,
  createShortReport,
  verifyAppleAppStorePurchase,
  verifyGooglePlayPurchase,
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
  prewarmShadowEvidence,
  submitSunlightAnalysis,
  exportBriefing,
  downloadPdfBlob,
} from './services/api';
import {
  beginPlayBillingPurchase,
  clearPendingPlayBillingReport,
  completePlayBillingPurchase,
  consumePlayBillingPurchaseToken,
  findRestorablePlayBillingPurchase,
  getPendingPlayBillingReport,
  isPlayBillingContextAvailableSync,
  isPlayBillingReady,
} from './services/playBilling';
import {
  beginAppleBillingPurchase,
  clearPendingAppleBillingReport,
  findPendingAppleBillingPurchase,
  finishAppleBillingTransaction,
  getPendingAppleBillingReport,
  isAppleBillingCancelledError,
  isAppleBillingPendingError,
} from './services/appleBilling';
import { resolveBillingProvider } from './services/billingProvider';
import { navigateToExternal } from './services/navigation';
import { trackEvent } from './services/analytics';
const mockLookup = vi.mocked(lookupAddress);
const mockCreateShortReport = vi.mocked(createShortReport);
const mockCheckEntitlement = vi.mocked(checkEntitlement);
const mockConfirmStripeCheckoutSession = vi.mocked(confirmStripeCheckoutSession);
const mockCreateCheckoutSession = vi.mocked(createCheckoutSession);
const mockVerifyAppleAppStorePurchase = vi.mocked(verifyAppleAppStorePurchase);
const mockVerifyGooglePlayPurchase = vi.mocked(verifyGooglePlayPurchase);
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
const mockPrewarmShadowEvidence = vi.mocked(prewarmShadowEvidence);
const mockSubmitSunlightAnalysis = vi.mocked(submitSunlightAnalysis);
const mockExportBriefing = vi.mocked(exportBriefing);
const mockDownloadPdfBlob = vi.mocked(downloadPdfBlob);
const mockBeginPlayBillingPurchase = vi.mocked(beginPlayBillingPurchase);
const mockClearPendingPlayBillingReport = vi.mocked(clearPendingPlayBillingReport);
const mockCompletePlayBillingPurchase = vi.mocked(completePlayBillingPurchase);
const mockConsumePlayBillingPurchaseToken = vi.mocked(consumePlayBillingPurchaseToken);
const mockFindRestorablePlayBillingPurchase = vi.mocked(findRestorablePlayBillingPurchase);
const mockGetPendingPlayBillingReport = vi.mocked(getPendingPlayBillingReport);
const mockIsPlayBillingContextAvailableSync = vi.mocked(isPlayBillingContextAvailableSync);
const mockIsPlayBillingReady = vi.mocked(isPlayBillingReady);
const mockBeginAppleBillingPurchase = vi.mocked(beginAppleBillingPurchase);
const mockClearPendingAppleBillingReport = vi.mocked(clearPendingAppleBillingReport);
const mockFindPendingAppleBillingPurchase = vi.mocked(findPendingAppleBillingPurchase);
const mockFinishAppleBillingTransaction = vi.mocked(finishAppleBillingTransaction);
const mockGetPendingAppleBillingReport = vi.mocked(getPendingAppleBillingReport);
const mockIsAppleBillingCancelledError = vi.mocked(isAppleBillingCancelledError);
const mockIsAppleBillingPendingError = vi.mocked(isAppleBillingPendingError);
const mockResolveBillingProvider = vi.mocked(resolveBillingProvider);
const mockNavigateToExternal = vi.mocked(navigateToExternal);
const mockTrackEvent = vi.mocked(trackEvent);
let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(async () => {
  await i18nInstance.changeLanguage('en');
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  // Reset IntersectionObserver globals between tests to prevent leakage
  (globalThis as Record<string, unknown>).__intersectionObserverCallback = null;
  (globalThis as Record<string, unknown>).__intersectionObserverTarget = null;
  mockCreateShortReport.mockReset();
  mockCheckEntitlement.mockReset();
  mockConfirmStripeCheckoutSession.mockReset();
  mockCreateCheckoutSession.mockReset();
  mockVerifyAppleAppStorePurchase.mockReset();
  mockVerifyGooglePlayPurchase.mockReset();
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
  mockPrewarmShadowEvidence.mockReset();
  mockSubmitSunlightAnalysis.mockReset();
  mockExportBriefing.mockReset();
  mockDownloadPdfBlob.mockReset();
  mockBeginPlayBillingPurchase.mockReset();
  mockClearPendingPlayBillingReport.mockReset();
  mockCompletePlayBillingPurchase.mockReset();
  mockConsumePlayBillingPurchaseToken.mockReset();
  mockFindRestorablePlayBillingPurchase.mockReset();
  mockGetPendingPlayBillingReport.mockReset();
  mockIsPlayBillingContextAvailableSync.mockReset();
  mockIsPlayBillingReady.mockReset();
  mockBeginAppleBillingPurchase.mockReset();
  mockClearPendingAppleBillingReport.mockReset();
  mockFindPendingAppleBillingPurchase.mockReset();
  mockFinishAppleBillingTransaction.mockReset();
  mockGetPendingAppleBillingReport.mockReset();
  mockIsAppleBillingCancelledError.mockReset();
  mockResolveBillingProvider.mockReset();
  mockNavigateToExternal.mockReset();
  mockTrackEvent.mockReset();
  neighborhoodViewer3DPropsRef.current = null;
  pricingConfigRef.current = {
    price: '3.99',
    webCheckoutAvailable: true,
    serverRenderAvailable: true,
  };
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
  mockConfirmStripeCheckoutSession.mockResolvedValue({
    report_id: 'report-123',
    entitled: true,
    report_type: 'short',
  });
  mockCreateCheckoutSession.mockResolvedValue({
    checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  });
  mockVerifyAppleAppStorePurchase.mockResolvedValue({
    report_id: 'report-123',
    entitled: true,
    provider: 'apple_app_store',
    transaction_id: 'apple-transaction-123',
  });
  mockVerifyGooglePlayPurchase.mockResolvedValue({
    report_id: 'report-123',
    entitled: true,
    provider: 'google_play',
    consumed: true,
  });
  mockBeginAppleBillingPurchase.mockResolvedValue({
    productId: 'full_dossier_unlock',
    transactionId: 'apple-transaction-123',
    originalTransactionId: 'apple-original-123',
    signedTransactionInfo: 'signed-transaction',
  });
  mockFindPendingAppleBillingPurchase.mockResolvedValue(null);
  mockFinishAppleBillingTransaction.mockResolvedValue(undefined);
  mockGetPendingAppleBillingReport.mockReturnValue(null);
  mockIsAppleBillingCancelledError.mockReturnValue(false);
  mockIsAppleBillingPendingError.mockReturnValue(false);
  mockBeginPlayBillingPurchase.mockResolvedValue({
    productId: 'full_dossier_unlock',
    purchaseToken: 'purchase-token',
    paymentResponse: { complete: vi.fn().mockResolvedValue(undefined) } as unknown as PaymentResponse,
  });
  mockCompletePlayBillingPurchase.mockResolvedValue(undefined);
  mockConsumePlayBillingPurchaseToken.mockResolvedValue(undefined);
  mockFindRestorablePlayBillingPurchase.mockResolvedValue(null);
  mockGetPendingPlayBillingReport.mockReturnValue(null);
  mockIsPlayBillingContextAvailableSync.mockReturnValue(false);
  mockIsPlayBillingReady.mockResolvedValue(false);
  mockResolveBillingProvider.mockResolvedValue({ provider: 'stripe' });
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
    erfpacht: {
      detected: false,
      scope: 'municipality',
      verified_property_level: false,
      messages: [],
    },
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
  mockPrewarmShadowEvidence.mockResolvedValue({
    status: 'ready',
    facade_snapshot_count: 6,
    hero_snapshot_count: 3,
  });
  mockSubmitSunlightAnalysis.mockResolvedValue({
    status: 'ok',
    score: 50,
    severity: 'moderate',
    cached: true,
  });
  mockExportBriefing.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderApp() {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <App />
    </I18nextProvider>,
  );
}

function makeScoredRiskCards() {
  const base = makeRiskCardsResponse();
  return makeRiskCardsResponse({
    noise: { ...base.noise, score: 61, severity: 'moderate' },
    air_quality: { ...base.air_quality, score: 58, severity: 'moderate' },
    climate_stress: { ...base.climate_stress, score: 74, severity: 'good' },
    sunlight: {
      score: 67,
      severity: 'moderate',
      summary: 'Winter sunlight is acceptable.',
      summary_nl: 'Winterzonlicht is acceptabel.',
      winter_hours: 3.5,
      summer_hours: 9.5,
      equinox_hours: 6.0,
      svf_percent: 64,
      svf_score: 67,
      source: '3DBAG + SunCalc',
      source_date: '2026',
    },
  });
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
async function triggerIntersection(selector: string, isIntersecting = true) {
  // Wait for the sentinel element to be observed
  await waitFor(() => {
    const observers = (globalThis as Record<string, unknown>).__intersectionObservers as MockObserverEntry[];
    const target = document.querySelector(selector);
    expect(target).not.toBeNull();
    const match = observers.find(o => !o.disconnected && target && o.targets.has(target));
    expect(match).toBeDefined();
  });

  const observers = (globalThis as Record<string, unknown>).__intersectionObservers as MockObserverEntry[];
  const target = document.querySelector(selector)!;
  const match = observers.find(o => !o.disconnected && o.targets.has(target))!;
  await act(async () => {
    match.callback([{
      isIntersecting,
      target,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    }], {} as IntersectionObserver);
  });
}

async function triggerViewer3DIntersection() {
  await triggerIntersection('[data-testid="viewer-3d-sentinel"]');
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
    fireEvent.pointerDown(screen.getByRole('option'), {
      button: 0,
      isPrimary: true,
      pointerType: 'touch',
    });
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

  it('opens a direct dossier pathname route for a native cold start', async () => {
    window.history.replaceState({}, '', '/address/vbo-123?lookup=adr-abc123');
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith('adr-abc123', expect.any(AbortSignal));
    });
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
    expect(screen.getByText('Something went wrong on our end. Your data is safe — try refreshing.')).toBeInTheDocument();
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

  it('deduplicates identical sunlight callbacks and entitlement sync submissions', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis).toBeTypeOf('function');
    });

    const result = makeSunlightResult({ svf: 0.63 });

    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(result);
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(result);
    });

    await waitFor(() => {
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalledTimes(1);
    });
    expect(mockSubmitSunlightAnalysis).toHaveBeenCalledWith('vbo-123', result, 'report-123');
  });

  it('resubmits sunlight analysis when irradiance enrichment changes the export payload', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

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
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalledTimes(2);
    });
    expect(mockSubmitSunlightAnalysis).toHaveBeenNthCalledWith(1, 'vbo-123', baseResult, 'report-123');
    expect(mockSubmitSunlightAnalysis).toHaveBeenNthCalledWith(2, 'vbo-123', enrichedResult, 'report-123');
  });

  it('continues full dossier export when sunlight cache confirmation is unavailable', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });
    mockSubmitSunlightAnalysis.mockResolvedValue({
      status: 'ok',
      score: 50,
      severity: 'moderate',
      cached: false,
    });

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis).toBeTypeOf('function');
    });

    const sunlight = makeSunlightResult({ svf: 0.63, irradianceKwhM2: 948.4 });
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(sunlight);
    });

    await waitFor(() => {
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'full_dossier',
          reportId: 'report-123',
          sunlightPayload: expect.objectContaining({
            winter_hours: sunlight.winter,
            equinox_hours: sunlight.equinox,
            summer_hours: sunlight.summer,
            irradiance_kwh_m2: 948.4,
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(screen.queryByText("We couldn't generate the PDF. Try again. Your dossier data is still available.")).not.toBeInTheDocument();
  });

  it('opens the export sheet from the next-steps viewing checklist action', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download viewing checklist as PDF/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Download viewing checklist as PDF/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('export-sheet')).getByRole('radio', { name: /Quick checklist/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Full Dossier (€3.99)')).toBeInTheDocument();
    expect(screen.getByTestId('export-buy-price')).toHaveTextContent('Full dossier: €3.99');
  });

  it('renders the dossier action bar immediately after dossier load', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-primary')).toBeInTheDocument();
    });

    const actionBar = screen.getByTestId('action-bar');
    expect(actionBar).not.toHaveAttribute('aria-hidden');
    expect(actionBar.closest('.dossier-section')).toBeNull();
  });

  it('opens the export sheet with full dossier preselected from the dossier CTA', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('action-bar-primary')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('action-bar-primary'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('export-sheet')).getByRole('radio', { name: /Full Dossier/i }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('starts shadow prewarm automatically for entitled Forge3D dossier views', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledWith(
        'vbo-123',
        { rdX: 121000, rdY: 487000, lat: 52.3676, lng: 4.8846 },
        'report-123',
      );
    });
  });

  it('does not start shadow prewarm when server rendering is unavailable', async () => {
    pricingConfigRef.current.serverRenderAvailable = false;
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(mockPrewarmShadowEvidence).not.toHaveBeenCalled();
  });

  it('does not start shadow prewarm for free users', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: false,
    });

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(mockPrewarmShadowEvidence).not.toHaveBeenCalled();
  });

  it('does not rerun shadow prewarm after a terminal ready response for the same key', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    });

    await triggerViewer3DIntersection();
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
    });

    await waitFor(() => {
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalled();
    });
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
  });

  it.each(['skipped', 'unavailable'] as const)(
    'does not rerun shadow prewarm after a terminal %s response for the same key',
    async (status) => {
      mockPrewarmShadowEvidence.mockResolvedValue({
        status,
        facade_snapshot_count: 0,
        hero_snapshot_count: 0,
      });
      mockLookup.mockResolvedValue(makeResolvedAddress());
      mockBuilding.mockResolvedValue(makeBuildingResponse());
      mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
      mockCreateShortReport.mockResolvedValue({
        report_id: 'report-123',
        report_type: 'short',
        already_purchased: true,
      });

      renderApp();
      await selectAddress();

      await waitFor(() => {
        expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
      });

      await triggerViewer3DIntersection();
      await act(async () => {
        neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
      });

      await waitFor(() => {
        expect(mockSubmitSunlightAnalysis).toHaveBeenCalled();
      });
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    },
  );

  it('awaits an already-pending shadow prewarm before full dossier export and does not start a second request', async () => {
    let resolvePrewarm!: (value: { status: 'ready'; facade_snapshot_count: number; hero_snapshot_count: number }) => void;
    mockPrewarmShadowEvidence.mockReturnValue(new Promise((resolve) => {
      resolvePrewarm = resolve;
    }));
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();
    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    });

    await triggerViewer3DIntersection();
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-generate-btn'));
    });

    expect(mockExportBriefing).not.toHaveBeenCalled();
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrewarm({
        status: 'ready',
        facade_snapshot_count: 6,
        hero_snapshot_count: 3,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        template: 'full_dossier',
        reportId: 'report-123',
      }));
    });
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
  });

  it('awaits an already-pending shadow prewarm before full dossier export when sunlight is unavailable', async () => {
    let resolvePrewarm!: (value: { status: 'ready'; facade_snapshot_count: number; hero_snapshot_count: number }) => void;
    mockPrewarmShadowEvidence.mockReturnValue(new Promise((resolve) => {
      resolvePrewarm = resolve;
    }));
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();
    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    });

    await triggerViewer3DIntersection();
    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(neighborhoodViewer3DPropsRef.current?.onSunlightError).toBeTypeOf('function');
    });
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightError?.();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await waitFor(() => {
      expect(screen.getByTestId('export-sunlight-warning')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-generate-btn'));
    });

    expect(mockSubmitSunlightAnalysis).not.toHaveBeenCalled();
    expect(mockExportBriefing).not.toHaveBeenCalled();
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrewarm({
        status: 'ready',
        facade_snapshot_count: 6,
        hero_snapshot_count: 3,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        template: 'full_dossier',
        reportId: 'report-123',
      }));
    });
    expect(mockSubmitSunlightAnalysis).not.toHaveBeenCalled();
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
  });

  it('ignores stale completion from an older shadow prewarm key', async () => {
    let resolveFirstPrewarm!: (value: { status: 'ready'; facade_snapshot_count: number; hero_snapshot_count: number }) => void;
    let resolveSecondPrewarm!: (value: { status: 'ready'; facade_snapshot_count: number; hero_snapshot_count: number }) => void;
    mockPrewarmShadowEvidence
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirstPrewarm = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecondPrewarm = resolve;
      }));
    mockLookup
      .mockResolvedValueOnce(makeResolvedAddress({
        id: 'adr-1',
        display_name: 'Keizersgracht 100, 1015AA Amsterdam',
        adresseerbaar_object_id: 'vbo-123',
      }))
      .mockResolvedValueOnce(makeResolvedAddress({
        id: 'adr-2',
        display_name: 'Damrak 1, 1012LG Amsterdam',
        adresseerbaar_object_id: 'vbo-456',
        latitude: 52.374,
        longitude: 4.893,
        rd_x: 121300,
        rd_y: 487320,
      }));
    mockCreateShortReport
      .mockResolvedValueOnce({
        report_id: 'report-123',
        report_type: 'short',
        already_purchased: true,
      })
      .mockResolvedValueOnce({
        report_id: 'report-456',
        report_type: 'short',
        already_purchased: true,
      });
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();
    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    });

    await selectAddress();
    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(2);
    });

    await triggerViewer3DIntersection();
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-generate-btn'));
    });

    expect(mockExportBriefing).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirstPrewarm({
        status: 'ready',
        facade_snapshot_count: 6,
        hero_snapshot_count: 3,
      });
      await Promise.resolve();
    });

    expect(mockExportBriefing).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecondPrewarm({
        status: 'ready',
        facade_snapshot_count: 6,
        hero_snapshot_count: 3,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        template: 'full_dossier',
        reportId: 'report-456',
      }));
    });
  });

  it('stores a local failed shadow prewarm state and does not auto-retry or block export', async () => {
    mockPrewarmShadowEvidence.mockRejectedValue(new Error('shadow prewarm failed'));
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

    renderApp();
    await selectAddress();
    await waitFor(() => {
      expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
    });

    await triggerViewer3DIntersection();
    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
    });

    await waitFor(() => {
      expect(mockSubmitSunlightAnalysis).toHaveBeenCalled();
    });
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-generate-btn'));
    });

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        template: 'full_dossier',
        reportId: 'report-123',
      }));
    });
    expect(mockPrewarmShadowEvidence).toHaveBeenCalledTimes(1);
  });

  it('uses Google Play Billing instead of Stripe when the Android billing runtime is available', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockResolveBillingProvider.mockResolvedValue({ provider: 'google_play' });
    mockIsPlayBillingContextAvailableSync.mockReturnValue(true);
    mockIsPlayBillingReady.mockResolvedValue(true);

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy in Google Play/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy in Google Play/i }));
    });

    await waitFor(() => {
      expect(mockBeginPlayBillingPurchase).toHaveBeenCalledWith('report-123');
      expect(mockVerifyGooglePlayPurchase).toHaveBeenCalledWith(
        'report-123',
        'purchase-token',
        'full_dossier_unlock',
      );
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockCompletePlayBillingPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseToken: 'purchase-token',
      }),
      'success',
    );
  });

  it('still attempts Stripe checkout when pricing metadata says unavailable', async () => {
    pricingConfigRef.current.webCheckoutAvailable = false;
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy Full Dossier/i })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy Full Dossier/i }));
    });

    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('report-123', 'adr-abc123');
    });
  });

  it('shows the dedicated unavailable message when checkout-session returns Stripe-config 503', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCreateCheckoutSession.mockRejectedValue(
      new ApiError('premium.checkout.unavailable', 503),
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy Full Dossier/i }));
    });

    await waitFor(() => {
      expect(screen.getAllByText(
        'Full dossier checkout is temporarily unavailable. Please try again later.',
      ).length).toBeGreaterThan(0);
    });
  });

  it('redirects to Stripe checkout when web checkout starts successfully', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy Full Dossier/i }));
    });

    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('report-123', 'adr-abc123');
    });
    expect(mockNavigateToExternal).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_test_123',
    );
  });

  it('stores the selected export language before redirecting to Stripe checkout', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    fireEvent.click(within(screen.getByTestId('export-sheet')).getByRole('radio', { name: 'NL' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy Full Dossier/i }));
    });

    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('report-123', 'adr-abc123');
    });
    expect(sessionStorage.getItem('buurt-check:post-checkout-export')).toBe(
      JSON.stringify({
        reportId: 'report-123',
        template: 'full_dossier',
        language: 'nl',
      }),
    );
  });

  it('prewarms 3D prerequisites before redirecting to Stripe checkout', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy Full Dossier/i }));
    });

    await waitFor(() => {
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith('report-123', 'adr-abc123');
    });
    await waitFor(() => {
      expect(mockBuilding3D).toHaveBeenCalled();
      expect(mockNeighborhood3D).toHaveBeenCalled();
    });
    expect(mockNavigateToExternal).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_test_123',
    );
  });

  it('resumes full dossier export after Stripe redirect confirmation', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-post-checkout-ready')).toHaveTextContent(
      'Your dossier is ready. Tap Download dossier to save it.',
    );
    expect(screen.queryByRole('button', { name: /Generate dossier/i })).not.toBeInTheDocument();
    expect(mockDownloadPdfBlob).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'checkout_resume_checkpoint',
      expect.objectContaining({
        checkpoint: 'checkout_confirm_started',
        has_session_id: true,
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'checkout_resume_checkpoint',
      expect.objectContaining({
        checkpoint: 'entitlement_active',
        provider: 'stripe',
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'checkout_resume_checkpoint',
      expect.objectContaining({
        checkpoint: 'export_sheet_opened',
        template: 'full_dossier',
        provider: 'stripe',
      }),
    );
  });

  it('uses the stored export language when post-checkout recovery resumes in a Dutch UI', async () => {
    await i18nInstance.changeLanguage('nl');
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier', language: 'en' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
        language: 'en',
      }));
    });
  });

  it('waits for the seasonal shadow triptych before post-checkout auto-generation when server rendering is unavailable', async () => {
    pricingConfigRef.current.serverRenderAvailable = false;
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier', language: 'en' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis).toBeTypeOf('function');
      expect(neighborhoodViewer3DPropsRef.current?.onShadowSnapshots).toBeTypeOf('function');
    });

    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onSunlightAnalysis?.(makeSunlightResult({ svf: 0.63 }));
    });

    expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'waiting_prerequisites');
    expect(mockExportBriefing).not.toHaveBeenCalled();

    await act(async () => {
      neighborhoodViewer3DPropsRef.current?.onShadowSnapshots?.([
        { label: 'winter', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
        { label: 'equinox', hour: 12, dataUrl: 'data:image/png;base64,BBB', viewpoint: 'top' },
        { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,CCC', viewpoint: 'top' },
      ]);
    });

    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
        language: 'en',
        shadowImageB64: 'AAA',
        shadowEquinoxB64: 'BBB',
        shadowSummerB64: 'CCC',
      }));
    });
  });

  it('keeps the paid report pinned when entitlement 404s during Stripe return recovery', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockRejectedValue(new ApiError('error.data_source', 404));
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    expect(mockCreateShortReport).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    expect(mockCreateShortReport).not.toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'checkout_resume_checkpoint',
      expect.objectContaining({
        checkpoint: 'entitlement_active',
        provider: 'stripe',
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'checkout_resume_checkpoint',
      expect.objectContaining({
        checkpoint: 'export_sheet_opened',
        template: 'full_dossier',
        provider: 'stripe',
      }),
    );
  });

  it('keeps the post-checkout export intent queued until dossier context is ready', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
    });

    let resolveBuilding!: (value: ReturnType<typeof makeBuildingResponse>) => void;
    const buildingPromise = new Promise<ReturnType<typeof makeBuildingResponse>>((resolve) => {
      resolveBuilding = resolve;
    });
    mockBuilding.mockReturnValue(buildingPromise);

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });

    expect(sessionStorage.getItem('buurt-check:post-checkout-export')).not.toBeNull();
    expect(screen.queryByTestId('export-sheet')).not.toBeInTheDocument();

    await act(async () => {
      resolveBuilding(makeBuildingResponse());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    expect(screen.queryByRole('button', { name: /Generate dossier/i })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('buurt-check:post-checkout-export')).toBeNull();
  });

  it('recovers a Stripe return that lands without the address hash', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token',
    );
    sessionStorage.setItem(
      'buurt-check:report-lookup:report-123',
      'adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    await waitFor(() => {
      expect(window.location.hash).toBe('#/address/vbo-123?lookup=adr-abc123');
    });
    expect(screen.queryByText('Payment could not be completed. Please try again.')).not.toBeInTheDocument();
  });

  it('replaces a seeded old dossier with the paid checkout address before resuming export', async () => {
    localStorage.setItem('buurt-check-e2e-dossier-seed', JSON.stringify({
      address: makeResolvedAddress({
        id: 'adr-old123',
        adresseerbaar_object_id: 'vbo-old',
        display_name: 'Oudezijds 1, 1012AA Amsterdam',
      }),
      buildingResponse: makeBuildingResponse({
        address_id: 'vbo-old',
        building: makeBuildingResponse().building,
      }),
    }));
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
      vbo_id: 'vbo-123',
      address_key: 'Keizersgracht 100, 1015AA Amsterdam',
      lookup_id: 'adr-abc123',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith('adr-abc123', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(window.location.hash).toBe('#/address/vbo-123?lookup=adr-abc123');
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    expect(screen.queryByText('Payment could not be completed. Please try again.')).not.toBeInTheDocument();
  });

  it('recovers a legacy Stripe return with no lookup cache and no stored export intent', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123',
    );
    mockSuggest.mockResolvedValue({
      suggestions: [makeSuggestion()],
    });
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
      vbo_id: 'vbo-123',
      address_key: 'Keizersgracht 100, 1015AA Amsterdam',
    });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(mockSuggest).toHaveBeenCalledWith('Keizersgracht 100, 1015AA Amsterdam', 5);
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    await waitFor(() => {
      expect(window.location.hash).toBe('#/address/vbo-123?lookup=adr-abc123');
    });
    expect(screen.queryByRole('button', { name: /Generate dossier/i })).not.toBeInTheDocument();
  });

  it('retries transient Stripe confirmation errors and still resumes the export', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });
    mockConfirmStripeCheckoutSession
      .mockRejectedValueOnce(new ApiError('error.server', 503))
      .mockResolvedValueOnce({
        report_id: 'report-123',
        entitled: true,
        report_type: 'short',
      });

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText('Processing payment...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(2);
    }, { timeout: 3_500 });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    expect(screen.queryByRole('button', { name: /Generate dossier/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Payment could not be completed. Please try again.')).not.toBeInTheDocument();
  });

  it('shows a payment failure when Stripe confirmation returns a definitive error', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });
    mockConfirmStripeCheckoutSession.mockRejectedValue(new ApiError('error.data_source', 404));

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText(
        'Payment could not be completed. Please try again.',
      ).length).toBeGreaterThan(0);
    });
    expect(mockExportBriefing).not.toHaveBeenCalled();
  });

  it('keeps polling after the delayed Stripe state and resumes the export when entitlement unlocks later', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    let confirmAttempt = 0;
    mockConfirmStripeCheckoutSession.mockImplementation(async () => {
      confirmAttempt += 1;
      if (confirmAttempt < 5) {
        return {
          report_id: 'report-123',
          entitled: false,
          report_type: 'short',
        };
      }
      return {
        report_id: 'report-123',
        entitled: true,
        report_type: 'short',
      };
    });

    renderApp();

    await waitFor(() => {
      expect(
        screen.getAllByText('Payment received — your dossier will unlock shortly.').length,
      ).toBeGreaterThan(0);
    }, { timeout: 8_500 });
    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(5);
    }, { timeout: 12_500 });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    }, { timeout: 12_500 });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    }, { timeout: 12_500 });
    expect(screen.queryByRole('button', { name: /Generate dossier/i })).not.toBeInTheDocument();
  }, 15_000);

  it('shows a retry action after post-checkout polling times out', async () => {
    vi.useFakeTimers();
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    let confirmAttempt = 0;
    mockConfirmStripeCheckoutSession.mockImplementation(async () => {
      confirmAttempt += 1;
      return {
        report_id: 'report-123',
        entitled: confirmAttempt >= 15,
        report_type: 'short',
      };
    });

    renderApp();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(37_000);
    });

    expect(
      screen.getAllByText(
        'Unlock is taking longer than expected. Retry to check your dossier again.',
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(15);
    expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
  }, 15_000);

  it('activates entitlement even when Stripe confirmation resolves after address loads', async () => {
    // Reproduce the real Stripe return URL: no lookup= in hash, lookup in sessionStorage.
    // confirmStripeCheckoutSession resolves AFTER lookupAddress, which is the realistic
    // timing since confirm calls Stripe API while lookup is a fast PDOK call.
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123',
    );
    sessionStorage.setItem(
      'buurt-check:report-lookup:report-123',
      'adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );

    // confirmStripeCheckoutSession uses a deferred promise so it resolves
    // AFTER lookupAddress and the address state update.
    let resolveConfirm!: (v: { report_id: string; entitled: boolean; report_type: 'short' | 'long' }) => void;
    const confirmPromise = new Promise<{ report_id: string; entitled: boolean; report_type: 'short' | 'long' }>(
      (resolve) => { resolveConfirm = resolve; },
    );
    mockConfirmStripeCheckoutSession.mockReturnValue(confirmPromise);

    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockResolvedValue({
      report_id: 'report-123',
      entitled: false,
      report_type: 'short',
    });

    renderApp();

    // Wait for the address to fully load (lookupAddress + building facts resolved).
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    // At this point address state changed, which recreates activatePurchasedEntitlement,
    // which re-triggers the checkout verification effect and cancels the in-flight promise.
    // Now resolve the confirm — it must NOT be discarded.
    await act(async () => {
      resolveConfirm({
        report_id: 'report-123',
        entitled: true,
        report_type: 'short',
      });
    });

    // The export sheet should open and auto-generate the full dossier.
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
  });

  it('still resumes the paid export when Stripe confirmation resolves late after a 404 entitlement check', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123',
    );
    sessionStorage.setItem(
      'buurt-check:report-lookup:report-123',
      'adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );

    let resolveConfirm!: (v: { report_id: string; entitled: boolean; report_type: 'short' | 'long' }) => void;
    const confirmPromise = new Promise<{ report_id: string; entitled: boolean; report_type: 'short' | 'long' }>(
      (resolve) => { resolveConfirm = resolve; },
    );
    mockConfirmStripeCheckoutSession.mockReturnValue(confirmPromise);

    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCheckEntitlement.mockRejectedValue(new ApiError('error.data_source', 404));

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledWith(
        'report-123',
        'cs_test_123',
        'signed-buyer-token',
      );
    });
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(mockCreateShortReport).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfirm({
        report_id: 'report-123',
        entitled: true,
        report_type: 'short',
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockExportBriefing).toHaveBeenCalledWith(expect.objectContaining({
        reportId: 'report-123',
        template: 'full_dossier',
      }));
    });
    expect(mockCreateShortReport).not.toHaveBeenCalled();
  });

  it('falls back to a fresh short report on a later different-address navigation with stale Stripe params', async () => {
    window.history.replaceState(
      null,
      '',
      '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
    );
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );

    const initialAddress = makeResolvedAddress();
    const nextAddress = makeResolvedAddress({
      id: 'adr-new456',
      adresseerbaar_object_id: 'vbo-999',
      display_name: 'Nieuwezijds 1, 1012AB Amsterdam',
      street: 'Nieuwezijds Voorburgwal',
      house_number: '1',
      postcode: '1012AB',
      rd_x: 121100,
      rd_y: 487100,
      latitude: 52.371,
      longitude: 4.896,
      buurt_code: 'BU99999999',
    });
    const initialBuilding = makeBuildingResponse();
    const nextBuilding = makeBuildingResponse({
      address_id: 'vbo-999',
      building: {
        pand_id: '0363100099999998',
        construction_year: 2001,
        status: 'Verblijfsobject in gebruik',
        status_en: 'Addressable object in use',
        intended_use: ['woonfunctie'],
        intended_use_en: ['residential'],
        num_units: 1,
        floor_area_m2: 95,
      },
    });

    mockLookup.mockImplementation(async (lookupId) => {
      return lookupId === 'adr-new456' ? nextAddress : initialAddress;
    });
    mockBuilding.mockImplementation(async (vboId) => {
      return vboId === 'vbo-999' ? nextBuilding : initialBuilding;
    });
    mockCheckEntitlement.mockRejectedValue(new ApiError('error.data_source', 404));
    mockConfirmStripeCheckoutSession.mockResolvedValue({
      report_id: 'report-123',
      entitled: true,
      report_type: 'short',
    });
    mockCreateShortReport.mockImplementation(async (vboId) => ({
      report_id: vboId === 'vbo-999' ? 'report-999' : 'report-123',
      report_type: 'short',
      already_purchased: false,
    }));

    renderApp();

    await waitFor(() => {
      expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    await act(async () => {
      window.history.replaceState(
        null,
        '',
        '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
      );
      window.location.hash = '#/address/vbo-999?lookup=adr-new456';
      window.dispatchEvent(new Event('hashchange'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith('adr-new456', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(mockCreateShortReport).toHaveBeenCalledWith('vbo-999', nextAddress.display_name);
    });
    expect(mockConfirmStripeCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockCreateShortReport).toHaveBeenCalledTimes(1);
  });

  it('uses Apple billing instead of Stripe when the iOS runtime is available', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockResolveBillingProvider.mockResolvedValue({
      provider: 'apple_app_store',
      localizedPriceLabel: '$4.99',
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy in App Store/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-buy-price')).toHaveTextContent('Full dossier: $4.99');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy in App Store/i }));
    });

    await waitFor(() => {
      expect(mockBeginAppleBillingPurchase).toHaveBeenCalledWith('report-123');
      expect(mockVerifyAppleAppStorePurchase).toHaveBeenCalledWith(
        'report-123',
        'signed-transaction',
        'full_dossier_unlock',
      );
    });
    expect(mockFinishAppleBillingTransaction).toHaveBeenCalledWith('apple-transaction-123');
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('falls back to euro pricing when Apple localized pricing is unavailable', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockResolveBillingProvider.mockResolvedValue({
      provider: 'apple_app_store',
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', {
      name: /Unlock dossier \(€3\.99\)/i,
      hidden: true,
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy in App Store/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Full Dossier (€3.99)')).toBeInTheDocument();
    expect(screen.getByTestId('export-buy-price')).toHaveTextContent('Full dossier: €3.99');
  });

  it('restores a pending Apple purchase for the current report', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockResolveBillingProvider.mockResolvedValue({
      provider: 'apple_app_store',
      localizedPriceLabel: '$4.99',
    });
    mockGetPendingAppleBillingReport.mockReturnValue('report-123');
    mockFindPendingAppleBillingPurchase.mockResolvedValue({
      productId: 'full_dossier_unlock',
      transactionId: 'apple-restored-123',
      originalTransactionId: 'apple-original-123',
      signedTransactionInfo: 'signed-restored-transaction',
    });

    renderApp();

    await waitFor(() => {
      expect(mockVerifyAppleAppStorePurchase).toHaveBeenCalledWith(
        'report-123',
        'signed-restored-transaction',
        'full_dossier_unlock',
      );
    });
    expect(mockFinishAppleBillingTransaction).toHaveBeenCalledWith('apple-restored-123');
    expect(mockClearPendingAppleBillingReport).toHaveBeenCalled();
  });

  it('keeps the dossier in delayed state when the Apple purchase is pending approval', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockResolveBillingProvider.mockResolvedValue({
      provider: 'apple_app_store',
      localizedPriceLabel: '$4.99',
    });
    mockBeginAppleBillingPurchase.mockRejectedValue({ code: 'PURCHASE_PENDING' });
    mockIsAppleBillingPendingError.mockImplementation(
      (error) => (error as { code?: string }).code === 'PURCHASE_PENDING',
    );

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: /Unlock dossier|Unlock full dossier|Download dossier/i,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy in App Store/i }));
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Payment received — your dossier will unlock shortly.',
        ).length,
      ).toBeGreaterThan(0);
    });
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

  it('does not render sunlight card in viewer (premium-only)', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    // SunlightRiskCard is premium-only (PDF/Full Dossier), not shown in viewer
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
    // SunlightRiskCard is premium-only, not in viewer
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
  });

  it('does not render sunlight card in viewer when 3D returns empty buildings (premium-only)', async () => {
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
    // SunlightRiskCard is premium-only (PDF/Full Dossier), not shown in viewer
    expect(screen.queryByText('Sunlight unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('does not render sunlight loading card in viewer (premium-only)', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();
    await triggerViewer3DIntersection();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
    });
    // SunlightRiskCard is premium-only, not rendered in the viewer
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('does not render sunlight card when neighborhood omits target_pand_id (premium-only)', async () => {
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
    // SunlightRiskCard is premium-only, not rendered in the viewer
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
      if (tid === 'livability-card') return 'livability';
      if (tid === 'viewer-3d') return 'viewer-3d';
      if (tid === 'neighborhood-stats') return 'stats';
      if (tid === 'tier-b-card') return 'tierb';
      if (tid === 'viewing-checklist') return 'checklist';
      if (tid === 'action-bar') return 'actionbar';
      return 'unknown';
    });

    // Verify canonical dossier order:
    // AttentionSummary → AddressHeader → RiskTiles → BuildingFacts →
    // Livability → 3D Viewer →
    // NeighborhoodStats → TierB → ViewingChecklist → ActionBar
    const expected = [
      'attention', 'address-header', 'risk', 'building',
      'livability', 'viewer-3d',
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
    expect(uniqueIndexes).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
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
  it('renders neighborhood jump button text in English', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    });

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 420 });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(await screen.findByRole('button', { name: 'Neighborhood' })).toBeInTheDocument();

    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

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
    mockCreateShortReport.mockResolvedValue({
      report_id: 'report-123',
      report_type: 'short',
      already_purchased: true,
    });

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

describe('shortlist score gating', () => {
  it('keeps save actions disabled until risk scores settle', async () => {
    let resolveRiskCards: ((value: ReturnType<typeof makeScoredRiskCards>) => void) | null = null;
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockReturnValue(new Promise<ReturnType<typeof makeScoredRiskCards>>((resolve) => {
      resolveRiskCards = resolve;
    }));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('action-bar')).toBeInTheDocument();
    });

    const actionBarSave = screen.getByTestId('action-bar').querySelector('.action-bar__btn--secondary');
    expect(actionBarSave).not.toBeNull();
    expect(actionBarSave).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save this address to compare later' })).toBeDisabled();
    expect(getShortlist()).toEqual([]);

    await act(async () => {
      resolveRiskCards?.(makeScoredRiskCards());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save this address to compare later' })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save this address to compare later' }));
    });

    await waitFor(() => {
      expect(getShortlist()).toHaveLength(1);
    });
    expect(getShortlist()[0].riskScores).toEqual({
      noise: 61,
      air: 58,
      climate: 74,
      sunlight: 67,
    });
  });

  it('does not overwrite saved shortlist scores before refreshed risk cards settle', async () => {
    localStorage.setItem('buurt-check-shortlist', JSON.stringify([{
      vboId: 'vbo-123',
      lookupId: 'adr-abc123',
      address: 'Keizersgracht 100, 1015AA Amsterdam',
      postcode: '1015AA',
      city: 'Amsterdam',
      buildingYear: 1875,
      riskScores: {
        noise: 82,
        air: 76,
        climate: 71,
        sunlight: 64,
      },
      savedAt: 1,
    }]));

    let resolveRiskCards: ((value: ReturnType<typeof makeScoredRiskCards>) => void) | null = null;
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockReturnValue(new Promise<ReturnType<typeof makeScoredRiskCards>>((resolve) => {
      resolveRiskCards = resolve;
    }));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Address saved — search another to compare' }),
      ).toBeInTheDocument();
    });

    expect(getShortlist()[0].riskScores).toEqual({
      noise: 82,
      air: 76,
      climate: 71,
      sunlight: 64,
    });

    await act(async () => {
      resolveRiskCards?.(makeScoredRiskCards());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getShortlist()[0].riskScores).toEqual({
        noise: 61,
        air: 58,
        climate: 74,
        sunlight: 67,
      });
    });
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
