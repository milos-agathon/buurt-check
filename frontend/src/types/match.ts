export type MatchLocale = 'en' | 'nl';
export type JourneyIntent = 'buy' | 'rent' | 'both';
type HouseholdType = 'starter' | 'single' | 'couple' | 'family' | 'future_family' | 'other';
type PersonaOverlayType =
  | 'family'
  | 'newcomer'
  | 'city_escape'
  | 'single_couple'
  | 'buyer'
  | 'renter'
  | 'starter';

interface UserPreferenceProfile {
  profile_id: string;
  session_id?: string | null;
  locale: MatchLocale;
  household_type: HouseholdType;
  newcomer_status: 'yes' | 'no' | 'prefer_not_to_say' | 'unknown';
}

interface PreferenceVector {
  preference_vector_id: string;
  session_id?: string | null;
  profile_id?: string | null;
  journey_intent: JourneyIntent;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  monthly_rent_max_cents?: number | null;
  anchor_locations: Array<Record<string, unknown>>;
  commute_limits: Array<Record<string, unknown>>;
  property_types: string[];
  hard_filters: string[];
  nice_to_haves: string[];
  avoid_signals: string[];
  lifestyle_weights: Record<string, number>;
  persona_inputs: Record<string, unknown>;
  locale: MatchLocale;
  method_version: string;
}

interface PersonaOverlay {
  type: PersonaOverlayType;
  confidence: number;
  reasons: string[];
}

interface MatchValidationWarning {
  code: string;
  severity: 'info' | 'warning';
  field?: string | null;
}

export interface MatchQuizResponse {
  profile: UserPreferenceProfile;
  preference_vector: PreferenceVector;
  persona_overlays: PersonaOverlay[];
  validation_warnings: MatchValidationWarning[];
  estimated_completion_minutes: [number, number];
  prd_traceability: string[];
  analytics_event: 'match_quiz_completed';
}

type DataFreshnessStatus = 'current' | 'aging' | 'stale' | 'unavailable' | 'mock' | 'conflict';
type ConfidenceLabel = 'high' | 'medium' | 'low';
type MatchReportStatus = 'generated' | 'fallback' | 'invalid';
type ReportGeneratedBy = 'ai' | 'deterministic_fallback';
type ReportValidationStatus = 'passed' | 'fallback_used' | 'blocked';
type ReportSectionType =
  | 'profile_summary'
  | 'top_neighborhood_matches'
  | 'why_these_neighborhoods_fit'
  | 'tradeoffs_and_watchouts'
  | 'similar_neighborhoods'
  | 'live_homes_available_now'
  | 'suggested_alerts'
  | 'next_steps';

interface ConfidenceScore {
  score: number;
  label?: ConfidenceLabel | null;
  reasons: string[];
}

export interface MetricSource {
  source_id: string;
  source_name: string;
  source_type: 'official' | 'commercial' | 'derived' | 'mock' | 'user_provided' | 'missing';
  metric_name: string;
  license_status: 'open' | 'licensed' | 'mock' | 'unknown' | 'unavailable';
  measurement_date?: string | null;
  retrieved_at?: string | null;
  geography_level: 'neighborhood' | 'district' | 'municipality' | 'custom_seed';
  method_version: string;
  limitations: string[];
  confidence: number;
  freshness_status: DataFreshnessStatus;
}

interface RecommendationExplanation {
  code: string;
  evidence_refs: string[];
}

interface ScoreDriver {
  feature: string;
  impact: number;
  score: number;
  source_refs: string[];
}

interface NeighborhoodMatchScore {
  recommendation_id: string;
  neighborhood_id: string;
  name: string;
  municipality: string;
  rank: number;
  category: 'top' | 'surprising' | 'stretch' | 'avoid_or_reconsider' | null;
  fit_score: number;
  eligibility_status: 'eligible' | 'stretch' | 'failed_hard_filter' | 'insufficient_data';
  component_scores: Record<string, number>;
  why_it_fits: RecommendationExplanation[];
  tradeoffs: RecommendationExplanation[];
  score_drivers: ScoreDriver[];
  failed_filters: string[];
  confidence: ConfidenceScore;
  freshness_status: DataFreshnessStatus;
  data_freshness_indicator: string;
  source_refs: string[];
  evidence_refs: string[];
  missing_features: string[];
}

