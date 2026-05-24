import type { Geometry } from 'geojson';

export interface AddressSuggestion {
  id: string;
  display_name: string;
  type: string;
  score: number;
}

export interface SuggestResponse {
  suggestions: AddressSuggestion[];
}

export interface ShortReportResponse {
  report_id: string;
  report_type: 'short' | 'long';
  already_purchased: boolean;
}

export interface EntitlementResponse {
  report_id: string;
  entitled: boolean;
  report_type: 'short' | 'long';
}

export interface CheckoutSessionResponse {
  checkout_url: string;
}

export interface CheckoutConfirmationResponse {
  report_id: string;
  entitled: boolean;
  report_type: 'short' | 'long';
  vbo_id?: string | null;
  address_key?: string | null;
  lookup_id?: string | null;
}

export interface GooglePlayPurchaseVerificationResponse {
  report_id: string;
  entitled: boolean;
  provider: 'google_play';
  consumed: boolean;
}

export interface AppleAppStorePurchaseVerificationResponse {
  report_id: string;
  entitled: boolean;
  provider: 'apple_app_store';
  transaction_id: string;
}

export interface PricingResponse {
  price_cents: number;
  price_eur: string;
  currency: string;
  server_render_available?: boolean;
  web_checkout_provider?: 'stripe';
  web_checkout_available?: boolean;
}

export interface ResolvedAddress {
  id: string;
  nummeraanduiding_id?: string;
  adresseerbaar_object_id?: string;
  pand_id?: string;
  display_name: string;
  street?: string;
  house_number?: string;
  house_letter?: string;
  addition?: string;
  postcode?: string;
  city?: string;
  municipality?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
  rd_x?: number;
  rd_y?: number;
  buurt_code?: string;
  wijk_code?: string;
}

export interface BuildingFacts {
  pand_id: string;
  construction_year?: number;
  status?: string;
  status_en?: string;
  intended_use: string[];
  intended_use_en: string[];
  num_units?: number;
  floor_area_m2?: number;
  footprint_geojson?: Geometry;
  document_date?: string;
}

export interface BuildingFactsResponse {
  address_id: string;
  building?: BuildingFacts;
  message?: string;
}

export interface BuildingBlock {
  pand_id: string;
  ground_height: number;
  building_height: number;
  footprint: number[][];
  year?: number;
  roof_surfaces?: number[][][]; // [surface][vertex][dx, dy, z_nap]
  orientation_deg?: number; // Longest edge azimuth, 0=N, clockwise, 0-180 range
}

interface Neighborhood3DCenter {
  lat: number;
  lng: number;
  rd_x: number;
  rd_y: number;
}

export interface Neighborhood3DResponse {
  address_id: string;
  target_pand_id?: string;
  center: Neighborhood3DCenter;
  buildings: BuildingBlock[];
  message?: string;
}

export interface FacadeSunlightResult {
  orientation: 'north' | 'south' | 'east' | 'west';
  heightLabel: string;
  winterHours: number;
  summerHours: number;
  annualAverage: number;
}

export interface SunlightTimestepMeta {
  date: string;
  minuteOfDay: number;
}

export interface SunlightResult {
  winter: number;
  equinox: number;
  summer: number;
  annualAverage: number;
  methodVersion?: string;
  targetPlane?: 'roof' | 'facade' | 'ground' | 'interior_proxy';
  analysisYear?: number;
  svf?: number;
  svfAnisotropic?: number;
  perPointAnnual?: number[];
  roofGridPoints?: [number, number, number][];
  facadeProxyPoints?: [number, number, number][];
  groundProxyPoints?: [number, number, number][];
  perFacadeAnnual?: number[];
  perGroundAnnual?: number[];
  facadeResults?: FacadeSunlightResult[];
  groundAnnualAverage?: number;
  samplingBreakdown?: {
    roof: number;
    facade: number;
    ground: number;
    total: number;
  };
  perTimestepVisibility?: (0 | 1)[][];
  timestepMeta?: SunlightTimestepMeta[];
  irradianceKwhM2?: number;
  irradianceDirectKwhM2?: number;
  irradianceDiffuseKwhM2?: number;
  analysisMethod?: 'cpu-raycast-main' | 'cpu-raycast-worker';
}

