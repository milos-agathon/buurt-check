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

export interface ShadowSnapshotData {
  label: string;
  hour: number;
  dataUrl: string;
}

export function makeShadowSnapshots(): ShadowSnapshotData[] {
  return [
    { label: 'morning', hour: 9, dataUrl: 'data:image/png;base64,mock' },
    { label: 'noon', hour: 12, dataUrl: 'data:image/png;base64,mock' },
    { label: 'evening', hour: 17, dataUrl: 'data:image/png;base64,mock' },
  ];
}

export function makeNeighborhoodStatsResponse(
  overrides: Partial<NeighborhoodStatsResponse> = {},
): NeighborhoodStatsResponse {
  return {
    address_id: 'vbo-123',
    source: 'CBS Wijken & Buurten 2024',
    source_year: 2024,
    stats: {
      buurt_code: 'BU0363AD07',
      buurt_name: 'Centrum-Oost',
      gemeente_name: 'Amsterdam',
      population_density: { value: 15000, unit: 'per km²', available: true },
      avg_household_size: { value: 1.8, available: true },
      single_person_pct: { value: 55, unit: '%', available: true },
      age_profile: {
        age_0_24: 18,
        age_25_64: 65,
        age_65_plus: 17,
      },
      owner_occupied_pct: { value: 35, unit: '%', available: true },
      avg_property_value: { value: 520000, unit: '€', available: true },
      distance_to_train_km: { value: 0.8, unit: 'km', available: true },
      distance_to_supermarket_km: { value: 0.3, unit: 'km', available: true },
      urbanization: 'very_urban',
    },
    ...overrides,
  };
}