interface RecommendationSet {
  top: NeighborhoodMatchScore[];
  surprising: NeighborhoodMatchScore[];
  stretch: NeighborhoodMatchScore[];
  avoid_or_reconsider: NeighborhoodMatchScore[];
  empty_result_relaxations: string[];
  source_coverage: string[];
}

export interface MatchRecommendationsResponse {
  preference_vector_id: string;
  locale: MatchLocale;
  recommendations: RecommendationSet;
  evidence_items: RecommendationEvidence[];
  source_coverage: string[];
  empty_state_code?: string | null;
  feedback_adjustment?: {
    applied: boolean;
    explanation_code: string;
    adjusted_weight_inputs: Record<string, number>;
  };
}

interface SimilarNeighborhoodResult {
  neighborhood_id: string;
  name: string;
  municipality: string;
  similarity_score: number;
  shared_drivers: ScoreDriver[];
  meaningful_differences: ScoreDriver[];
  constraints: RecommendationExplanation[];
  confidence: ConfidenceScore;
  source_refs: string[];
}

export interface MatchSimilarPayload {
  source_neighborhood_id: string;
  preference_vector_id?: string | null;
  filters: Partial<Record<'cheaper' | 'greener' | 'calmer', boolean>>;
  limit?: number;
}

export interface MatchSimilarResponse {
  source_neighborhood_id: string;
  results: SimilarNeighborhoodResult[];
  unsupported_regions: string[];
  empty_state_code?: string | null;
}

interface ComparisonCell {
  value?: number | null;
  display_value: string;
  state: 'available' | 'missing' | 'stale' | 'mock';
  confidence: number;
  freshness_status: DataFreshnessStatus;
  source_refs: string[];
  sources: MetricSource[];
  limitations: string[];
}

interface ComparisonIndicatorRow {
  indicator_key: string;
  label_code: string;
  cells: Record<string, ComparisonCell>;
}

interface ComparisonNeighborhoodSummary {
  neighborhood_id: string;
  name: string;
  municipality: string;
  score: number;
  dimension_scores: Record<string, number | null>;
  evidence: RecommendationExplanation[];
  tradeoffs: RecommendationExplanation[];
  confidence: ConfidenceScore;
  freshness_status: DataFreshnessStatus;
  missing_data: string[];
  source_refs: string[];
}

export interface MatchComparePayload {
  preference_vector_id?: string | null;
  neighborhood_ids: string[];
  locale: MatchLocale;
}

export interface MatchCompareResponse {
  preference_vector_id?: string | null;
  locale: MatchLocale;
  neighborhoods: ComparisonNeighborhoodSummary[];
  indicators: ComparisonIndicatorRow[];
  source_coverage: string[];
  missing_data_states: string[];
}

interface RecommendationEvidence {
  evidence_id: string;
  claim_code: string;
  metric_keys: string[];
  source_refs: string[];
  confidence: ConfidenceScore;
  freshness_status: DataFreshnessStatus;
  limitations: string[];
}

export interface ReportClaim {
  text: string;
  evidence_refs: string[];
  source_refs: string[];
  freshness_status: DataFreshnessStatus;
  confidence: ConfidenceScore;
  score_driver_refs: string[];
}

interface ReportSection {
  section_type: ReportSectionType;
  title: string;
  body: string;
  neighborhood_id?: string | null;
  claims: ReportClaim[];
}

interface GuardrailEvent {
  guardrail_event_id?: string;
  report_id?: string | null;
  event_type: string;
  action_taken: 'blocked' | 'rewritten' | 'fallback_used' | 'logged';
  details: Record<string, unknown>;
  created_at?: string;
}

interface ReportInput {
  locale: MatchLocale;
  profile_summary: Record<string, unknown>;
  preference_vector: PreferenceVector;
  recommendations: Array<Record<string, unknown>>;
  comparisons: Array<Record<string, unknown>>;
  similar_neighborhoods: Array<Record<string, unknown>>;
  listing_context: Record<string, unknown>;
  evidence_items: RecommendationEvidence[];
  approved_limitations: string[];
  source_refs: string[];
  generated_at: string;
}

interface ReportGenerationMetadata {
  requested_mode: 'ai_with_fallback' | 'fallback_only';
  resolved_mode: 'ai' | 'deterministic_fallback';
  ai_provider: string;
  ai_available: boolean;
  scoring_mutable_by_ai: boolean;
  data_contract: 'structured_report_input';
}

