import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import type {
  AddressSuggestion,
  ResolvedAddress,
  BuildingFacts,
  BuildingFactsResponse,
  Neighborhood3DResponse,
  NeighborhoodStatsResponse,
  PropertyWarningsResponse,
  RiskComparisonsResponse,
  RiskCardsResponse,
  SunlightResult,
} from '../types/api';

export async function setupTestI18n(lng: string = 'en') {
  const instance = i18n.createInstance();
  await instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return instance;
}

export function makeSuggestion(overrides: Partial<AddressSuggestion> = {}): AddressSuggestion {
  return {
    id: 'adr-abc123',
    display_name: 'Keizersgracht 100, 1015AA Amsterdam',
    type: 'adres',
    score: 18.5,
    ...overrides,
  };
}

export function makeResolvedAddress(overrides: Partial<ResolvedAddress> = {}): ResolvedAddress {
  return {
    id: 'adr-abc123',
    display_name: 'Keizersgracht 100, 1015AA Amsterdam',
    adresseerbaar_object_id: 'vbo-123',
    street: 'Keizersgracht',
    house_number: '100',
    postcode: '1015AA',
    city: 'Amsterdam',
    municipality: 'Amsterdam',
    province: 'Noord-Holland',
    latitude: 52.3676,
    longitude: 4.8846,
    rd_x: 121000,
    rd_y: 487000,
    ...overrides,
  };
}

export function makeBuildingFacts(overrides: Partial<BuildingFacts> = {}): BuildingFacts {
  return {
    pand_id: '0363100012345678',
    construction_year: 1875,
    status: 'Pand in gebruik',
    status_en: 'Building in use',
    intended_use: ['woonfunctie'],
    intended_use_en: ['residential'],
    num_units: 4,
    floor_area_m2: 120,
    ...overrides,
  };
}

export function makeBuildingResponse(
  overrides: Partial<BuildingFactsResponse> = {},
): BuildingFactsResponse {
  return {
    address_id: 'vbo-123',
    building: makeBuildingFacts(),
    ...overrides,
  };
}

export function makeNeighborhood3DResponse(
  overrides: Partial<Neighborhood3DResponse> = {},
): Neighborhood3DResponse {
  return {
    address_id: 'vbo-123',
    target_pand_id: '0363100012345678',
    center: { lat: 52.3676, lng: 4.8846, rd_x: 121000, rd_y: 487000 },
    buildings: [
      {
        pand_id: '0363100012345678',
        ground_height: 1.75,
        building_height: 16.43,
        footprint: [[0, 0], [5, 0], [5, 5], [0, 5]],
        year: 1917,
        orientation_deg: 135.0,
      },
      {
        pand_id: '0363100099999999',
        ground_height: 1.5,
        building_height: 12.0,
        footprint: [[10, 0], [15, 0], [15, 5], [10, 5]],
        year: 1930,
      },
    ],
    ...overrides,
  };
}

export function makeSunlightResult(overrides: Partial<SunlightResult> = {}): SunlightResult {
  return {
    winter: 3.0,
    equinox: 7.0,
    summer: 11.0,
    annualAverage: 7.0,
    analysisYear: 2026,
    ...overrides,
  };
}

export function makeRiskCardsResponse(
  overrides: Partial<RiskCardsResponse> = {},
): RiskCardsResponse {
  return {
    address_id: 'vbo-123',
    noise: {
      level: 'medium',
      lden_db: 60.5,
      source: 'RIVM / Atlas Leefomgeving WMS',
      source_date: '2019-11-12',
      sampled_at: '2026-02-05',
    },
    air_quality: {
      level: 'medium',
      pm25_ug_m3: 8.6,
      no2_ug_m3: 18.2,
      pm25_level: 'medium',
      no2_level: 'medium',
      source: 'RIVM GCN WMS',
      source_date: '2024',
      sampled_at: '2026-02-05',
    },
    climate_stress: {
      level: 'low',
      heat_value: 0.64,
      heat_level: 'low',
      water_value: 1,
      water_level: 'low',
      source: 'Klimaateffectatlas WMS/WFS',
      source_date: '2026-02-05',
      sampled_at: '2026-02-05',
    },
    ...overrides,
  };
}

