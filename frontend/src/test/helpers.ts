import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import type {
  AddressSuggestion,
  ResolvedAddress,
  BuildingFacts,
  BuildingFactsResponse,
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
