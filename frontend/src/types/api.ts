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

export interface ResolvedAddress {
  id: string;
  nummeraanduiding_id?: string;
  adresseerbaar_object_id?: string;
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

export interface Neighborhood3DCenter {
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

export interface SunlightResult {
  winter: number;
  equinox: number;
  summer: number;
  annualAverage: number;
  analysisYear?: number;
}

export interface ShadowSnapshot {
  label: string;
  hour: number;
  dataUrl: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'unavailable';

export type SeverityLevel = 'good' | 'moderate' | 'poor' | 'critical' | 'unavailable';

export interface NoiseRiskCard {
  level: RiskLevel;
  lden_db?: number;
  source: string;
  source_date?: string;
  sampled_at: string;
  layer?: string;
  message?: string;
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

export interface AirQualityRiskCard {
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
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

export interface ClimateStressRiskCard {
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
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
}

export interface SunlightRiskCard {
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  summary_nl?: string;
  winter_hours?: number;
  summer_hours?: number;
  equinox_hours?: number;
}

export interface RiskCardsResponse {
  address_id: string;
  noise: NoiseRiskCard;
  air_quality: AirQualityRiskCard;
  climate_stress: ClimateStressRiskCard;
  sunlight?: SunlightRiskCard;
}

export type ComparisonLabelCode =
  | 'city_avg'
  | 'nl_avg'
  | 'who_limit'
  | 'adaptation_target'
  | 'daylight_target'
  | 'address';

export type ComparisonPattern = 'solid' | 'dashed';

export interface RiskComparisonRow {
  label_code: ComparisonLabelCode;
  value: number;
  pattern?: ComparisonPattern;
  source?: string;
  source_date?: string;
}

export interface RiskComparisonsResponse {
  address_id: string;
  noise: RiskComparisonRow[];
  air_quality: RiskComparisonRow[];
  climate_stress: RiskComparisonRow[];
  sunlight: RiskComparisonRow[];
  generated_at: string;
}

export type UrbanizationLevel =
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
}

export interface NeighborhoodStats {
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

export interface EnergyLabelCard {
  label?: string;
  source: string;
  source_date?: string;
  message?: string;
}

export interface CrimeStatsCard {
  total_per_1000?: number;
  burglary_per_1000?: number;
  violent_per_1000?: number;
  yearly_period?: string;
  monthly_total_per_1000?: number;
  monthly_period?: string;
  source: string;
  source_date?: string;
  message?: string;
}

export interface TierBResponse {
  address_id: string;
  energy_label: EnergyLabelCard;
  crime: CrimeStatsCard;
}

// Property Warnings
export interface FoundationRisk {
  level: 'high' | 'medium' | 'low' | 'unavailable';
  construction_year?: number;
  soil_type?: string;
  subsidence_rate_mm_per_year?: number;
  messages: string[];
}

export interface ErfpachtWarning {
  detected: boolean;
  confidence?: 'confirmed' | 'municipality_based';
  municipality?: string;
  messages: string[];
}

export interface VvEInfo {
  is_apartment: boolean;
  num_units?: number;
  messages: string[];
}

export interface AsbestosWarning {
  flagged: boolean;
  construction_year?: number;
  messages: string[];
}

export interface AttentionFlag {
  category: string;
  severity: string;
  label: string;
}

export interface AttentionSummary {
  flag_count: number;
  flags: AttentionFlag[];
  risk_categories_assessed: number;
  risk_categories_total: number;
}

export interface LeadPipeWarning {
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
  asbestos: AsbestosWarning;
  lead_pipe: LeadPipeWarning;
}

// Livability (Leefbaarometer)
export type LivabilityDimensionName =
  | 'physical'
  | 'safety'
  | 'social'
  | 'amenities'
  | 'housing';

export interface LivabilityDimension {
  name: LivabilityDimensionName;
  raw_score: number;
  normalized_score: number;
  label_code: string;
}

export interface LivabilityTrendPoint {
  year: string;
  overall_score: number;
  overall_normalized: number;
  dimensions: LivabilityDimension[];
}

export interface LivabilityComparisonRow {
  level: 'buurt' | 'wijk' | 'gemeente';
  name: string;
  overall_score: number;
  overall_normalized: number;
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
  dimensions: LivabilityDimension[];
  trend: LivabilityTrendPoint[];
  comparison: LivabilityComparisonRow[];
  source: string;
  source_date?: string;
  messages: string[];
}

export interface LivabilityUnavailableResponse {
  available: false;
  message: string;
}

export type LivabilityResponse = LivabilityAvailableResponse | LivabilityUnavailableResponse;

export interface ShortlistItem {
  vboId: string;
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
  savedAt: number; // timestamp
}