export function makeRiskComparisonsResponse(
  overrides: Partial<RiskComparisonsResponse> = {},
): RiskComparisonsResponse {
  return {
    address_id: 'vbo-123',
    generated_at: '2026-02-10',
    noise: [
      {
        label_code: 'city_avg',
        value: 54,
        role: 'peer',
        benchmark_family: 'urbanization_peer',
        label_key: 'risk.detail.peerUrbanization',
        scope: 'urbanization_peer',
      },
      {
        label_code: 'nl_avg',
        value: 66,
        role: 'national',
        benchmark_family: 'national_model',
        label_key: 'risk.detail.nationalBaseline',
        scope: 'national',
      },
      {
        label_code: 'who_limit',
        value: 74,
        pattern: 'dashed',
        role: 'reference',
        benchmark_family: 'who_noise_lden',
        label_key: 'risk.detail.whoNoiseGuideline',
        scope: 'reference',
      },
      {
        label_code: 'address',
        value: 56,
        role: 'address',
        benchmark_family: 'address_score',
        label_key: 'risk.detail.address',
        scope: 'address',
      },
    ],
    air_quality: [
      {
        label_code: 'city_avg',
        value: 57,
        role: 'peer',
        benchmark_family: 'urbanization_peer',
        label_key: 'risk.detail.peerUrbanization',
        scope: 'urbanization_peer',
      },
      {
        label_code: 'nl_avg',
        value: 68,
        role: 'national',
        benchmark_family: 'national_model',
        label_key: 'risk.detail.nationalBaseline',
        scope: 'national',
      },
      {
        label_code: 'air_interim_target',
        value: 75,
        pattern: 'dashed',
        role: 'reference',
        benchmark_family: 'air_interim_target',
        label_key: 'risk.detail.airQualityTarget',
        scope: 'reference',
      },
      {
        label_code: 'address',
        value: 74,
        role: 'address',
        benchmark_family: 'address_score',
        label_key: 'risk.detail.address',
        scope: 'address',
      },
    ],
    climate_stress: [
      {
        label_code: 'city_avg',
        value: 49,
        role: 'peer',
        benchmark_family: 'urbanization_peer',
        label_key: 'risk.detail.peerUrbanization',
        scope: 'urbanization_peer',
      },
      {
        label_code: 'nl_avg',
        value: 61,
        role: 'national',
        benchmark_family: 'national_model',
        label_key: 'risk.detail.nationalBaseline',
        scope: 'national',
      },
      {
        label_code: 'adaptation_target',
        value: 70,
        pattern: 'dashed',
        role: 'reference',
        benchmark_family: 'climate_adaptation_target',
        label_key: 'risk.detail.climateAdaptationTarget',
        scope: 'reference',
      },
      {
        label_code: 'address',
        value: 52,
        role: 'address',
        benchmark_family: 'address_score',
        label_key: 'risk.detail.address',
        scope: 'address',
      },
    ],
    sunlight: [
      {
        label_code: 'city_avg',
        value: 52,
        role: 'peer',
        benchmark_family: 'urbanization_peer',
        label_key: 'risk.detail.peerUrbanization',
        scope: 'urbanization_peer',
      },
      {
        label_code: 'nl_avg',
        value: 63,
        role: 'national',
        benchmark_family: 'national_model',
        label_key: 'risk.detail.nationalBaseline',
        scope: 'national',
      },
      {
        label_code: 'daylight_target',
        value: 67,
        pattern: 'dashed',
        role: 'reference',
        benchmark_family: 'daylight_target',
        label_key: 'risk.detail.daylightTarget',
        scope: 'reference',
      },
      {
        label_code: 'address',
        value: 45,
        role: 'address',
        benchmark_family: 'address_score',
        label_key: 'risk.detail.address',
        scope: 'address',
      },
    ],
    ...overrides,
  };
}

export interface ShadowSnapshotData {
  label: string;
  hour: number;
  dataUrl: string;
  viewpoint?: 'top' | 'front' | 'rear';
  sunAzimuth?: number;
  sunAltitude?: number;
}

