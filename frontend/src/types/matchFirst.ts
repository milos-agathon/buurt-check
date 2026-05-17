export type MatchFirstLocale = 'en' | 'nl';

export type MatchFirstSurveyQuestionId =
  | 'intent'
  | 'budget'
  | 'household_type'
  | 'anchor_location'
  | 'commute'
  | 'lifestyle_priorities'
  | 'must_haves'
  | 'dealbreakers'
  | 'housing_types'
  | 'area_character'
  | 'language';

export type MatchFirstSurveyInputType = 'single' | 'multi' | 'budgetRange' | 'commuteSlider' | 'anchor';

export type MatchFirstIntent = 'buy' | 'rent' | 'both';
export type MatchFirstHouseholdType =
  | 'single'
  | 'couple'
  | 'family_young_child'
  | 'family_older_child'
  | 'starter'
  | 'downsizing';
export type MatchFirstLifestylePriority =
  | 'green_access'
  | 'calmness'
  | 'public_transport'
  | 'schools_childcare'
  | 'amenities'
  | 'affordability'
  | 'environmental_quality';
export type MatchFirstMustHave =
  | 'parks_nearby'
  | 'good_transit'
  | 'schools_nearby'
  | 'daily_shops'
  | 'low_traffic'
  | 'bike_friendly'
  | 'garden_or_balcony';
export type MatchFirstDealbreaker =
  | 'high_noise'
  | 'busy_nightlife'
  | 'car_dependency'
  | 'poor_air_quality'
  | 'flood_risk'
  | 'low_listing_supply';
export type MatchFirstHousingType =
  | 'apartment'
  | 'row_house'
  | 'family_house'
  | 'new_build'
  | 'older_character'
  | 'garden';
export type MatchFirstAreaCharacter =
  | 'lively_urban'
  | 'quiet_city'
  | 'suburban'
  | 'village'
  | 'rural_edge';

export interface MatchFirstBudgetAnswer {
  buy_min?: number;
  buy_max?: number;
  rent_max?: number;
}

export interface MatchFirstAnchorAnswer {
  type: 'city' | 'station' | 'work' | 'school' | 'address';
  label: string;
}

export interface MatchFirstCommuteAnswer {
  max_minutes: number;
}

export interface MatchFirstSurveyAnswers {
  intent?: MatchFirstIntent;
  budget?: MatchFirstBudgetAnswer;
  household_type?: MatchFirstHouseholdType;
  anchor_location?: MatchFirstAnchorAnswer;
  commute?: MatchFirstCommuteAnswer;
  lifestyle_priorities?: MatchFirstLifestylePriority[];
  must_haves?: MatchFirstMustHave[];
  dealbreakers?: MatchFirstDealbreaker[];
  housing_types?: MatchFirstHousingType[];
  area_character?: MatchFirstAreaCharacter;
  language?: MatchFirstLocale;
}

export type MatchFirstSurveyAnswer =
  | MatchFirstIntent
  | MatchFirstBudgetAnswer
  | MatchFirstHouseholdType
  | MatchFirstAnchorAnswer
  | MatchFirstCommuteAnswer
  | MatchFirstLifestylePriority[]
  | MatchFirstMustHave[]
  | MatchFirstDealbreaker[]
  | MatchFirstHousingType[]
  | MatchFirstAreaCharacter
  | MatchFirstLocale;

export interface MatchFirstSurveyOption {
  value: string;
  labelKey: string;
}

export interface MatchFirstSurveyQuestion {
  id: MatchFirstSurveyQuestionId;
  type: MatchFirstSurveyInputType;
  titleKey: string;
  helperKey?: string;
  required: boolean;
  options?: MatchFirstSurveyOption[];
  maxSelections?: number;
}

export interface MatchSessionSnapshot {
  sessionId: string;
  locale: MatchFirstLocale;
  step: number;
  answerVersion: number;
  staleResults: boolean;
  answers: MatchFirstSurveyAnswers;
}

export interface SurveyAnswerValidation {
  valid: boolean;
  required: boolean;
  error_code: string | null;
}

export interface MatchFirstPreferenceVector {
  preference_vector_id: string;
  session_id: string;
  journey_intent: MatchFirstIntent;
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
  locale: MatchFirstLocale;
  method_version: string;
  source_answer_version: number;
  vector_version: string;
  raw_answer_refs: Record<string, unknown>;
  warnings: string[];
}

export interface MatchSessionCreateResponse {
  session_id: string;
  locale: MatchFirstLocale;
  phase: string;
  current_step: number | null;
  answer_version: number;
  expires_at: string;
}

export interface MatchSessionResponse {
  session_id: string;
  locale: MatchFirstLocale;
  phase: string;
  current_step: number | null;
  answer_version: number;
  answers: MatchFirstSurveyAnswers;
  validation: Record<string, SurveyAnswerValidation>;
  is_complete: boolean;
  preference_vector_id?: string | null;
  preference_vector_version?: string | null;
  preference_vector?: MatchFirstPreferenceVector | null;
}

