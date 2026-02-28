import type { Page, Route } from '@playwright/test';

type DelayMap = Partial<Record<
  | 'suggest'
  | 'lookup'
  | 'building'
  | 'building3d'
  | 'neighborhood3d'
  | 'risks'
  | 'riskComparisons'
  | 'neighborhood'
  | 'viewingQuestions'
  | 'tierB',
  number
>>;

async function fulfillJson(route: Route, body: unknown, delayMs: number = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installMockAddressFlow(page: Page, delays: DelayMap = {}) {
  await page.route('**/api/address/suggest**', async (route) => {
    await fulfillJson(route, {
      suggestions: [
        {
          id: 'adr-mock-1',
          display_name: 'Keizersgracht 100, 1015AA Amsterdam',
          type: 'adres',
          score: 18.7,
        },
      ],
    }, delays.suggest ?? 0);
  });

  await page.route('**/api/address/lookup**', async (route) => {
    await fulfillJson(route, {
      id: 'adr-mock-1',
      display_name: 'Keizersgracht 100, 1015AA Amsterdam',
      street: 'Keizersgracht',
      house_number: '100',
      postcode: '1015AA',
      city: 'Amsterdam',
      rd_x: 121000,
      rd_y: 487000,
      latitude: 52.3676,
      longitude: 4.8846,
      adresseerbaar_object_id: '0363010000696734',
      buurt_code: 'BU0363AD07',
    }, delays.lookup ?? 0);
  });

  await page.route(/\/api\/address\/[^/]+\/building$/, async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      building: {
        pand_id: '0363100012345678',
        construction_year: 1917,
        status: 'Pand in gebruik',
        status_en: 'In use',
        intended_use: ['woonfunctie'],
        intended_use_en: ['Residential'],
        num_units: 3,
        floor_area_m2: 143,
        footprint_geojson: {
          type: 'Polygon',
          coordinates: [[[4.8845, 52.3675], [4.8847, 52.3675], [4.8847, 52.3677], [4.8845, 52.3677], [4.8845, 52.3675]]],
        },
      },
    }, delays.building ?? 0);
  });

  await page.route(/\/api\/address\/[^/]+\/building3d(\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      target_pand_id: null,
      center: { lat: 52.3676, lng: 4.8846, rd_x: 121000, rd_y: 487000 },
      buildings: [],
      message: 'No 3D building data available.',
    }, delays.building3d ?? 0);
  });

  await page.route(/\/api\/address\/[^/]+\/neighborhood3d(\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      target_pand_id: null,
      center: { lat: 52.3676, lng: 4.8846, rd_x: 121000, rd_y: 487000 },
      buildings: [],
      message: 'No 3D building data available.',
    }, delays.neighborhood3d ?? 0);
  });

  await page.route('**/api/address/*/risks**', async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      noise: {
        level: 'medium',
        lden_db: 58.1,
        source: 'RIVM',
        source_date: '2025-01-01',
        sampled_at: '2026-02-10',
        score: 56,
        severity: 'moderate',
        summary: 'Moderate traffic noise.',
        summary_nl: 'Matig verkeersgeluid.',
      },
      air_quality: {
        level: 'low',
        pm25_ug_m3: 8.1,
        no2_ug_m3: 17.3,
        pm25_level: 'low',
        no2_level: 'low',
        source: 'RIVM GCN',
        source_date: '2025',
        sampled_at: '2026-02-10',
        score: 74,
        severity: 'good',
        summary: 'Air quality is favorable.',
        summary_nl: 'Luchtkwaliteit is gunstig.',
      },
      climate_stress: {
        level: 'medium',
        heat_level: 'medium',
        water_level: 'low',
        source: 'Klimaateffectatlas',
        source_date: '2025',
        sampled_at: '2026-02-10',
        score: 52,
        severity: 'moderate',
        summary: 'Moderate heat stress risk.',
        summary_nl: 'Matig risico op hittestress.',
      },
      sunlight: {
        level: 'medium',
        winter_hours: 2.7,
        source: '3DBAG + SunCalc',
        score: 45,
        severity: 'moderate',
        summary: 'Limited winter sunlight.',
        summary_nl: 'Beperkt winterzonlicht.',
      },
    }, delays.risks ?? 0);
  });

  await page.route('**/api/address/*/neighborhood**', async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      source: 'CBS Wijken & Buurten 2024',
      source_year: 2024,
      stats: {
        buurt_code: 'BU0363AD07',
        buurt_name: 'Centrum-Oost',
        gemeente_name: 'Amsterdam',
        population_density: { value: 15000, unit: 'per km²', available: true, quartile: 4 },
        avg_household_size: { value: 1.8, available: true, quartile: 2 },
        single_person_pct: { value: 55, unit: '%', available: true, quartile: 4 },
        age_profile: { age_0_24: 18, age_25_64: 65, age_65_plus: 17 },
        owner_occupied_pct: { value: 35, unit: '%', available: true, quartile: 1 },
        avg_property_value: { value: 520000, unit: 'EUR', available: true, quartile: 4 },
        distance_to_train_km: { value: 0.8, unit: 'km', available: true, quartile: 1 },
        distance_to_supermarket_km: { value: 0.3, unit: 'km', available: true, quartile: 1 },
        urbanization: 'very_urban',
      },
    }, delays.neighborhood ?? 0);
  });

  await page.route('**/api/address/*/risk-comparisons**', async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      generated_at: '2026-02-10',
      noise: [
        { label_code: 'city_avg', value: 54 },
        { label_code: 'nl_avg', value: 66 },
        { label_code: 'who_limit', value: 74, pattern: 'dashed' },
        { label_code: 'address', value: 56 },
      ],
      air_quality: [
        { label_code: 'city_avg', value: 57 },
        { label_code: 'nl_avg', value: 68 },
        { label_code: 'who_limit', value: 75, pattern: 'dashed' },
        { label_code: 'address', value: 74 },
      ],
      climate_stress: [
        { label_code: 'city_avg', value: 49 },
        { label_code: 'nl_avg', value: 61 },
        { label_code: 'adaptation_target', value: 70, pattern: 'dashed' },
        { label_code: 'address', value: 52 },
      ],
      sunlight: [
        { label_code: 'city_avg', value: 52 },
        { label_code: 'nl_avg', value: 63 },
        { label_code: 'daylight_target', value: 67, pattern: 'dashed' },
        { label_code: 'address', value: 45 },
      ],
    }, delays.riskComparisons ?? 0);
  });

  await page.route('**/api/address/*/viewing-questions**', async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      categories: [
        {
          name: 'Noise',
          name_nl: 'Geluid',
          severity: 'moderate',
          questions: [
            {
              text_en: 'Can you hear traffic with windows closed?',
              text_nl: 'Hoor je verkeer met gesloten ramen?',
            },
          ],
        },
      ],
    }, delays.viewingQuestions ?? 0);
  });

  await page.route('**/api/address/*/tier-b**', async (route) => {
    await fulfillJson(route, {
      address_id: '0363010000696734',
      crime: {
        total_per_1000: 12.5,
        burglary_per_1000: 1.2,
        violent_per_1000: 0.8,
        monthly_total_per_1000: 1.1,
        monthly_period: '2025MM12',
        source: 'CBS OData 47018NED/47022NED',
        source_date: '2025JJ00',
      },
    }, delays.tierB ?? 0);
  });
}
