import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import App, { getMatchRouteMotionProps } from './App';
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
import { readMatchSessionSnapshot, saveMatchSessionSnapshot } from './services/matchSessionStorage';
import type { MatchFirstSurveyAnswers } from './types/matchFirst';

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
  () => ({ current: { price: '3.99', serverRenderAvailable: true } }),
);

const paidPackRadioName = /Full dossier|Volledig dossier/i;
const paidPackActionName = /Unlock Full Report|Volledig rapport ontgrendelen|Download Full dossier|Volledig dossier downloaden/i;
const paidPackBuyName = /Buy Full dossier|Volledig dossier kopen/i;
const completeMatchAnswers: MatchFirstSurveyAnswers = {
  intent: 'both',
  budget: { buy_min: 45000000, buy_max: 65000000, rent_max: 250000 },
  household_type: 'family_young_child',
  anchor_location: { type: 'city', label: 'Utrecht Centraal' },
  commute: { max_minutes: 45 },
  lifestyle_priorities: ['green_access', 'calmness', 'public_transport'],
  must_haves: ['parks_nearby', 'good_transit'],
  dealbreakers: ['busy_nightlife'],
  housing_types: ['row_house', 'family_house'],
  area_character: 'quiet_city',
  language: 'en',
};

function completeMatchSessionResponse(sessionId: string, answers: MatchFirstSurveyAnswers = completeMatchAnswers) {
  return {
    session_id: sessionId,
    locale: answers.language ?? 'en',
    phase: 'review',
    current_step: 11,
    answer_version: 11,
    answers,
    validation: {},
    is_complete: true,
    preference_vector_id: `pv_${sessionId}`,
    preference_vector_version: `vector_${sessionId}`,
    preference_vector: {
      preference_vector_id: `pv_${sessionId}`,
      session_id: sessionId,
      journey_intent: answers.intent ?? 'both',
      budget_min_cents: answers.budget?.buy_min ?? null,
      budget_max_cents: answers.budget?.buy_max ?? null,
      monthly_rent_max_cents: answers.budget?.rent_max ?? null,
      anchor_locations: [{ type: 'city', label: answers.anchor_location?.label ?? 'Utrecht Centraal' }],
      commute_limits: [{ mode: 'public_transport', max_minutes: answers.commute?.max_minutes ?? 45 }],
      property_types: answers.housing_types ?? [],
      hard_filters: ['intent:both', 'budget', 'commute'],
      nice_to_haves: answers.lifestyle_priorities ?? [],
      avoid_signals: answers.dealbreakers ?? [],
      lifestyle_weights: { green_access: 0.5, calmness: 0.5 },
      persona_inputs: {},
      locale: answers.language ?? 'en',
      method_version: 'preference-vector-v2',
      source_answer_version: 11,
      vector_version: `vector_${sessionId}`,
      raw_answer_refs: answers,
      warnings: [],
    },
  };
}