export interface MatchReportResponse {
  report_id: string;
  status: MatchReportStatus;
  generated_by: ReportGeneratedBy;
  validation_status: ReportValidationStatus;
  locale: MatchLocale;
  sections: ReportSection[];
  limitations: string[];
  source_refs: string[];
  guardrail_events: GuardrailEvent[];
  report_input: ReportInput;
  generation_metadata: ReportGenerationMetadata;
  generated_at: string;
}

type ListingProviderMode =
  | 'licensed'
  | 'mock'
  | 'user_provided'
  | 'outbound_placeholder'
  | 'unavailable';

interface ProviderStatus {
  name: string;
  mode: ListingProviderMode;
  license_status: 'open' | 'licensed' | 'mock' | 'unknown' | 'unavailable';
  health: 'healthy' | 'degraded' | 'failed' | 'unconfigured' | 'mock_only';
  limitations: string[];
  last_success_at?: string | null;
}

export interface MatchListingCriteria {
  neighborhood_id: string;
  journey_intent: JourneyIntent;
  budget_max_cents?: number | null;
  rent_max_cents?: number | null;
  property_type?: string | null;
}

export interface MatchListing {
  listing_id: string;
  provider_listing_id?: string | null;
  provider_name: string;
  provider_mode: ListingProviderMode;
  license_status: 'open' | 'licensed' | 'mock' | 'unknown' | 'unavailable';
  neighborhood_id: string;
  journey_intent: 'buy' | 'rent';
  property_type?: string | null;
  price_cents?: number | null;
  rent_cents?: number | null;
  currency: 'EUR';
  bedrooms?: number | null;
  floor_area_m2?: number | null;
  availability_status: 'available' | 'reserved' | 'sold_rented' | 'expired' | 'unknown';
  days_on_market?: number | null;
  source_url?: string | null;
  freshness_status: DataFreshnessStatus;
  confidence: number;
  limitations: string[];
  retrieved_at: string;
}

export interface MatchListingProviderResult {
  provider: ProviderStatus;
  listings: MatchListing[];
  availability_density?: number | null;
  unavailable_reason?: string | null;
}

export type AlertStatus = 'active' | 'paused' | 'deleted';
type AlertSourceContext = 'report' | 'listing' | 'saved' | 'map' | 'manual' | 'recommendation';

