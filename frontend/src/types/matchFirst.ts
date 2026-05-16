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
  ranked_results: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
  stretch_matches: Array<Record<string, unknown>>;
  near_misses: Array<Record<string, unknown>>;
  empty_state_code: string | null;
  map_center: Record<string, unknown>;
  bbox: number[];
  map: Record<string, unknown>;
}