export interface SurveyAnswerPatchResponse {
  session_id: string;
  answer_version: number;
  is_complete: boolean;
  validation: Record<string, SurveyAnswerValidation>;
  stale_results: boolean;
}

export type MatchJobPublicStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'matching_slow'
  | 'completed'
  | 'failed'
  | 'completed_with_fallback'
  | 'completed_no_strong_matches'
  | 'expired'
  | 'cancelled';

export type MatchJobTerminalSuccessStatus =
  | 'completed'
  | 'completed_with_fallback'
  | 'completed_no_strong_matches';

export type MatchJobStage =
  | 'created'
  | 'queued'
  | 'reading_preferences'
  | 'building_profile'
  | 'loading_neighborhood_data'
  | 'applying_filters'
  | 'running_models'
  | 'scoring_tradeoffs'
  | 'preparing_map'
  | 'completed'
  | 'completed_with_fallback'
  | 'completed_no_strong_matches'
  | 'failed'
  | 'expired';

export interface MatchRunResponse {
  session_id: string;
  job_id: string;
  status: MatchJobPublicStatus;
  stage: MatchJobStage;
  progress: number;
  message_key: string;
  preference_vector_id: string;
  poll_after_ms: number;
}

export interface MatchJobStatusResponse {
  session_id: string;
  job_id: string;
  status: MatchJobPublicStatus;
  stage: MatchJobStage;
  progress: number;
  message_key: string;
  model_mode: 'weighted_scoring' | 'predictive_candidate';
  model_version: string;
  scoring_version: string;
  evaluation_status:
    | 'not_validated_no_labels'
    | 'labels_available_not_trained'
    | 'not_validated_missing_evaluation'
    | 'validated_labels_available';
  fallback_used: boolean;
  fallback_reason_code: string | null;
  result_set_id: string | null;
  error_code: string | null;
  runtime_ms: number;
  updated_at: string;
  poll_after_ms?: number;
}

export type MatchRecommendationCategory =
  | 'top'
  | 'surprising'
  | 'stretch'
  | 'avoid_or_reconsider';

export type MatchRecommendationEligibility =
  | 'eligible'
  | 'stretch'
  | 'failed_hard_filter'
  | 'insufficient_data';

export type MatchConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface MatchRecommendationConfidence {
  score: number;
  level: MatchConfidenceLevel;
  reasons: string[];
}

export interface MatchGeometryReference {
  centroid_rd?: { x: number; y: number } | null;
  bounds_rd?: [number, number, number, number] | number[] | null;
  display_centroid_wgs84?: { lat: number; lng: number } | null;
  display_bounds_wgs84?: [number, number, number, number] | number[] | null;
  boundary_ref?: string | null;
  boundary_source?: string | null;
  boundary_freshness?: string | null;
  building_layer_ref?: string | null;
  building_layer_available?: boolean | null;
  amenity_layer_refs?: string[] | null;
  limitations?: string[];
}

export interface MatchResultSourceMetadata {
  source_id: string;
  source_type: 'official' | 'commercial' | 'derived' | 'mock' | 'user_provided' | 'missing';
  source_name_key: string;
  metric_key?: string | null;
  measurement_date?: string | null;
  retrieved_at?: string | null;
  freshness_status: string;
  confidence: number;
  limitations: string[];
}

export interface MatchNeighborhoodRecommendation {
  rank: number;
  recommendation_id: string;
  neighborhood_id: string;
  name: string;
  municipality: string;
  fit_score: number;
  fit_label_key: string;
  category: MatchRecommendationCategory;
  eligibility_status: MatchRecommendationEligibility;
  confidence: MatchRecommendationConfidence;
  reason_codes: string[];
  tradeoffs: string[];
  component_scores: Record<string, number>;
  failed_filters: string[];
  source_refs: string[];
  source_metadata?: MatchResultSourceMetadata[];
  limitations: string[];
  freshness_status: string;
  geometry_ref: MatchGeometryReference;
  amenity_refs?: string[];
}

export interface MatchResultsMapPayload {
  type: 'FeatureCollection';
  display_bounds_wgs84?: [number, number, number, number] | number[];
  features: unknown[];
}

export interface MatchResultsMapState {
  sessionId: string;
  jobId: string;
  resultSetId: string;
  preferenceVectorVersion: string;
  selectedRecommendationId?: string;
  selectedNeighborhoodId?: string;
  selectedResultRank?: number;
  selectedHouseId?: string;
  mapCenter: [number, number];
  mapZoom: number;
  listScroll: number;
  mobileMode: 'map' | 'list';
  locale: MatchFirstLocale;
}