export interface MatchAlertRule {
  alert_id: string;
  session_id?: string | null;
  preference_vector_id?: string | null;
  neighborhood_ids: string[];
  journey_intent: JourneyIntent;
  budget_max_cents?: number | null;
  rent_max_cents?: number | null;
  property_types: string[];
  notification_destination_hash?: string | null;
  notification_type: 'mock' | 'email' | 'push' | 'none';
  status: AlertStatus;
  source_context: AlertSourceContext;
  last_evaluated_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationDispatchRecord {
  dispatch_id: string;
  alert_id: string;
  provider_name: string;
  provider_mode: 'mock' | 'email' | 'push';
  result_status: 'recorded' | 'sent' | 'failed' | 'skipped';
  listing_ids: string[];
  error_code?: string | null;
  created_at: string;
}

export interface MatchAlertCreatePayload {
  session_id?: string | null;
  preference_vector_id?: string | null;
  source_context?: AlertSourceContext;
  neighborhood_ids: string[];
  journey_intent: JourneyIntent;
  budget_max_cents?: number | null;
  rent_max_cents?: number | null;
  property_types: string[];
  notification_destination?: string | null;
  notification_destination_hash?: string | null;
  notification_type: 'mock' | 'email' | 'push' | 'none';
}

export interface MatchAlertCreateResponse {
  alert: MatchAlertRule;
  created: boolean;
  dispatch: NotificationDispatchRecord;
  matched_listing_ids: string[];
  analytics_event: 'match_alert_created';
}

export interface MatchAlertListResponse {
  alerts: MatchAlertRule[];
}

export interface SavedNeighborhoodCreatePayload {
  session_id?: string | null;
  preference_vector_id?: string | null;
  report_id?: string | null;
  neighborhood_id: string;
  saved_from: 'recommendation' | 'map' | 'comparison' | 'listing' | 'manual';
  note?: Record<string, unknown>;
}

export interface SavedNeighborhood {
  saved_neighborhood_id: string;
  session_id?: string | null;
  preference_vector_id?: string | null;
  report_id?: string | null;
  neighborhood_id: string;
  saved_from: 'recommendation' | 'map' | 'comparison' | 'listing' | 'manual';
  note: Record<string, unknown>;
  created_at: string;
  deleted_at?: string | null;
  analytics_event: 'match_neighborhood_saved';
}

export interface SavedNeighborhoodListResponse {
  saved_neighborhoods: SavedNeighborhood[];
}

export interface ReportSaveResponse {
  report_id: string;
  saved: boolean;
  status: 'saved' | 'not_found';
}

export interface ReportSharePayload {
  scope: 'report_view' | 'report_export';
  locale: MatchLocale;
  expires_in_days?: number | null;
  consent_to_share: boolean;
}

export interface ReportShareResponse {
  share_url: string;
  expires_at?: string | null;
}

export interface ReportExportPayload {
  export_type: 'pdf' | 'html' | 'json';
  locale: MatchLocale;
}

export interface ReportExportResponse {
  export_id: string;
  report_id: string;
  export_type: 'html' | 'json';
  locale: MatchLocale;
  status: 'created' | 'failed';
  payload: Record<string, unknown>;
  error_code?: string | null;
  created_at: string;
}

export interface ReportPdfExportResponse {
  export_id?: string | null;
  blob: Blob;
}

export type MatchProductEventName =
  | 'match_quiz_started'
  | 'match_quiz_completed'
  | 'match_report_viewed'
  | 'match_time_to_first_saved_neighborhood'
  | 'match_neighborhood_saved'
  | 'match_listing_clicked'
  | 'match_alert_created'
  | 'match_report_helpfulness_submitted'
  | 'match_follow_up_question_submitted'
  | 'match_feedback_submitted'
  | 'match_source_clicked';

export type MatchFeedbackType = 'love' | 'maybe' | 'not_for_me' | 'undo';

export interface MatchFeedbackPayload {
  session_id?: string | null;
  report_id?: string | null;
  recommendation_id?: string | null;
  neighborhood_id: string;
  feedback_type: MatchFeedbackType;
  reason_code?: string | null;
  payload?: Record<string, unknown>;
}

interface FeedbackEvent {
  feedback_event_id: string;
  session_id?: string | null;
  report_id?: string | null;
  recommendation_id?: string | null;
  neighborhood_id: string;
  feedback_type: MatchFeedbackType;
  reason_code?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface FeedbackRerankingHint {
  boost_neighborhood_ids: string[];
  soften_neighborhood_ids: string[];
  suppress_neighborhood_ids: string[];
  adjusted_weight_inputs: Record<string, number>;
  explanation_code: string;
  historical_recommendations_mutated: boolean;
}

export interface MatchFeedbackResponse {
  feedback_event_id: string;
  feedback_event: FeedbackEvent;
  reranking_available: boolean;
  reranking_hint: FeedbackRerankingHint;
  explanation_code: string;
  analytics_event: 'match_feedback_submitted';
}

interface SourceHealthSnapshot {
  source_health_id: string;
  provider_name: string;
  region_config_id: string;
  health_status: 'healthy' | 'degraded' | 'failed' | 'mock_only' | 'unconfigured';
  last_success_at?: string | null;
  stale_metric_count: number;
  missing_metric_count: number;
  mock_metric_count: number;
  failed_run_count: number;
  details: Record<string, unknown>;
  created_at: string;
}

interface SuccessMetricSummary {
  event_name: MatchProductEventName;
  count: number;
  latest_value?: number | null;
}

export interface MatchAdminHealthResponse {
  overall_status: 'healthy' | 'degraded' | 'failed' | 'mock_only' | 'unconfigured';
  regions: Array<{ region_config_id: string; status: string }>;
  source_health: SourceHealthSnapshot[];
  data_freshness: Array<{ label: string; status: string; count: number }>;
  missing_data: Array<{ metric_key: string; count: number; severity: string }>;
  stale_data: Array<{ metric_key: string; count: number; severity: string }>;
  source_failures: Array<{ provider_name: string; status: string; error_code: string }>;
  scoring_anomalies: Array<{ anomaly_type: string; severity: string; count: number }>;
  listing_provider_status: ProviderStatus[];
  alert_dispatcher_status: {
    provider_name: string;
    health: string;
    failures: Array<{ alert_id: string; error_code?: string | null }>;
  };
  report_generation_failures: Array<Record<string, unknown>>;
  mock_data_indicators: Array<{ label: string; status: string; count: number }>;
  live_data_indicators: Array<{ label: string; status: string; count: number }>;
  success_metrics: SuccessMetricSummary[];
  prd_traceability: Array<{ fr_id: string; label: string; status: 'implemented' | 'partial' | 'deferred' }>;
}
