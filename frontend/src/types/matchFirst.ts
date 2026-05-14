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