function mockMatchFirstFetch(options: {
  sessionId?: string;
  getSessionBody?: Record<string, unknown>;
  runBody?: Record<string, unknown>;
  statusBody?: Record<string, unknown>;
  resultsBody?: Record<string, unknown>;
  createStatus?: number;
} = {}) {
  const sessionId = options.sessionId ?? 'match_backend_123';
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/match/sessions') && method === 'POST') {
      return new Response(JSON.stringify({
        session_id: sessionId,
        locale: 'en',
        phase: 'survey_intro',
        current_step: null,
        answer_version: 0,
        expires_at: '2026-05-15T12:00:00Z',
      }), {
        status: options.createStatus ?? 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/answers`) && method === 'PATCH') {
      return new Response(JSON.stringify({
        session_id: sessionId,
        answer_version: 1,
        is_complete: false,
        validation: {},
        stale_results: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}`) && method === 'GET') {
      return new Response(JSON.stringify(options.getSessionBody ?? completeMatchSessionResponse(sessionId)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/run`) && method === 'POST') {
      return new Response(JSON.stringify(options.runBody ?? {
        session_id: sessionId,
        job_id: `match_job_${sessionId}`,
        status: 'queued',
        stage: 'queued',
        progress: 5,
        message_key: 'matchFirst.progress.queued',
        preference_vector_id: `pv_${sessionId}`,
        poll_after_ms: 1000,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/status`) && method === 'GET') {
      return new Response(JSON.stringify(options.statusBody ?? {
        session_id: sessionId,
        job_id: `match_job_${sessionId}`,
        status: 'running',
        stage: 'reading_preferences',
        progress: 20,
        message_key: 'matchFirst.progress.reading_preferences',
        model_mode: 'weighted_scoring',
        model_version: 'match-score-v1',
        scoring_version: 'match-score-v1',
        evaluation_status: 'not_validated_no_labels',
        fallback_used: false,
        fallback_reason_code: null,
        result_set_id: null,
        error_code: null,
        runtime_ms: 400,
        updated_at: '2026-05-16T12:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${sessionId}/results`) && method === 'GET') {
      return new Response(JSON.stringify(options.resultsBody ?? {
        session_id: sessionId,
        job_id: `match_job_${sessionId}`,
        result_set_id: `mrs_${sessionId}`,
        preference_vector_version: `vector_${sessionId}`,
        status: 'completed',
        generated_at: '2026-05-16T12:00:01Z',
        runtime_ms: 1900,
        model_mode: 'weighted_scoring',
        model_version: 'match-score-v1',
        scoring_version: 'match-score-v1',
        data_version: 'match-seed-v1',
        evaluation_status: 'not_validated_no_labels',
        predictive_probability_available: false,
        fallback_used: false,
        fallback_reason_code: null,
        normal_recommendation_count: 0,
        candidate_count: 0,
        scored_candidate_count: 0,
        ranked_results: [],
        recommendations: [],
        stretch_matches: [],
        near_misses: [],
        empty_state_code: null,
        map_center: { lat: 52.2, lng: 5.3 },
        bbox: [3.2, 50.7, 7.3, 53.6],
        map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

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
    getPropertyWarnings: vi.fn(),
    getLivability: vi.fn(),
    fetchPrebidBriefing: vi.fn(),
    fetchPrebidPack: vi.fn(),
    sharePrebidPack: vi.fn(),
    emailPrebidPack: vi.fn(),
    deletePrebidBriefing: vi.fn(),
    fetchSharedPrebidBriefing: vi.fn(),
    fetchSharedPrebidPack: vi.fn(),
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

vi.mock('./services/clientEvents', async () => {
  const actual = await vi.importActual<typeof import('./services/clientEvents')>('./services/clientEvents');
  return {
    ...actual,
    trackEvent: vi.fn(),
    trackPrebidEvent: vi.fn(),
    trackPageView: vi.fn(),
  };
});

vi.mock('./config/pricing', () => ({
  fetchPrice: vi.fn().mockImplementation(async () => pricingConfigRef.current.price),
  getDossierPrice: vi.fn(() => pricingConfigRef.current.price),
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
  getPropertyWarnings,
  getLivability,
  fetchPrebidBriefing,
  fetchPrebidPack,
  sharePrebidPack,
  emailPrebidPack,
  deletePrebidBriefing,
  fetchSharedPrebidBriefing,
  fetchSharedPrebidPack,
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
import { trackEvent, trackPrebidEvent } from './services/clientEvents';
import { pack as prebidPackFixture } from './components/prebid/testFixtures';
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
const mockPropertyWarnings = vi.mocked(getPropertyWarnings);
const mockLivability = vi.mocked(getLivability);
const mockFetchPrebidBriefing = vi.mocked(fetchPrebidBriefing);
const mockFetchPrebidPack = vi.mocked(fetchPrebidPack);
const mockSharePrebidPack = vi.mocked(sharePrebidPack);
const mockEmailPrebidPack = vi.mocked(emailPrebidPack);
const mockDeletePrebidBriefing = vi.mocked(deletePrebidBriefing);
const mockFetchSharedPrebidBriefing = vi.mocked(fetchSharedPrebidBriefing);
const mockFetchSharedPrebidPack = vi.mocked(fetchSharedPrebidPack);
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
const mockTrackPrebidEvent = vi.mocked(trackPrebidEvent);
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
  mockPropertyWarnings.mockReset();
  mockLivability.mockReset();
  mockFetchPrebidBriefing.mockReset();
  mockFetchPrebidPack.mockReset();
  mockSharePrebidPack.mockReset();
  mockEmailPrebidPack.mockReset();
  mockDeletePrebidBriefing.mockReset();
  mockFetchSharedPrebidBriefing.mockReset();
  mockFetchSharedPrebidPack.mockReset();
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
  mockTrackPrebidEvent.mockReset();
  neighborhoodViewer3DPropsRef.current = null;
  pricingConfigRef.current = {
    price: '3.99',
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
    shared_building: { detected: false, messages: [] },
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
  mockFetchPrebidBriefing.mockResolvedValue({
    briefing_id: 'brief-backend',
    address_id: 'vbo-123',
    report_id: 'report-123',
    address_label: 'Keizersgracht 100, 1015AA Amsterdam',
    checked_at: '2026-05-07T10:00:00Z',
    result_state: 'signals_found',
    disclaimer: 'Source-bound briefing for viewing preparation.',
    coverage: [
      {
        id: 'official_publications',
        authority: 'KOOP',
        label: 'Official public notices',
        status: 'checked',
        basis: 'address',
        limitation: 'Backend source limitation.',
      },
    ],
    top_actions: [
      {
        id: 'backend-action',
        category: 'permit',
        priority: 1,
        severity: 'moderate',
        finding: 'Backend permit signal should be checked.',
        why_it_matters: 'It may affect planning or timing.',
        ask_this: { en: 'Can you confirm the backend permit status?', nl: 'Kunt u de backendvergunning bevestigen?' },
        request_this: 'Request the backend source record.',
        who_to_ask: ['municipality'],
        confidence: 'medium',
        limitation: 'Backend source limitation.',
        source_refs: [
          {
            name: 'Official public notices',
            checked_at: '2026-05-07T10:00:00Z',
            coverage_status: 'checked',
            limitation: 'Backend source limitation.',
          },
        ],
      },
    ],
    source_quality: {
      unknown_source_date_count: 0,
      generic_confidence_count: 0,
      generic_limitation_count: 0,
      missing_source_ref_count: 0,
      missing_recipient_count: 0,
      caps: [],
    },
  });
  mockFetchPrebidPack.mockResolvedValue({
    ...prebidPackFixture,
    address_id: 'vbo-123',
    report_id: 'report-123',
    address_label: 'Keizersgracht 100, 1015AA Amsterdam',
    share_url: 'https://app.buurt-check.nl/#/shared-pack/backend-pack-token',
  });
  mockSharePrebidPack.mockResolvedValue({
    share_url: 'https://app.buurt-check.nl/#/shared-pack/backend-pack-token',
    share_token: 'backend-pack-token',
    scope: 'pack',
    expires_at: '2026-05-14T10:00:00Z',
  });
  mockEmailPrebidPack.mockResolvedValue({
    share_url: 'https://app.buurt-check.nl/#/shared-pack/backend-email-pack-token',
    share_token: 'backend-email-pack-token',
    scope: 'pack',
  });
  mockDeletePrebidBriefing.mockResolvedValue({ deleted: true });
  mockFetchSharedPrebidBriefing.mockResolvedValue({
    state: 'valid',
    mode: 'briefing',
    briefing: {
      briefing_id: 'shared-briefing',
      address_id: 'vbo-123',
      address_label: 'Shared address',
      checked_at: '2026-05-07T10:00:00Z',
      result_state: 'signals_found',
      disclaimer: 'Shared briefing disclaimer.',
      coverage: [],
      top_actions: [],
      source_quality: {
        unknown_source_date_count: 0,
        generic_confidence_count: 0,
        generic_limitation_count: 0,
        missing_source_ref_count: 0,
        missing_recipient_count: 0,
        caps: [],
      },
    },
  });
  mockFetchSharedPrebidPack.mockResolvedValue({
    state: 'valid',
    mode: 'pack',
    pack: {
      ...prebidPackFixture,
      address_id: 'vbo-123',
      report_id: 'report-123',
      address_label: 'Shared pack address',
    },
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

function readMatchFirstAnalyticsEvents(): Array<{ event_name: string; context: Record<string, unknown> }> {
  const raw = localStorage.getItem('buurt-check-match-first-analytics');
  return raw ? JSON.parse(raw) as Array<{ event_name: string; context: Record<string, unknown> }> : [];
}

function completedMatchResultsResponse(sessionId: string) {
  return {
    session_id: sessionId,
    job_id: `match_job_${sessionId}`,
    result_set_id: `mrs_${sessionId}`,
    preference_vector_version: `vector_${sessionId}`,
    status: 'completed',
    generated_at: '2026-05-17T12:00:00Z',
    runtime_ms: 900,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'match-seed-v1',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: false,
    fallback_reason_code: null,
    normal_recommendation_count: 0,
    candidate_count: 0,
    scored_candidate_count: 0,
    ranked_results: [],
    recommendations: [],
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
  };
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

async function waitForDossierLoaded() {
  await waitFor(() => {
    expect(screen.getByText('Building Facts')).toBeInTheDocument();
  });
}

/**
 * Simulates selecting an address: type query, trigger debounce, click suggestion.
 * Uses fake timers briefly to advance the 300ms debounce, then restores real timers
 * so waitFor can poll normally for async state updates.
 *
 * If the search screen is not visible (e.g. we're on the dossier screen),
 * follows the secondary address-search link so the combobox is rendered.
 */
async function selectAddress() {
  const suggestion = makeSuggestion();
  mockSuggest.mockResolvedValue({ suggestions: [suggestion] });

  // If on the dossier/briefing screen, navigate through the match-first home.
  if (!screen.queryByRole('combobox')) {
    const homeTab = screen.queryByRole('tab', { name: 'Match' });
    let addressLink = screen.queryByRole('link', { name: 'Already have an address?' });
    await act(async () => {
      if (addressLink) {
        fireEvent.click(addressLink);
      } else if (homeTab) {
        fireEvent.click(homeTab);
      }
    });
    addressLink = screen.queryByRole('link', { name: 'Already have an address?' });
    if (!screen.queryByRole('combobox') && !addressLink && homeTab) {
      addressLink = await screen.findByRole('link', { name: 'Already have an address?' });
    }
    if (!screen.queryByRole('combobox') && addressLink) {
      await act(async () => {
        fireEvent.click(addressLink);
      });
    }
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
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
  it('removes route slide motion when reduced motion is requested', () => {
    expect(getMatchRouteMotionProps(false)).toMatchObject({
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 12 },
    });
    expect(getMatchRouteMotionProps(true)).toMatchObject({
      initial: false,
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 0 },
    });
  });

  it('renders app title and match-first entry', async () => {
    const { container } = renderApp();
    expect(screen.getByAltText('Buurt Check')).toBeInTheDocument();
    expect(container.querySelector('.app')).toHaveAttribute('data-screen', 'matchLanding');
    expect(await screen.findByRole('button', { name: 'Find my dream neighborhood' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Already have an address?' })).toHaveAttribute('href', '#/search');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Language' })).toHaveLength(1);
  });

  it('keeps #/match as a match-first landing without a global Search tab', async () => {
    window.location.hash = '#/match';
    const { container } = renderApp();

    expect(container.querySelector('.app')).toHaveAttribute('data-screen', 'matchLanding');
    expect(await screen.findByRole('button', { name: 'Find my dream neighborhood' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('keeps settings hidden during match-first onboarding screens', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_backend_settings' });
    window.location.hash = '#/match/intro';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start the match' }));
    expect(await screen.findByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('creates a backend match session before entering the survey flow', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_backend_created' });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));

    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/match/session/match_backend_created/intro');
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ locale: 'en', source: 'landing' }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Start the match' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Both' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_backend_created/answers', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"intent":"both"'),
      }));
    });

    fetchSpy.mockRestore();
  });

  it('replaces a stale stored backend match session before entering the survey flow', async () => {
    window.localStorage.setItem('buurt-check-match-first-session-id', 'match_stale');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/api/match/sessions/match_stale') && method === 'GET') {
        return new Response(JSON.stringify({ detail: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/match/sessions') && method === 'POST') {
        return new Response(JSON.stringify({
          session_id: 'match_fresh',
          locale: 'en',
          phase: 'survey_intro',
          current_step: null,
          answer_version: 0,
          expires_at: '2026-05-15T12:00:00Z',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));

    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/match/session/match_fresh/intro');
    expect(window.localStorage.getItem('buurt-check-match-first-session-id')).toBe('match_fresh');
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match_stale', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ locale: 'en', source: 'landing' }),
    }));

    fetchSpy.mockRestore();
  });

  it('hydrates stored backend session answers before resuming the survey flow', async () => {
    window.localStorage.setItem('buurt-check-match-first-session-id', 'match_resume_backend');
    const fetchSpy = mockMatchFirstFetch({
      sessionId: 'match_resume_backend',
      getSessionBody: completeMatchSessionResponse('match_resume_backend'),
    });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));

    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();
    expect(readMatchSessionSnapshot('match_resume_backend')?.answers).toMatchObject(completeMatchAnswers);

    fireEvent.click(screen.getByRole('button', { name: 'Start the match' }));

    expect(await screen.findByRole('heading', { name: 'Ready to find your best neighborhoods?' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/match/session/match_resume_backend/review');

    fetchSpy.mockRestore();
  });

  it('routes the final survey CTA to a session run state without loading the legacy map', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match-review-run' });
    saveMatchSessionSnapshot('match-review-run', {
      sessionId: 'match-review-run',
      locale: 'en',
      step: 11,
      answerVersion: 11,
      staleResults: true,
      answers: completeMatchAnswers,
    });
    window.location.hash = '#/match/session/match-review-run/review';
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Show my matches' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match-review-run/run');
    });
    const sessionId = window.location.hash.split('/')[3];
    expect(localStorage.getItem(`buurt-check-match-first-job-status:${sessionId}`)).toBe('queued');
    expect(await screen.findByText('Getting your match ready')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-review-run', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-review-run/run', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        preference_vector_version: 'vector_match-review-run',
        source: 'review_final_cta',
      }),
    }));

    fetchSpy.mockRestore();
  });

  it('requires backend vector readback before the review CTA can enter run state', async () => {
    const fetchSpy = mockMatchFirstFetch({
      sessionId: 'match-review-sync-fail',
      getSessionBody: {
        session_id: 'match-review-sync-fail',
        locale: 'en',
        phase: 'review',
        current_step: 11,
        answer_version: 11,
        answers: completeMatchAnswers,
        validation: {},
        is_complete: false,
        preference_vector: null,
      },
    });
    saveMatchSessionSnapshot('match-review-sync-fail', {
      sessionId: 'match-review-sync-fail',
      locale: 'en',
      step: 11,
      answerVersion: 11,
      staleResults: true,
      answers: completeMatchAnswers,
    });
    window.location.hash = '#/match/session/match-review-sync-fail/review';
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Show my matches' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not sync your saved answers yet. Try again before opening your match map.');
    expect(window.location.hash).toBe('#/match/session/match-review-sync-fail/review');
    expect(localStorage.getItem('buurt-check-match-first-job-status:match-review-sync-fail')).toBeNull();

    fetchSpy.mockRestore();
  });

  it('blocks review completion when the backend vector does not match the displayed answers', async () => {
    const displayedAnswers: MatchFirstSurveyAnswers = {
      ...completeMatchAnswers,
      intent: 'rent',
      budget: { rent_max: 220000 },
    };
    const staleBackendAnswers: MatchFirstSurveyAnswers = {
      ...completeMatchAnswers,
      intent: 'buy',
      budget: { buy_min: 45000000, buy_max: 65000000 },
    };
    const fetchSpy = mockMatchFirstFetch({
      sessionId: 'match-review-stale-vector',
      getSessionBody: completeMatchSessionResponse('match-review-stale-vector', staleBackendAnswers),
    });
    saveMatchSessionSnapshot('match-review-stale-vector', {
      sessionId: 'match-review-stale-vector',
      locale: 'en',
      step: 11,
      answerVersion: 11,
      staleResults: true,
      answers: displayedAnswers,
    });
    window.location.hash = '#/match/session/match-review-stale-vector/review';
    renderApp();

    expect(await screen.findByText('Rent')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show my matches' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not sync your saved answers yet. Try again before opening your match map.');
    expect(window.location.hash).toBe('#/match/session/match-review-stale-vector/review');
    expect(localStorage.getItem('buurt-check-match-first-job-status:match-review-stale-vector')).toBeNull();

    fetchSpy.mockRestore();
  });

  it('creates a backend session before rendering a direct legacy survey route', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_direct_created' });
    window.location.hash = '#/match/survey';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match_direct_created/question/1');
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ locale: 'en', source: 'resume' }),
    }));

    fetchSpy.mockRestore();
  });

  it('creates a backend session before rendering the legacy quiz route', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_quiz_created' });
    window.location.hash = '#/match/quiz';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match_quiz_created/question/1');
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ locale: 'en', source: 'resume' }),
    }));

    fetchSpy.mockRestore();
  });

  it.each([
    ['run_pending', '#/match/session/match-pending/run', 'Getting your match ready'],
    ['matching_slow', '#/match/session/match-slow/run', 'This is taking longer than usual, but your match is still running.'],
    ['failed', '#/match/session/match-failed/run', "We couldn't create your match map yet. Your answers are saved, so you can try again without starting over."],
  ])('renders the %s match shell from stored Phase 1 job state', async (status, hash, expectedCopy) => {
    const sessionId = hash.split('/')[3];
    const fetchSpy = mockMatchFirstFetch({ sessionId });
    localStorage.setItem(`buurt-check-match-first-job-status:${sessionId}`, status);
    window.location.hash = hash;
    renderApp();

    expect(await screen.findByText(expectedCopy)).toBeInTheDocument();
    expect(screen.queryByText(/backend|polling|connected/i)).not.toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it('lets failed match progress retry without restarting the survey', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match-failed' });
    localStorage.setItem('buurt-check-match-first-job-status:match-failed', 'failed');
    window.location.hash = '#/match/session/match-failed/run';
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/match/sessions/match-failed/run', expect.objectContaining({
        method: 'POST',
      }));
    });
    expect(window.location.hash).toBe('#/match/session/match-failed/run');
    expect(localStorage.getItem('buurt-check-match-first-job-status:match-failed')).toBe('queued');
    expect(await screen.findByRole('status')).toHaveTextContent('Getting your match ready');
    fetchSpy.mockRestore();
  });

  it.each([
    ['completed_with_fallback', '#/match/session/match-fallback/results', 'We found your matches using the stable scoring model. Some advanced ranking features were skipped this time.'],
    ['no_results', '#/match/session/match-empty/results', 'No recommendation results are available yet.'],
    ['no_strong_matches', '#/match/session/match-weak/results', 'We found a few possible matches, but your strongest constraints are narrowing the result set.'],
  ])('ignores unverified terminal %s storage on direct results routes', async (status, hash, forbiddenCopy) => {
    const sessionId = hash.split('/')[3];
    localStorage.setItem(`buurt-check-match-first-job-status:${sessionId}`, status);
    window.location.hash = hash;
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
    expect(screen.getByText('Your answers are saved. Results will appear here when matching is available.')).toBeInTheDocument();
    expect(screen.getByText('Results are not available yet.')).toBeInTheDocument();
    expect(screen.queryByText(forbiddenCopy)).not.toBeInTheDocument();
  });

  it('restores a direct review route from the saved survey answer', async () => {
    const savedAnswers: MatchFirstSurveyAnswers = { ...completeMatchAnswers, intent: 'rent' };
    const fetchSpy = mockMatchFirstFetch({
      sessionId: 'match-review-123',
      getSessionBody: completeMatchSessionResponse('match-review-123', savedAnswers),
    });
    saveMatchSessionSnapshot('match-review-123', {
      sessionId: 'match-review-123',
      locale: 'en',
      step: 11,
      answerVersion: 11,
      staleResults: true,
      answers: savedAnswers,
    });
    window.location.hash = '#/match/session/match-review-123/review';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Ready to find your best neighborhoods?' })).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show my matches' }));
    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match-review-123/run');
    });

    fetchSpy.mockRestore();
  });

  it.each([
    ['run', '#/match/session/match-stale/run'],
  ])('shows recovery copy for direct %s route without a started match job', async (_label, hash) => {
    window.location.hash = hash;
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Your match map is not ready' })).toBeInTheDocument();
    expect(screen.getByText('Your answers are saved. Results will appear here when matching is available.')).toBeInTheDocument();
    expect(screen.queryByText('Your neighborhood matches are ready.')).not.toBeInTheDocument();
  });

  it('gates a direct neighborhood route until completed match results exist', async () => {
    window.location.hash = '#/match/session/match-stale/neighborhood/BU0363AA01';
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
    });
    expect(screen.getByText('Your answers are saved. Results will appear here when matching is available.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Selected neighborhood context' })).not.toBeInTheDocument();
  });

  it('does not let persisted Dossier return context unlock a direct neighborhood route', async () => {
    localStorage.setItem('buurt-check-match-first-return-context:match-stale', JSON.stringify({
      target: '#/match/session/match-stale/neighborhood/BU0363AA01',
      sessionId: 'match-stale',
      neighborhoodId: 'BU0363AA01',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      selectedResultId: 'result-2',
      selectedResultRank: 2,
      selectedHouseId: 'house-7',
    }));
    window.location.hash = '#/match/session/match-stale/neighborhood/BU0363AA01';
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
    });
    expect(screen.getByText('Your answers are saved. Results will appear here when matching is available.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Selected neighborhood context' })).not.toBeInTheDocument();
  });

  it('redirects direct survey question routes to the first unanswered required step', async () => {
    window.location.hash = '#/match/session/match-direct/question/8';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match-direct/question/1');
    });
  });

  it('redirects direct survey question routes past the saved progress to the next incomplete step', async () => {
    saveMatchSessionSnapshot('match-direct-progress', {
      sessionId: 'match-direct-progress',
      locale: 'en',
      step: 1,
      answerVersion: 1,
      staleResults: true,
      answers: { intent: 'both' },
    });
    window.location.hash = '#/match/session/match-direct-progress/question/8';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'What budget range should we respect?' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/match/session/match-direct-progress/question/2');
    });
  });

  it.each([
    'completed',
    'completed_with_fallback',
    'no_results',
    'no_strong_matches',
  ])('shows a neutral success-route placeholder even when %s is stored locally', async (status) => {
    localStorage.setItem('buurt-check-match-first-job-status:match-123', status);
    window.location.hash = '#/match/session/match-123/success';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Match status unavailable' })).toBeInTheDocument();
    expect(screen.getByText('We cannot confirm that matching finished yet. Return to the survey before opening the map.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Results unavailable' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your neighborhood matches are ready.')).not.toBeInTheDocument();
  });

  it('keeps survey answers in App state when localStorage writes fail', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_storage_fail' });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    try {
      window.location.hash = '#/match/survey';
      renderApp();

      fireEvent.click(await screen.findByRole('radio', { name: 'Both' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      expect(await screen.findByRole('heading', { name: 'What budget range should we respect?' })).toBeInTheDocument();
    } finally {
      setItemSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it('renders neutral results shell instead of finish-first recovery for stored completed state', async () => {
    localStorage.setItem('buurt-check-match-first-job-status:match-123', 'completed');
    window.location.hash = '#/match/session/match-123/results';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('Finish the match first')).not.toBeInTheDocument();
    expect(screen.queryByText('Finish the match first to see your personal map.')).not.toBeInTheDocument();
  });

  it('gates direct legacy #/match/map access instead of auto-loading old recommendations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    window.location.hash = '#/match/map';
    renderApp();

    expect(await screen.findByText('Finish the match first to see your personal map.')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Search' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('moves focus to the screen heading after match route transitions', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_focus' });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));
    const heading = await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' });

    await waitFor(() => {
      expect(heading).toHaveFocus();
    });

    fetchSpy.mockRestore();
  });

  it('applies user hash changes after app-driven match navigation', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_hash_change' });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));
    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();

    await act(async () => {
      window.history.pushState(null, '', '#/search');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'First, we need to understand how you want to live.' })).not.toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('applies browser back and forward popstate route changes after app-driven navigation', async () => {
    const fetchSpy = mockMatchFirstFetch({ sessionId: 'match_popstate' });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Find my dream neighborhood' }));
    expect(await screen.findByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();

    await act(async () => {
      window.history.pushState(null, '', '#/match/session/match-pop/question/1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(await screen.findByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('keeps the address search available on #/search', () => {
    window.location.hash = '#/search';
    renderApp();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not render building card or map', async () => {
    renderApp();
    await screen.findByRole('button', { name: 'Find my dream neighborhood' });
    expect(screen.queryByText('Building Facts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});

describe('tab content transitions', () => {
  it('renders saved content after switching tabs', async () => {
    window.location.hash = '#/search';
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    await waitFor(() => {
      expect(screen.getByTestId('shortlist-screen')).toBeInTheDocument();
    });
  });

  it('routes the Home tab back to the match-first landing', async () => {
    window.location.hash = '#/search';
    renderApp();

    fireEvent.click(screen.getByRole('tab', { name: 'Match' }));

    expect(window.location.hash).toBe('#/match');
    expect(await screen.findByRole('button', { name: 'Find my dream neighborhood' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('hash route recovery', () => {
  it('shows a Dossier return action when the route carries match-map context', async () => {
    localStorage.setItem('buurt-check-match-first-job-status:match-123', 'completed');
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22mobileMode%22%3A%22list%22%2C%22selectedResultId%22%3A%22result-2%22%2C%22selectedResultRank%22%3A2%2C%22language%22%3A%22nl%22%2C%22selectedHouseId%22%3A%22house-7%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { container } = renderApp();
    await waitForDossierLoaded();

    const backToMap = screen.getByRole('button', { name: 'Back to match map' });
    expect(screen.getByText('Selected neighborhood: BU0363AA01')).toBeInTheDocument();
    fireEvent.click(backToMap);

    expect(window.location.hash).toBe('#/match/session/match-123/neighborhood/BU0363AA01');
    await waitFor(() => {
      expect(i18nInstance.language).toMatch(/^nl/);
    });
    await waitFor(() => {
      const restored = container.querySelector('[data-session-id="match-123"]');
      expect(restored).toHaveAttribute('data-neighborhood-id', 'BU0363AA01');
      expect(restored).toHaveAttribute('data-map-center', '[52.36,4.9]');
      expect(restored).toHaveAttribute('data-map-zoom', '13');
      expect(restored).toHaveAttribute('data-list-scroll', '240');
      expect(restored).toHaveAttribute('data-mobile-mode', 'list');
      expect(restored).toHaveAttribute('data-selected-result-id', 'result-2');
      expect(restored).toHaveAttribute('data-selected-result-rank', '2');
      expect(restored).toHaveAttribute('data-selected-house-id', 'house-7');
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('records match Dossier-open analytics only after a match-return Dossier hydrates', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22jobId%22%3A%22match_job_123%22%2C%22resultSetId%22%3A%22mrs_123%22%2C%22preferenceVectorVersion%22%3A%22pv_v1%22%2C%22source%22%3A%22match_map%22%2C%22buildingId%22%3A%22bldg_BU0363AA01_001%22%2C%22selectedResultId%22%3A%22rec_1%22%2C%22selectedResultRank%22%3A1%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22bldg_BU0363AA01_001%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const { container } = renderApp();
    expect(readMatchFirstAnalyticsEvents().map((event) => event.event_name)).not.toContain('match_dossier_opened');

    await waitForDossierLoaded();

    expect(container.querySelector('.app__screen[data-match-motion="reduced"]')).toBeInTheDocument();
    expect(readMatchFirstAnalyticsEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_name: 'match_dossier_opened',
        context: expect.objectContaining({
          source: 'match_map',
          session_id: 'match-123',
          result_set_id: 'mrs_123',
          neighborhood_id: 'BU0363AA01',
          recommendation_id: 'rec_1',
          result_rank: 1,
          selected_house_id: 'bldg_BU0363AA01_001',
          building_id: 'bldg_BU0363AA01_001',
        }),
      }),
    ]));
  });

  it('does not record Dossier-open analytics when a match bridge route is accepted but lookup fails', async () => {
    window.location.hash = '#/address/vbo-err?lookup=adr-error&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22jobId%22%3A%22match_job_123%22%2C%22resultSetId%22%3A%22mrs_123%22%2C%22preferenceVectorVersion%22%3A%22pv_v1%22%2C%22source%22%3A%22match_map%22%2C%22buildingId%22%3A%22bldg_BU0363AA01_001%22%2C%22selectedResultId%22%3A%22rec_1%22%2C%22selectedResultRank%22%3A1%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22bldg_BU0363AA01_001%22%7D';
    mockLookup.mockRejectedValue(new Error('Lookup failed'));

    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Back to match map' }).length).toBeGreaterThan(0);
    });
    expect(readMatchFirstAnalyticsEvents().map((event) => event.event_name)).not.toContain('match_dossier_opened');
  });

  it('restores selected-neighborhood context from Dossier back without structured match_context', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const { container } = renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    expect(window.location.hash).toBe('#/match/session/match-123/neighborhood/BU0363AA01');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Selected neighborhood context' })).toBeInTheDocument();
    });
    const restored = container.querySelector('[data-session-id="match-123"]');
    expect(restored).toHaveAttribute('data-neighborhood-id', 'BU0363AA01');
    expect(restored).not.toHaveAttribute('data-map-center');
    expect(restored).not.toHaveAttribute('data-map-zoom');
    expect(restored).not.toHaveAttribute('data-list-scroll');
    expect(restored).not.toHaveAttribute('data-selected-house-id');
  });

  it('restores returned match-map context after refreshing the selected-neighborhood route', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22mobileMode%22%3A%22list%22%2C%22selectedResultId%22%3A%22result-2%22%2C%22selectedResultRank%22%3A2%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22house-7%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const firstRender = renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));
    await waitFor(() => {
      expect(firstRender.container.querySelector('[data-selected-house-id="house-7"]')).toBeInTheDocument();
    });

    firstRender.unmount();
    window.location.hash = '#/match/session/match-123/neighborhood/BU0363AA01';
    const refreshed = renderApp();

    await waitFor(() => {
      const restored = refreshed.container.querySelector('[data-session-id="match-123"]');
      expect(restored).toHaveAttribute('data-neighborhood-id', 'BU0363AA01');
      expect(restored).toHaveAttribute('data-map-center', '[52.36,4.9]');
      expect(restored).toHaveAttribute('data-map-zoom', '13');
      expect(restored).toHaveAttribute('data-list-scroll', '240');
      expect(restored).toHaveAttribute('data-mobile-mode', 'list');
      expect(restored).toHaveAttribute('data-selected-result-id', 'result-2');
      expect(restored).toHaveAttribute('data-selected-result-rank', '2');
      expect(restored).toHaveAttribute('data-selected-house-id', 'house-7');
    });
    expect(screen.getByText('Your match-map context is restored. Neighborhood details are not available yet.')).toBeInTheDocument();
    expect(screen.queryByText('3D houses load only after a neighborhood is selected.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to survey' })).toBeInTheDocument();
  });

  it('replaces restored Dossier return context when a second house is opened from the match map', async () => {
    localStorage.setItem('buurt-check-match-first-job-status:match-123', 'completed');
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22house-7%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const { container } = renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    await waitFor(() => {
      expect(container.querySelector('[data-selected-house-id="house-7"]')).toBeInTheDocument();
    });

    window.location.hash = '#/address/vbo-456?lookup=adr-second&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.37%2C4.91%5D%2C%22mapZoom%22%3A15%2C%22listScroll%22%3A480%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22house-12%22%7D';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    await waitFor(() => {
      const restored = container.querySelector('[data-session-id="match-123"]');
      expect(restored).toHaveAttribute('data-map-center', '[52.37,4.91]');
      expect(restored).toHaveAttribute('data-map-zoom', '15');
      expect(restored).toHaveAttribute('data-list-scroll', '480');
      expect(restored).toHaveAttribute('data-selected-house-id', 'house-12');
    });
  });

  it('keeps a match-return Dossier route without lookup recoverable instead of redirecting to Search', async () => {
    window.location.hash = '#/address/0363100012345678?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01';
    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Back to match map' }).length).toBeGreaterThan(0);
    });
    const unavailableState = screen.getByRole('alert');
    expect(within(unavailableState).getByRole('heading', { name: 'Address unavailable' })).toBeInTheDocument();
    expect(within(unavailableState).getByText('We found the building, but not a reliable address yet.')).toBeInTheDocument();
    expect(within(unavailableState).queryByRole('button', { name: 'Choose nearby address' })).not.toBeInTheDocument();
    expect(within(unavailableState).queryByText('Nearby address choices will appear here when available.')).not.toBeInTheDocument();
    expect(within(unavailableState).getByRole('button', { name: 'Search manually' })).toBeInTheDocument();
    expect(within(unavailableState).getByRole('button', { name: 'Back to match map' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/address/0363100012345678?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mockLookup).not.toHaveBeenCalled();

    fireEvent.click(within(unavailableState).getByRole('button', { name: 'Back to match map' }));
    expect(window.location.hash).toBe('#/match/session/match-123/neighborhood/BU0363AA01');
    expect(await screen.findByRole('heading', { name: 'Selected neighborhood context' })).toBeInTheDocument();
  });

  it('preserves match-return context when the Dossier fallback uses manual search', async () => {
    window.location.hash = '#/address/0363100012345678?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22house-7%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const { container } = renderApp();
    await screen.findByRole('alert');

    const user = userEvent.setup();
    const searchManuallyButton = await screen.findByRole('button', { name: 'Search manually' });
    await user.click(searchManuallyButton);
    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/search/);
    });
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    await selectAddress();
    await waitForDossierLoaded();

    expect(window.location.hash).toContain('match_return=');
    expect(window.location.hash).toContain('match_session=match-123');
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    expect(window.location.hash).toBe('#/match/session/match-123/neighborhood/BU0363AA01');
    await waitFor(() => {
      const restored = container.querySelector('[data-session-id="match-123"]');
      expect(restored).toHaveAttribute('data-map-center', '[52.36,4.9]');
      expect(restored).toHaveAttribute('data-map-zoom', '13');
      expect(restored).toHaveAttribute('data-list-scroll', '240');
      expect(restored).toHaveAttribute('data-selected-house-id', 'house-7');
    });
  });

  it('preserves match-return context when changing address from a loaded Dossier', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22language%22%3A%22en%22%2C%22selectedHouseId%22%3A%22house-7%22%7D';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await waitForDossierLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Change address' }));

    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/search\?/);
    });
    expect(window.location.hash).toContain('match_return=');
    expect(window.location.hash).toContain('match_session=match-123');
    expect(window.location.hash).toContain('match_context=');
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('still redirects a bare non-match Dossier hash without lookup to search and shows a toast', async () => {
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

  it('keeps the match return action visible while a Dossier lookup is still loading', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fresults&match_session=match-123';
    mockLookup.mockReturnValue(new Promise(() => {}));

    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Back to match map' }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to match map' })[0]);
    expect(window.location.hash).toBe('#/match/session/match-123/results');
  });

  it('keeps the match return action visible after a Dossier lookup error', async () => {
    window.location.hash = '#/address/vbo-err?lookup=adr-error&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fresults&match_session=match-123';
    mockLookup.mockRejectedValue(new Error('Lookup failed'));

    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Back to match map' }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to match map' })[0]);
    expect(window.location.hash).toBe('#/match/session/match-123/results');
  });

  it('records Back-to-map return success only after results hydration completes', async () => {
    const encodedContext = encodeURIComponent(JSON.stringify({
      jobId: 'match_job_match-123',
      resultSetId: 'mrs_match-123',
      preferenceVectorVersion: 'vector_match-123',
      source: 'match_map',
      returnUrl: '#/match/session/match-123/results',
      selectedHouseId: 'house-7',
      language: 'en',
    }));
    window.location.hash = `#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fresults&match_session=match-123&match_context=${encodedContext}`;
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    let resolveResults!: (response: Response) => void;
    const resultsPromise = new Promise<Response>((resolve) => {
      resolveResults = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/match/sessions/match-123/results')) {
        return resultsPromise;
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    expect(window.location.hash).toBe('#/match/session/match-123/results');
    expect(readMatchFirstAnalyticsEvents().map((event) => event.event_name)).toContain('match_back_to_map_clicked');
    expect(readMatchFirstAnalyticsEvents().map((event) => event.event_name)).not.toContain('match_back_to_map_return_success');

    await act(async () => {
      resolveResults(new Response(JSON.stringify(completedMatchResultsResponse('match-123')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    await waitFor(() => {
      expect(readMatchFirstAnalyticsEvents().map((event) => event.event_name)).toContain('match_back_to_map_return_success');
    });
  });

  it('records Back-to-map return failure only after results hydration fails', async () => {
    const encodedContext = encodeURIComponent(JSON.stringify({
      jobId: 'match_job_match-123',
      resultSetId: 'mrs_match-123',
      preferenceVectorVersion: 'vector_match-123',
      source: 'match_map',
      returnUrl: '#/match/session/match-123/results',
      selectedHouseId: 'house-7',
      language: 'en',
    }));
    window.location.hash = `#/address/vbo-123?lookup=adr-abc123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fresults&match_session=match-123&match_context=${encodedContext}`;
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/match/sessions/match-123/results')) {
        return new Response(JSON.stringify({ detail: 'match.results.unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    await waitFor(() => {
      const events = readMatchFirstAnalyticsEvents();
      expect(events.map((event) => event.event_name)).toContain('match_back_to_map_return_failed');
      expect(events.map((event) => event.event_name)).not.toContain('match_back_to_map_return_success');
    });
  });

  it('preserves structured match_context from a cold-start URL query when the hash carries the Dossier path', async () => {
    window.history.replaceState(
      {},
      '',
      '/?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22language%22%3A%22nl%22%2C%22selectedHouseId%22%3A%22house-7%22%7D#/address/vbo-123?lookup=adr-abc123',
    );
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    const { container } = renderApp();
    await waitForDossierLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back to match map' }));

    expect(window.location.hash).toBe('#/match/session/match-123/neighborhood/BU0363AA01');
    await waitFor(() => {
      const restored = container.querySelector('[data-session-id="match-123"]');
      expect(restored).toHaveAttribute('data-map-center', '[52.36,4.9]');
      expect(restored).toHaveAttribute('data-map-zoom', '13');
      expect(restored).toHaveAttribute('data-list-scroll', '240');
      expect(restored).toHaveAttribute('data-selected-house-id', 'house-7');
    });
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

  it('routes invalid match question URLs to match recovery and focuses the match action', async () => {
    await i18nInstance.changeLanguage('nl');
    window.location.hash = '#/match/session/match-123/question/nope';
    renderApp();

    expect(await screen.findByRole('heading', { name: 'We konden die pagina niet vinden' })).toBeInTheDocument();
    const matchRecovery = screen.getByRole('button', { name: 'Terug naar vragen' });
    expect(matchRecovery).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Zoek een adres' })).toBeInTheDocument();
    expect(screen.queryByText(/could not find that page/i)).not.toBeInTheDocument();

    fireEvent.click(matchRecovery);

    expect(window.location.hash).toBe('#/match/session/match-123/question/1');
    expect(await screen.findByRole('heading', { name: 'Wil je kopen, huren of allebei?' })).toBeInTheDocument();
  });
});

describe('address selection flow', () => {
  it('does not render source coverage age metadata above the risk tiles', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();
    await waitForDossierLoaded();

    await waitFor(() => {
      expect(screen.getByTestId('risk-tile-noise')).toBeInTheDocument();
    });
    expect(screen.queryByText(/sources loaded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Newest:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Oldest:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stale source/i)).not.toBeInTheDocument();
  });

  it('creates the source run immediately after address selection without rendering the free briefing card', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockFetchPrebidBriefing).toHaveBeenCalledWith(
        'vbo-123',
        expect.objectContaining({
          report_id: 'report-123',
          confirmed_address: 'Keizersgracht 100, 1015AA Amsterdam',
          postcode: '1015AA',
          municipality: 'Amsterdam',
          rd_x: 121000,
          rd_y: 487000,
          lat: 52.3676,
          lng: 4.8846,
        }),
        expect.any(AbortSignal),
      );
    });
    expect(screen.queryByText('Confirm the property')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start source checks/i })).not.toBeInTheDocument();
    await waitForDossierLoaded();
    expect(screen.queryByTestId('prebid-briefing-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Backend permit signal should be checked.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open source coverage/i })).not.toBeInTheDocument();
  });

  it('fetches the buyer-bound backend pack before rendering the pack route', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();
    await act(async () => {
      window.location.hash = '#/pack/vbo-123/report-123';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() => {
      expect(mockFetchPrebidPack).toHaveBeenCalledWith(
        'vbo-123',
        'report-123',
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('Pre-Bid Evidence & Questions Pack')).toBeInTheDocument();
    expect(screen.getByText('Keizersgracht 100, 1015AA Amsterdam')).toBeInTheDocument();
  });

  it('creates scoped pack share links through the backend API', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();
    await act(async () => {
      window.location.hash = '#/pack/vbo-123/report-123';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByTestId('pack-view');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Share pack/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy scoped link/i }));
    });

    await waitFor(() => {
      expect(mockSharePrebidPack).toHaveBeenCalledWith(
        'vbo-123',
        'report-123',
        { consent_to_share: true },
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('https://app.buurt-check.nl/#/shared-pack/backend-pack-token')).toBeInTheDocument();
  });

  it('loads shared pack routes from scoped token APIs', async () => {
    window.location.hash = '#/shared-pack/backend-pack-token';

    renderApp();

    await waitFor(() => {
      expect(mockFetchSharedPrebidPack).toHaveBeenCalledWith(
        'backend-pack-token',
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('Shared pack address')).toBeInTheDocument();
  });

  it('uses the scrubbed prebid analytics path for briefing failures', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockFetchPrebidBriefing.mockRejectedValue(new ApiError('error.server', 500));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockTrackPrebidEvent).toHaveBeenCalledWith(
        'briefing_failed',
        expect.objectContaining({ reason: 'api_error' }),
      );
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'prebid_briefing_failed',
      expect.objectContaining({
        vbo_id: expect.any(String),
        report_id: expect.any(String),
      }),
    );
  });

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

  it('recovers stale recent lookup ids by re-searching from the saved address text', async () => {
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      {
        id: 'adr-stale-example',
        display_name: 'Keizersgracht 1, 1015CD Amsterdam',
        timestamp: Date.now() - 60_000,
      },
    ]));
    mockLookup
      .mockRejectedValueOnce(new ApiError('error.data_source', 404))
      .mockResolvedValue(makeResolvedAddress({
        id: 'adr-live-example',
        display_name: 'Keizersgracht 1-1, 1015CC Amsterdam',
      }));
    mockSuggest.mockResolvedValue({
      suggestions: [
        makeSuggestion({
          id: 'adr-wrong-match',
          display_name: 'Keizersgracht 25A, 1015CD Amsterdam',
        }),
        makeSuggestion({
          id: 'adr-live-example',
          display_name: 'Keizersgracht 1-1, 1015CC Amsterdam',
        }),
      ],
    });
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    window.location.hash = '#/search';
    renderApp();

    await act(async () => {
      fireEvent.pointerDown(screen.getByText('Keizersgracht 1, 1015CD Amsterdam'), {
        button: 0,
        isPrimary: true,
        pointerType: 'touch',
      });
    });
    await waitFor(() => {
      expect(mockLookup).toHaveBeenNthCalledWith(1, 'adr-stale-example', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(mockSuggest).toHaveBeenCalledWith('Keizersgracht 1, Amsterdam', 5, expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(mockLookup).toHaveBeenNthCalledWith(2, 'adr-live-example', expect.any(AbortSignal));
    });
    await waitForDossierLoaded();
    expect(
      screen.queryByText("We couldn't load data from this source right now. Try again in a moment."),
    ).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('buurt-check-recent-searches') ?? '[]')).toEqual([
      expect.objectContaining({
        id: 'adr-live-example',
        display_name: 'Keizersgracht 1-1, 1015CC Amsterdam',
        postcode: '1015AA',
        city: 'Amsterdam',
      }),
    ]);
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

    await waitForDossierLoaded();
  });

  it('does not crash when getRiskCards fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValue(new Error('Risk API down'));

    renderApp();
    await selectAddress();

    // Should still render building facts card without error
    await waitForDossierLoaded();
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
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
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
    expect(screen.queryByText("We couldn't generate the PDF. Try again. Your briefing data is still available.")).not.toBeInTheDocument();
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
    expect(screen.getByText('Full dossier (€3.99)')).toBeInTheDocument();
    expect(screen.queryByTestId('export-buy-price')).not.toBeInTheDocument();
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
      within(screen.getByTestId('export-sheet')).getByRole('radio', { name: paidPackRadioName }),
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

    await waitForDossierLoaded();
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

    await waitForDossierLoaded();
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
        name: paidPackActionName,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
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
        name: paidPackActionName,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
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
        name: paidPackActionName,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
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
        name: paidPackActionName,
        hidden: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));

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

  it('shows the dedicated unavailable message when checkout-session returns Stripe-config 503', async () => {
    window.location.hash = '#/address/vbo-123?lookup=adr-abc123';
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockCreateCheckoutSession.mockRejectedValue(
      new ApiError('premium.checkout.unavailable', 503),
    );

    renderApp();

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: paidPackBuyName }));
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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: paidPackBuyName }));
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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
    fireEvent.click(within(screen.getByTestId('export-sheet')).getByRole('radio', { name: 'NL' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: paidPackBuyName }));
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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: paidPackBuyName }));
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
      'Your Full dossier is ready. Tap Download to save it.',
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
        screen.getAllByText('Payment received — your Full dossier will unlock shortly.').length,
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
        'Unlock is taking longer than expected. Retry to check your Full dossier again.',
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
    await waitForDossierLoaded();

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
    await waitForDossierLoaded();
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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy in App Store/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Full dossier ($4.99)')).toBeInTheDocument();
    expect(screen.queryByTestId('export-buy-price')).not.toBeInTheDocument();

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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', {
      name: /Unlock Full Report \(€3\.99\)/i,
      hidden: true,
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Buy in App Store/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Full dossier (€3.99)')).toBeInTheDocument();
    expect(screen.queryByTestId('export-buy-price')).not.toBeInTheDocument();
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
    await waitForDossierLoaded();

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

    await waitForDossierLoaded();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {
        name: paidPackActionName,
        hidden: true,
      }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('radio', { name: paidPackRadioName }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy in App Store/i }));
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Payment received — your Full dossier will unlock shortly.',
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
    await waitForDossierLoaded();
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
    // SunlightRiskCard is paid-export only, not shown in viewer.
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
    // SunlightRiskCard is paid-export only, not shown in viewer.
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

  it('does not render the removed registered-safety section in the app dossier', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({
      buurt_code: 'BU0363AD07',
    }));
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitForDossierLoaded();
    expect(screen.queryByTestId('tier-b-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/registered safety/i)).not.toBeInTheDocument();
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

    await waitForDossierLoaded();
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
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
      expect(screen.getByTestId('address-header')).toBeInTheDocument();
      expect(document.querySelector('.risk-tiles-grid')).toBeInTheDocument();
      expect(screen.getByTestId('livability-card')).toBeInTheDocument();
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByTestId('neighborhood-stats')).toBeInTheDocument();
      expect(screen.getByTestId('viewing-checklist')).toBeInTheDocument();
      expect(screen.getByTestId('action-bar')).toBeInTheDocument();
    });

    // Get the dossier sheet container and verify relative ordering
    const dossier = screen.getByTestId('dossier-sheet');
    const all = dossier.querySelectorAll(
      '[data-testid="attention-summary"], ' +
      '.building-card, ' +
      '.risk-tiles-grid, ' +
      '[data-testid="livability-card"], ' +
      '[data-testid="viewer-3d"], ' +
      '[data-testid="neighborhood-stats"], ' +
      '[data-testid="viewing-checklist"], ' +
      '[data-testid="action-bar"]'
    );
    const order = Array.from(all).map((el) => {
      const tid = el.getAttribute('data-testid');
      if (tid === 'attention-summary') return 'attention';
      if (el.classList.contains('building-card')) return 'building';
      if (el.classList.contains('risk-tiles-grid')) return 'risk';
      if (tid === 'livability-card') return 'livability';
      if (tid === 'viewer-3d') return 'viewer-3d';
      if (tid === 'neighborhood-stats') return 'stats';
      if (tid === 'viewing-checklist') return 'checklist';
      if (tid === 'action-bar') return 'actionbar';
      return 'unknown';
    });

    // Verify canonical dossier order:
    // AttentionSummary → combined AddressHeader/BuildingFacts → RiskTiles →
    // Livability → 3D Viewer →
    // NeighborhoodStats → ViewingChecklist → ActionBar
    const expected = [
      'attention', 'building', 'risk',
      'livability', 'viewer-3d',
      'stats', 'checklist', 'actionbar',
    ];
    const filtered = order.filter(s => expected.includes(s));
    expect(filtered).toEqual(expected);

    const buildingCard = dossier.querySelector('.building-card');
    expect(buildingCard).toContainElement(screen.getByTestId('address-header'));
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
    expect(uniqueIndexes).toEqual([0, 1, 2, 4, 5, 6, 8]);
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
      expect(mockPropertyWarnings).toHaveBeenCalledTimes(1);
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

  it('does not duplicate secondary dossier fetches during the initial load', async () => {
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
      expect(mockRiskComparisons).toHaveBeenCalledTimes(1);
      expect(mockViewingQuestions).toHaveBeenCalledTimes(1);
      expect(mockLivability).toHaveBeenCalledTimes(1);
      expect(mockPropertyWarnings).toHaveBeenCalledTimes(1);
    });
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
    const buildingDeferred: { resolve: (value: ReturnType<typeof makeBuildingResponse>) => void } = {
      resolve: () => undefined,
    };
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
