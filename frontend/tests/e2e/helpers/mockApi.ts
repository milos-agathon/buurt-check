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
  | 'prebidBriefing'
  | 'prebidPack',
  number
>>;

const PREBID_COVERAGE = [
  {
    id: 'noise',
    authority: 'RIVM',
    label: 'RIVM noise contours',
    status: 'checked',
    basis: 'Address overlay',
    method: 'Open-data overlay',
    version: '2025',
    duration_ms: 420,
    checked_at: '2026-05-06',
    source_date: '2025-03',
    limitation: 'Modelled outdoor contours. Verify indoor noise during the viewing.',
    limitation_nl: 'Gemodelleerde buitensignalen. Controleer geluid binnen tijdens de bezichtiging.',
  },
  {
    id: 'climate',
    authority: 'Klimaateffectatlas',
    label: 'Heat and water stress',
    status: 'review',
    basis: 'Street context',
    method: 'Open-data overlay',
    checked_at: '2026-05-06',
    limitation: 'Area-level signal. Check drainage and maintenance records.',
  },
  {
    id: 'cbs',
    authority: 'CBS',
    label: 'Neighborhood indicators',
    status: 'checked',
    basis: 'Buurt code',
    method: 'Open-data table lookup',
    checked_at: '2026-05-06',
    source_date: '2024',
    limitation: 'Neighborhood-level figures do not describe this exact home.',
  },
  {
    id: 'bag',
    authority: 'BAG',
    label: 'Address and building registration',
    status: 'checked',
    basis: 'VBO and pand identifiers',
    method: 'Government registry lookup',
    checked_at: '2026-05-06',
    source_date: '2026-05-06',
    limitation: 'Registry facts do not replace a building inspection.',
  },
];

const PREBID_ACTION = {
  id: 'noise-viewing-check',
  category: 'noise',
  priority: 1,
  severity: 'moderate',
  finding: 'Road noise should be checked in the bedroom.',
  finding_nl: 'Controleer verkeersgeluid in de slaapkamer.',
  why_it_matters: 'Noise can affect sleep and facade expectations.',
  why_it_matters_nl: 'Geluid kan slaap en gevelverwachtingen beinvloeden.',
  ask_this: {
    en: 'Can you hear traffic with bedroom windows closed?',
    nl: 'Hoor je verkeer met gesloten slaapkamerramen?',
  },
  request_this: 'Ask for glazing and ventilation documentation.',
  request_this_nl: 'Vraag documentatie over glas en ventilatie.',
  who_to_ask: ['Selling agent', 'Inspector'],
  confidence: 'medium',
  limitation: PREBID_COVERAGE[0].limitation,
  limitation_nl: PREBID_COVERAGE[0].limitation_nl,
  source_refs: [
    {
      name: 'RIVM noise contours',
      source_date: '2025-03',
      checked_at: '2026-05-06',
      method: 'Open-data overlay',
      coverage_status: 'checked',
      limitation: PREBID_COVERAGE[0].limitation,
      limitation_nl: PREBID_COVERAGE[0].limitation_nl,
    },
  ],
};

const PREBID_BRIEFING = {
  briefing_id: 'brief-1',
  address_id: '0363010000696734',
  report_id: 'report-1',
  address_label: 'Keizersgracht 100, 1015AA Amsterdam',
  checked_at: '2026-05-06',
  result_state: 'data_incomplete',
  disclaimer: 'Source-bound briefing for viewing preparation. Confirm decisions with your inspector, adviser, notary, or buyer agent.',
  disclaimer_nl: 'Brongebonden briefing voor bezichtigingsvoorbereiding. Bevestig beslissingen met je bouwkundige, adviseur, notaris of aankoopmakelaar.',
  coverage: PREBID_COVERAGE,
  top_actions: [PREBID_ACTION],
  source_quality: {
    unknown_source_date_count: 0,
    generic_confidence_count: 0,
    generic_limitation_count: 0,
    missing_source_ref_count: 0,
    missing_recipient_count: 0,
    caps: [],
  },
};

const PREBID_PACK = {
  pack_id: 'pack-1',
  address_id: PREBID_BRIEFING.address_id,
  report_id: PREBID_BRIEFING.report_id,
  address_label: PREBID_BRIEFING.address_label,
  checked_at: PREBID_BRIEFING.checked_at,
  status: 'ready',
  disclaimer: PREBID_BRIEFING.disclaimer,
  disclaimer_nl: PREBID_BRIEFING.disclaimer_nl,
  actions: [PREBID_ACTION],
  question_groups: [
    {
      recipient: 'Selling agent',
      questions: [PREBID_ACTION.ask_this],
      requests: [PREBID_ACTION.request_this],
    },
  ],
  coverage: PREBID_COVERAGE,
  share_url: 'https://app.buurt-check.nl/#/shared-pack/demo-token',
};

