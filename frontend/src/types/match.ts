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