export interface ShadowSnapshot {
  label: string;
  hour: number;
  dataUrl: string;
  viewpoint?: 'top' | 'front' | 'rear';
  sunAzimuth?: number;
  sunAltitude?: number;
}

export interface ShadowPrewarmResponse {
  status: 'ready' | 'skipped' | 'unavailable';
  facade_snapshot_count: number;
  hero_snapshot_count: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'unavailable';

export type SeverityLevel = 'good' | 'moderate' | 'poor' | 'critical' | 'unavailable';

interface NoiseRiskCard {
  level: RiskLevel;
  lden_db?: number;
  source: string;
  source_date?: string;
  sampled_at: string;
  layer?: string;
  message?: string;
  warnings?: string[];
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

interface AirQualityRiskCard {
  level: RiskLevel;
  pm25_ug_m3?: number;
  no2_ug_m3?: number;
  pm25_level: RiskLevel;
  no2_level: RiskLevel;
  source: string;
  source_date?: string;
  sampled_at: string;
  pm25_layer?: string;
  no2_layer?: string;
  message?: string;
  warnings?: string[];
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

interface ClimateStressRiskCard {
  level: RiskLevel;
  heat_value?: number;
  heat_level: RiskLevel;
  water_value?: number;
  water_level: RiskLevel;
  source: string;
  source_date?: string;
  sampled_at: string;
  heat_layer?: string;
  water_layer?: string;
  heat_signal?: string;
  water_signal?: string;
  message?: string;
  warnings?: string[];
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

interface FacadeResultApi {
  orientation: string;
  height_label: string;
  winter_hours: number;
  summer_hours: number;
  annual_average: number;
}

interface SunlightRiskCard {
  level?: SeverityLevel;
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
  winter_hours?: number;
  summer_hours?: number;
  equinox_hours?: number;
  svf_percent?: number;
  svf_score?: number;
  source?: string;
  source_date?: string;
  // Extended fields (Phase 6 sunlight data)
  facade_results?: FacadeResultApi[];
  annual_average?: number;
  ground_annual_average?: number;
  svf_anisotropic?: number;
  irradiance_kwh_m2?: number;
  method_version?: string;
  target_plane?: 'roof' | 'facade' | 'ground' | 'interior_proxy';
}

export interface RiskCardsResponse {
  address_id: string;
  noise: NoiseRiskCard;
  air_quality: AirQualityRiskCard;
  climate_stress: ClimateStressRiskCard;
  sunlight?: SunlightRiskCard;
}

type ComparisonLabelCode =
  | 'city_avg'
  | 'nl_avg'
  | 'who_limit'
  | 'air_interim_target'
  | 'adaptation_target'
  | 'daylight_target'
  | 'address';

type ComparisonPattern = 'solid' | 'dashed';
type ComparisonRole = 'address' | 'peer' | 'national' | 'reference';
type ComparisonScope = 'address' | 'urbanization_peer' | 'national' | 'reference';

interface RiskComparisonRow {
  label_code: ComparisonLabelCode;
  value: number;
  pattern?: ComparisonPattern;
  source?: string;
  source_date?: string;
  role?: ComparisonRole;
  benchmark_family?: string;
  label_key?: string;
  scope?: ComparisonScope;
}

export interface RiskComparisonsResponse {
  address_id: string;
  noise: RiskComparisonRow[];
  air_quality: RiskComparisonRow[];
  climate_stress: RiskComparisonRow[];
  sunlight: RiskComparisonRow[];
  generated_at: string;
}

type UrbanizationLevel =
  | 'very_urban'
  | 'urban'
  | 'moderate'
  | 'rural'
  | 'very_rural'
  | 'unknown';

export interface AgeProfile {
  age_0_24?: number;
  age_25_64?: number;
  age_65_plus?: number;
}

export interface NeighborhoodIndicator {
  value?: number | string | null;
  unit?: string;
  available: boolean;
  quartile?: number | null; // 1-4, national quartile position
  quartile_direction?: 'higher_value' | 'lower_value' | null;
  favorable_quartile?: number | null;
  precision?: number | null;
  source_year?: number | null;
  source_note?: string | null;
}

interface NeighborhoodStats {
  buurt_code: string;
  buurt_name?: string;
  gemeente_name?: string;
  population_density: NeighborhoodIndicator;
  avg_household_size: NeighborhoodIndicator;
  single_person_pct: NeighborhoodIndicator;
  age_profile: AgeProfile;
  owner_occupied_pct: NeighborhoodIndicator;
  avg_property_value: NeighborhoodIndicator;
  distance_to_train_km: NeighborhoodIndicator;
  distance_to_supermarket_km: NeighborhoodIndicator;
  urbanization: UrbanizationLevel;
}

export interface NeighborhoodStatsResponse {
  address_id: string;
  stats?: NeighborhoodStats;
  source: string;
  source_year: number;
  source_years?: number[];
  mixed_source_years?: boolean;
  source_notes?: string[];
  message?: string;
}

export interface ViewingQuestion {
  text_en: string;
  text_nl: string;
}

export interface QuestionCategory {
  name: string;
  name_nl: string;
  severity: SeverityLevel;
  questions: ViewingQuestion[];
}

export interface ViewingQuestionsResponse {
  address_id: string;
  categories: QuestionCategory[];
}

type NonEmptyArray<T> = [T, ...T[]];

export type PrebidCoverageStatus =
  | 'checked'
  | 'failed'
  | 'unavailable'
  | 'not_supported'
  | 'manual_review'
  | 'skipped'
  | 'review';

type PrebidResultState =
  | 'ready'
  | 'signals_found'
  | 'no_major_signal_found'
  | 'data_incomplete'
  | 'needs_human_review'
  | 'outside_coverage'
  | 'queued_for_review'
  | 'review_required'
  | 'source_incomplete';

type PrebidPackStatus =
  | 'ready'
  | 'queued_for_review'
  | 'pack_under_review'
  | 'review_required'
  | 'data_incomplete'
  | 'not_entitled'
  | 'deleted'
  | 'expired'
  | 'error';

type PrebidConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'needs_review'
  | 'data_incomplete';

interface PrebidSourceReference {
  id?: string;
  name: string;
  source_date?: string;
  checked_at?: string;
  url?: string;
  reference?: string;
  method?: string;
  version?: string;
  coverage_status: PrebidCoverageStatus;
  limitation: string;
  limitation_nl?: string;
}

export interface PrebidCoverageRow {
  id: string;
  authority: string;
  label: string;
  status: PrebidCoverageStatus;
  basis?: string;
  radius_m?: number;
  method?: string;
  version?: string;
  duration_ms?: number;
  checked_at?: string;
  source_date?: string;
  error_code?: string;
  limitation: string;
  limitation_nl?: string;
}

interface PrebidQuestionText {
  en: string;
  nl?: string;
}

export interface PrebidVerificationAction {
  id: string;
  category: string;
  priority: number;
  severity: SeverityLevel;
  finding: string;
  finding_nl?: string;
  why_it_matters: string;
  why_it_matters_nl?: string;
  ask_this: PrebidQuestionText;
  request_this: string;
  request_this_nl?: string;
  who_to_ask: NonEmptyArray<string>;
  confidence: PrebidConfidence;
  limitation: string;
  limitation_nl?: string;
  source_refs: NonEmptyArray<PrebidSourceReference>;
  states?: {
    needs_human_review?: boolean;
    queued_for_review?: boolean;
    data_incomplete?: boolean;
    source_incomplete?: boolean;
  };
}

export interface PrebidBriefingResponse {
  briefing_id: string;
  address_id: string;
  report_id?: string;
  address_label: string;
  checked_at: string;
  result_state: PrebidResultState;
  disclaimer: string;
  disclaimer_nl?: string;
  coverage: PrebidCoverageRow[];
  top_actions: PrebidVerificationAction[];
  source_quality: {
    unknown_source_date_count: number;
    generic_confidence_count: number;
    generic_limitation_count: number;
    missing_source_ref_count: number;
    missing_recipient_count: number;
    caps: string[];
  };
}

interface PrebidPackQuestionGroup {
  recipient: string;
  questions: PrebidQuestionText[];
  requests: string[];
}

export interface PrebidPackResponse {
  pack_id: string;
  address_id: string;
  report_id: string;
  address_label: string;
  checked_at: string;
  status: PrebidPackStatus;
  disclaimer: string;
  disclaimer_nl?: string;
  actions: PrebidVerificationAction[];
  question_groups: PrebidPackQuestionGroup[];
  coverage: PrebidCoverageRow[];
  share_url?: string;
  download_url?: string;
  error_code?: string;
}

export interface PrebidShareResponse {
  share_token: string;
  share_url: string;
  expires_at?: string;
  mode?: 'briefing' | 'pack';
  scope?: 'briefing' | 'pack';
  email_sent?: boolean;
  error_code?: 'email_provider_unavailable';
}

type SharedPrebidState =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'deleted'
  | 'forbidden'
  | 'not_found';

export interface SharedPrebidResponse {
  state: SharedPrebidState;
  mode: 'briefing' | 'pack';
  briefing?: PrebidBriefingResponse;
  pack?: PrebidPackResponse;
  support_email?: string;
}

// Property Warnings
interface FoundationRisk {
  level: 'high' | 'medium' | 'low' | 'unavailable';
  construction_year?: number;
  soil_type?: string;
  subsidence_rate_mm_per_year?: number;
  messages: string[];
}

interface ErfpachtWarning {
  detected: boolean;
  confidence?: 'confirmed' | 'municipality_based';
  municipality?: string;
  scope: 'municipality' | 'property';
  verified_property_level: boolean;
  messages: string[];
}

interface VvEInfo {
  is_apartment: boolean;
  num_units?: number;
  messages: string[];
}

interface SharedBuildingInfo {
  detected: boolean;
  num_addressable_units?: number;
  messages: string[];
}

interface AsbestosWarning {
  flagged: boolean;
  construction_year?: number;
  messages: string[];
}

export interface AttentionFlag {
  category: string;
  severity: 'critical' | 'poor' | 'moderate' | 'info';
  label: string;
}

interface AttentionSummary {
  flag_count: number;
  flags: AttentionFlag[];
  risk_categories_assessed: number;
  risk_categories_total: number;
}

interface LeadPipeWarning {
  flagged: boolean;
  construction_year?: number;
  messages: string[];
}

export interface PropertyWarningsResponse {
  address_id: string;
  attention_summary: AttentionSummary;
  foundation_risk: FoundationRisk;
  erfpacht: ErfpachtWarning;
  vve: VvEInfo;
  shared_building: SharedBuildingInfo;
  asbestos: AsbestosWarning;
  lead_pipe: LeadPipeWarning;
}

// Livability (Leefbaarometer)
type LivabilityDimensionName =
  | 'physical'
  | 'safety'
  | 'social'
  | 'amenities'
  | 'housing';

export interface LivabilityDimension {
  name: LivabilityDimensionName;
  raw_score: number;
  normalized_score: number;
  class_label?: string;
  deviation?: number | null;
  label_code: string;
}

export interface LivabilityTrendPoint {
  year: string;
  overall_score: number;
  overall_normalized: number;
  overall_class?: number;
  overall_class_label?: string;
  overall_deviation?: number | null;
  dimensions: LivabilityDimension[];
}

export interface LivabilityComparisonRow {
  level: 'buurt' | 'wijk' | 'gemeente' | 'national';
  name: string;
  overall_score: number;
  overall_normalized: number;
  overall_class?: number;
  overall_class_label?: string;
  overall_deviation?: number | null;
  dimensions: LivabilityDimension[];
}

export interface LivabilityAvailableResponse {
  available: true;
  buurt_code: string;
  buurt_name: string;
  gemeente: string;
  year: string;
  overall_score: number;
  overall_normalized: number;
  overall_class?: number;
  overall_class_label?: string;
  overall_deviation?: number | null;
  dimensions: LivabilityDimension[];
  trend: LivabilityTrendPoint[];
  comparison: LivabilityComparisonRow[];
  source: string;
  source_date?: string;
  messages: string[];
}

interface LivabilityUnavailableResponse {
  available: false;
  message: string;
}

export type LivabilityResponse = LivabilityAvailableResponse | LivabilityUnavailableResponse;

export interface ShortlistItem {
  vboId: string;
  lookupId?: string; // locatieserver document ID — enables reopen from shortlist
  address: string;
  postcode?: string;
  city?: string;
  buildingYear?: number;
  riskScores: {
    noise?: number;
    air?: number;
    climate?: number;
    sunlight?: number;
  };
  verificationWork?: {
    openActions: number;
    incompleteSources: number;
    needsReview: number;
    packStatus?: PrebidPackStatus;
  };
  savedAt: number; // timestamp
}
