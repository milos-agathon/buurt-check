export type MatchLocale = 'en' | 'nl';
export type JourneyIntent = 'buy' | 'rent' | 'both';
export type HouseholdType = 'starter' | 'single' | 'couple' | 'family' | 'future_family' | 'other';
export type PersonaOverlayType =
  | 'family'
  | 'newcomer'
  | 'city_escape'
  | 'single_couple'
  | 'buyer'
  | 'renter'
  | 'starter';

export interface MatchQuizBudget {
  buy_min?: number;
  buy_max?: number;
  rent_max?: number;
}

export interface MatchLocationAnchor {
  label: string;
  query: string;
  lat?: number;
  lng?: number;
}

export interface MatchCommuteLimit {
  mode: 'bike' | 'walk' | 'car' | 'public_transport' | 'mixed' | 'radius';
  max_minutes?: number;
  radius_km?: number;
}

export interface MatchQuizPayload {
  session_id?: string;
  locale: MatchLocale;
  journey_intent: JourneyIntent;
  budget: MatchQuizBudget;
  household_type: HouseholdType;
  current_city?: string;
  preferred_anchor_location?: string;
  anchor_locations: MatchLocationAnchor[];
  commute_limits: MatchCommuteLimit[];
  property_types: string[];
  must_haves: string[];
  nice_to_haves: string[];
  avoid_signals: string[];
  language_preference: MatchLocale;
  lifestyle_priorities: Record<string, number>;
  newcomer_status?: 'yes' | 'no' | 'prefer_not_to_say' | 'unknown';
}

export interface UserPreferenceProfile {
  profile_id: string;
  session_id?: string | null;
  locale: MatchLocale;
  household_type: HouseholdType;
  newcomer_status: 'yes' | 'no' | 'prefer_not_to_say' | 'unknown';
}

export interface PreferenceVector {
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

export interface PersonaOverlay {
  type: PersonaOverlayType;
  confidence: number;
  reasons: string[];
}

export interface MatchValidationWarning {
  code: string;
  severity: 'info' | 'warning';
  field?: string | null;
}

export interface MatchQuizResponse {
  profile: UserPreferenceProfile;
  preference_vector: PreferenceVector;
  persona_overlays: PersonaOverlay[];
  validation_warnings: MatchValidationWarning[];
  analytics_event: 'match_quiz_completed';
}

export type DataFreshnessStatus = 'current' | 'aging' | 'stale' | 'unavailable' | 'mock' | 'conflict';
export type ConfidenceLabel = 'high' | 'medium' | 'low';
export type MatchReportStatus = 'generated' | 'fallback' | 'invalid';
export type ReportGeneratedBy = 'ai' | 'deterministic_fallback';
export type ReportValidationStatus = 'passed' | 'fallback_used' | 'blocked';
export type ReportSectionType =
  | 'profile_summary'
  | 'top_neighborhood_matches'
  | 'why_these_neighborhoods_fit'
  | 'tradeoffs_and_watchouts'
  | 'similar_neighborhoods'
  | 'live_homes_available_now'
  | 'suggested_alerts'
  | 'next_steps';

export interface ConfidenceScore {
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

export interface RecommendationExplanation {
  code: string;
  evidence_refs: string[];
}

export interface ScoreDriver {
  feature: string;
  impact: number;
  score: number;
  source_refs: string[];
}

export interface SimilarNeighborhoodResult {
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

export interface ComparisonCell {
  value?: number | null;
  display_value: string;
  state: 'available' | 'missing' | 'stale' | 'mock';
  confidence: number;
  freshness_status: DataFreshnessStatus;
  source_refs: string[];
  sources: MetricSource[];
  limitations: string[];
}

export interface ComparisonIndicatorRow {
  indicator_key: string;
  label_code: string;
  cells: Record<string, ComparisonCell>;
}

export interface ComparisonNeighborhoodSummary {
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

export interface MatchMapFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    neighborhood_id: string;
    name: string;
    municipality: string;
    match_score: number;
    category: 'top' | 'surprising' | 'stretch' | 'avoid_or_reconsider';
    confidence: ConfidenceScore;
    freshness_status: DataFreshnessStatus;
    source_refs: string[];
    missing_data: string[];
  };
}

export interface MapMissingCoordinate {
  neighborhood_id: string;
  name: string;
  reason_code: 'match.map.missingCoordinates';
}

export interface MatchMapResponse {
  type: 'FeatureCollection';
  bounds: number[];
  features: MatchMapFeature[];
  unsupported_regions: string[];
  missing_coordinates: MapMissingCoordinate[];
  empty_state_code?: string | null;
}

export interface RecommendationEvidence {
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

export interface ReportSection {
  section_type: ReportSectionType;
  title: string;
  body: string;
  neighborhood_id?: string | null;
  claims: ReportClaim[];
}

export interface GuardrailEvent {
  guardrail_event_id?: string;
  report_id?: string | null;
  event_type: string;
  action_taken: 'blocked' | 'rewritten' | 'fallback_used' | 'logged';
  details: Record<string, unknown>;
  created_at?: string;
}

export interface ReportInput {
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

export interface MatchReportCreatePayload {
  session_id?: string | null;
  preference_vector_id?: string | null;
  recommendation_ids?: string[];
  locale: MatchLocale;
  generation_mode: 'ai_with_fallback' | 'fallback_only';
  report_input: ReportInput;
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
  generated_at: string;
}