const NEIGHBORHOOD_3D_READY_FIXTURE = {
  address_id: '0363010000696734',
  target_pand_id: '0363100012345678',
  center: { lat: 52.3676, lng: 4.8846, rd_x: 121000, rd_y: 487000 },
  buildings: [
    {
      pand_id: '0363100012345678',
      ground_height: 0,
      building_height: 18,
      year: 1917,
      footprint: [[-8, -9], [8, -9], [8, 9], [-8, 9]],
    },
    {
      pand_id: '0363100012345679',
      ground_height: 0,
      building_height: 15,
      year: 1924,
      footprint: [[18, -10], [32, -10], [32, 8], [18, 8]],
    },
    {
      pand_id: '0363100012345680',
      ground_height: 0,
      building_height: 13,
      year: 1931,
      footprint: [[-34, -8], [-18, -8], [-18, 10], [-34, 10]],
    },
    {
      pand_id: '0363100012345681',
      ground_height: 0,
      building_height: 20,
      year: 1908,
      footprint: [[-10, 22], [10, 22], [10, 38], [-10, 38]],
    },
    {
      pand_id: '0363100012345682',
      ground_height: 0,
      building_height: 11,
      year: 1965,
      footprint: [[-9, -40], [11, -40], [11, -22], [-9, -22]],
    },
  ],
};

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
  await page.route(/\/api\/address\/[^/]+\/prebid\/briefing$/, async (route) => {
    await fulfillJson(route, PREBID_BRIEFING, delays.prebidBriefing ?? 0);
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/pack\/[^/]+$/, async (route) => {
    await fulfillJson(route, PREBID_PACK, delays.prebidPack ?? 0);
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/briefing\/[^/]+\/share$/, async (route) => {
    await fulfillJson(route, {
      share_token: 'briefing-token',
      share_url: 'https://app.buurt-check.nl/#/shared/briefing-token',
      mode: 'briefing',
      scope: 'briefing',
      expires_at: '2026-06-06T00:00:00Z',
    });
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/pack\/[^/]+\/share$/, async (route) => {
    await fulfillJson(route, {
      share_token: 'demo-token',
      share_url: 'https://app.buurt-check.nl/#/shared-pack/demo-token',
      mode: 'pack',
      scope: 'pack',
      expires_at: '2026-06-06T00:00:00Z',
    });
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/briefing\/[^/]+\/email$/, async (route) => {
    await fulfillJson(route, {
      share_token: 'briefing-email-token',
      share_url: 'https://app.buurt-check.nl/#/shared/briefing-email-token',
      mode: 'briefing',
      scope: 'briefing',
      email_sent: true,
    });
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/pack\/[^/]+\/email$/, async (route) => {
    await fulfillJson(route, {
      share_token: 'pack-email-token',
      share_url: 'https://app.buurt-check.nl/#/shared-pack/pack-email-token',
      mode: 'pack',
      scope: 'pack',
      email_sent: true,
    });
  });

  await page.route(/\/api\/address\/[^/]+\/prebid\/briefing\/[^/]+$/, async (route) => {
    await fulfillJson(route, { deleted: true });
  });

  await page.route(/\/api\/shared\/prebid-pack\/deleted-token$/, async (route) => {
    await fulfillJson(route, {
      state: 'deleted',
      mode: 'pack',
      support_email: 'support@buurt-check.nl',
    });
  });

  await page.route(/\/api\/shared\/prebid-pack\/demo-token$/, async (route) => {
    await fulfillJson(route, {
      state: 'valid',
      mode: 'pack',
      pack: PREBID_PACK,
    });
  });

  await page.route(/\/api\/shared\/prebid\/revoked-token$/, async (route) => {
    await fulfillJson(route, {
      state: 'revoked',
      mode: 'briefing',
      support_email: 'support@buurt-check.nl',
    });
  });

  await page.route('**/api/reports/short', async (route) => {
    await fulfillJson(route, {
      report_id: 'report-1',
      report_type: 'short',
      already_purchased: false,
    });
  });

  await page.route('**/api/reports/*/entitlement', async (route) => {
    await fulfillJson(route, {
      report_id: 'report-1',
      entitled: false,
      report_type: 'short',
    });
  });

  await page.route('**/api/address/suggest**', async (route) => {
    await fulfillJson(route, {
      suggestions: [
        {
          id: 'adr-mock-1',
          display_name: 'Keizersgracht 100, 1015AA Amsterdam',
          type: 'adres',
          score: 18.7,
        },
        {
          id: 'adr-mock-2',
          display_name: 'Keizersgracht 102, 1015AA Amsterdam',
          type: 'adres',
          score: 17.4,
        },
        {
          id: 'adr-mock-3',
          display_name: 'Keizersgracht 104, 1015AA Amsterdam',
          type: 'adres',
          score: 16.9,
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
    await fulfillJson(route, NEIGHBORHOOD_3D_READY_FIXTURE, delays.neighborhood3d ?? 0);
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
}
