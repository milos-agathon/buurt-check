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
  footprint_geojson?: GeoJSON.Geometry;
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

export interface NoiseRiskCard {
  level: RiskLevel;
  lden_db?: number;
  source: string;
  source_date?: string;
  sampled_at: string;
  layer?: string;
  message?: string;
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
}

export interface RiskCardsResponse {
  address_id: string;
  noise: NoiseRiskCard;
  air_quality: AirQualityRiskCard;
  climate_stress: ClimateStressRiskCard;
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