export interface MatchResultsResponse {
  session_id: string;
  job_id: string;
  result_set_id: string;
  preference_vector_version: string;
  status: MatchJobTerminalSuccessStatus;
  generated_at: string;
  runtime_ms: number;
  model_mode: 'weighted_scoring' | 'predictive_candidate';
  model_version: string;
  scoring_version: string;
  data_version: string;
  evaluation_status: string;
  predictive_probability_available: boolean;
  fallback_used: boolean;
  fallback_reason_code: string | null;
  normal_recommendation_count: number;
  candidate_count: number;
  scored_candidate_count: number;
  ranked_results: MatchNeighborhoodRecommendation[];
  recommendations: MatchNeighborhoodRecommendation[];
  stretch_matches: MatchNeighborhoodRecommendation[];
  near_misses: MatchNeighborhoodRecommendation[];
  empty_state_code: string | null;
  map_center: { lat: number; lng: number };
  bbox: number[];
  map: MatchResultsMapPayload;
}

export interface MatchNeighborhoodSummaryResponse {
  neighborhood_id: string;
  name: string;
  municipality: string;
  centroid_rd: { x: number; y: number };
  bounds_rd: [number, number, number, number] | number[];
  display_centroid_wgs84: { lat: number; lng: number };
  display_bounds_wgs84: [number, number, number, number] | number[];
  boundary_ref: string;
  source_refs: string[];
  freshness_status: string;
  limitations: string[];
}

export interface MatchNeighborhoodLayerEndpoint {
  available?: boolean | null;
  endpoint: string;
  fallback_reason_code?: string | null;
}

export interface MatchNeighborhoodMapLayersResponse {
  neighborhood_id: string;
  session_id: string;
  result_set_id: string;
  allowed_bounds_rd: [number, number, number, number] | number[];
  display_bounds_wgs84: [number, number, number, number] | number[];
  boundary: {
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: number[][][] };
    properties: Record<string, unknown>;
  };
  building_layer: MatchNeighborhoodLayerEndpoint;
  amenity_layer: MatchNeighborhoodLayerEndpoint;
  fallback_2d_available: boolean;
  source_refs: string[];
  limitations: string[];
}

export type MatchNeighborhoodAddressResolution =
  | 'resolved'
  | 'candidate'
  | 'manual_required'
  | 'unavailable';

export interface MatchNeighborhoodBuildingFeature {
  building_id: string;
  vbo_id?: string | null;
  address_id?: string | null;
  lookup_id?: string | null;
  footprint: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  height_m?: number | null;
  source_refs: string[];
  address_resolution: MatchNeighborhoodAddressResolution;
  address_candidate_count: number;
  fallback_label_key?: string | null;
}

export interface MatchNeighborhoodBuildingsResponse {
  neighborhood_id: string;
  session_id: string;
  result_set_id: string;
  bounds_rd: [number, number, number, number] | number[];
  clipped_to_neighborhood: boolean;
  buildings: MatchNeighborhoodBuildingFeature[];
  fallback_reason_code?: string | null;
  data_version: string;
  source_refs: string[];
  limitations: string[];
}

export interface MatchNeighborhoodAmenityTag {
  amenity_key: string;
  label_key: string;
  reason_code: string;
  source_refs: string[];
  relevance: number;
}

export interface MatchNeighborhoodAmenitiesResponse {
  neighborhood_id: string;
  session_id: string;
  result_set_id: string;
  tags: MatchNeighborhoodAmenityTag[];
  points: unknown[];
  source_refs: string[];
  limitations: string[];
}

export interface MatchDossierBridgeReturnContext {
  session_id: string;
  job_id: string;
  result_set_id: string;
  preference_vector_version: string;
  source: 'match_map';
  return_url: string;
  map_center?: [number, number] | number[] | null;
  map_zoom?: number | null;
  list_scroll?: number | null;
  mobile_mode?: 'map' | 'list' | null;
  selected_result_id?: string | null;
  selected_result_rank?: number | null;
  language?: MatchFirstLocale | null;
  selected_house_id?: string | null;
}

export interface MatchDossierBridgeRequest {
  session_id: string;
  neighborhood_id: string;
  building_id: string;
  address_id?: string | null;
  vbo_id?: string | null;
  lookup_id?: string | null;
  selected_candidate_id?: string | null;
  coordinate_rd?: Record<string, number> | null;
  return_context: MatchDossierBridgeReturnContext;
}

export interface MatchDossierAddressCandidate {
  address_id?: string | null;
  vbo_id?: string | null;
  lookup_id?: string | null;
  reliability: 'resolved' | 'candidate' | 'unavailable';
}

export interface MatchDossierCandidateAddress {
  candidate_id: string;
  address_id?: string | null;
  vbo_id?: string | null;
  lookup_id?: string | null;
  display_label_key: string;
  display_params: Record<string, string>;
  reliability: 'resolved' | 'candidate' | 'unavailable';
  source_refs: string[];
  fallback_reason_code?: string | null;
}

export interface MatchDossierBridgeResponse {
  status: 'resolved' | 'candidates' | 'manual_required' | 'unavailable';
  route?: string | null;
  vbo_id?: string | null;
  lookup_id?: string | null;
  address_candidate?: MatchDossierAddressCandidate | null;
  candidate_addresses: MatchDossierCandidateAddress[];
  fallback_reason_code?: string | null;
}