export function makeShadowSnapshots(): ShadowSnapshotData[] {
  return [
    { label: 'summer_morning', hour: 9, dataUrl: 'data:image/png;base64,mock', viewpoint: 'top', sunAzimuth: 120, sunAltitude: 27 },
    { label: 'summer_noon', hour: 12, dataUrl: 'data:image/png;base64,mock', viewpoint: 'top', sunAzimuth: 180, sunAltitude: 60 },
    { label: 'summer_afternoon', hour: 15, dataUrl: 'data:image/png;base64,mock', viewpoint: 'top', sunAzimuth: 240, sunAltitude: 35 },
  ];
}

export function makeNeighborhood3DResponseWithLod22(
  overrides: Partial<Neighborhood3DResponse> = {},
): Neighborhood3DResponse {
  return {
    address_id: 'vbo-123',
    target_pand_id: '0363100012345678',
    center: { lat: 52.3676, lng: 4.8846, rd_x: 121000, rd_y: 487000 },
    buildings: [
      {
        pand_id: '0363100012345678',
        ground_height: 1.75,
        building_height: 8.25,
        footprint: [[0, 0], [5, 0], [5, 5], [0, 5]],
        year: 1917,
        roof_surfaces: [
          // Flat roof surface (4 verts at z=10.0)
          [[0, 0, 10.0], [5, 0, 10.0], [5, 5, 10.0], [0, 5, 10.0]],
          // Ground surface (4 verts at z=1.75)
          [[0, 5, 1.75], [5, 5, 1.75], [5, 0, 1.75], [0, 0, 1.75]],
          // Wall south
          [[0, 0, 1.75], [5, 0, 1.75], [5, 0, 10.0], [0, 0, 10.0]],
        ],
      },
    ],
    ...overrides,
  };
}

export function makeNeighborhoodStatsResponse(
  overrides: Partial<NeighborhoodStatsResponse> = {},
): NeighborhoodStatsResponse {
  return {
    address_id: 'vbo-123',
    source: 'CBS Wijken & Buurten 2024',
    source_year: 2024,
    source_years: [2024],
    mixed_source_years: false,
    source_notes: [],
    stats: {
      buurt_code: 'BU0363AD07',
      buurt_name: 'Centrum-Oost',
      gemeente_name: 'Amsterdam',
      population_density: { value: 15000, unit: 'per km²', available: true, precision: 0, source_year: 2024 },
      avg_household_size: { value: 1.8, available: true, precision: 1, source_year: 2024 },
      single_person_pct: { value: 55, unit: '%', available: true, precision: 1, source_year: 2024 },
      age_profile: {
        age_0_24: 18,
        age_25_64: 65,
        age_65_plus: 17,
      },
      owner_occupied_pct: { value: 35, unit: '%', available: true, precision: 1, source_year: 2024 },
      avg_property_value: { value: 520000, unit: '€', available: true, precision: 0, source_year: 2024 },
      distance_to_train_km: {
        value: 0.8,
        unit: 'km',
        available: true,
        quartile: 1,
        quartile_direction: 'lower_value',
        favorable_quartile: 4,
        precision: 1,
        source_year: 2024,
      },
      distance_to_supermarket_km: {
        value: 0.3,
        unit: 'km',
        available: true,
        quartile: 1,
        quartile_direction: 'lower_value',
        favorable_quartile: 4,
        precision: 1,
        source_year: 2024,
      },
      urbanization: 'very_urban',
    },
    ...overrides,
  };
}

export function makePropertyWarningsResponse(
  overrides: Partial<PropertyWarningsResponse> = {},
): PropertyWarningsResponse {
  return {
    address_id: 'vbo-123',
    attention_summary: {
      flag_count: 0,
      flags: [],
      risk_categories_assessed: 4,
      risk_categories_total: 4,
    },
    foundation_risk: {
      level: 'low',
      construction_year: 2005,
      soil_type: 'zand',
      messages: [],
    },
    erfpacht: { detected: false, messages: [] },
    vve: { is_apartment: false, messages: [] },
    asbestos: { flagged: false, messages: [] },
    lead_pipe: { flagged: false, messages: [] },
    ...overrides,
  };
}
