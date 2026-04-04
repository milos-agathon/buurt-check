import { expect, test, type Page, devices } from '@playwright/test';

const DOSSIER_SEED = {
  address: {
    id: 'adr-seed-1',
    display_name: 'Keizersgracht 100, 1015AA Amsterdam',
    adresseerbaar_object_id: '0363010000696734',
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
    buurt_code: 'BU0363AD07',
  },
  buildingResponse: {
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
        coordinates: [
          [
            [4.8845, 52.3675],
            [4.8847, 52.3675],
            [4.8847, 52.3677],
            [4.8845, 52.3677],
            [4.8845, 52.3675],
          ],
        ],
      },
    },
  },
  riskCards: {
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
  },
  neighborhoodStats: {
    address_id: '0363010000696734',
    source: 'CBS Wijken & Buurten 2024',
    source_year: 2024,
    stats: {
      buurt_code: 'BU0363AD07',
      buurt_name: 'Centrum-Oost',
      gemeente_name: 'Amsterdam',
      population_density: { value: 15000, unit: 'per km2', available: true, quartile: 4 },
      avg_household_size: { value: 1.8, available: true, quartile: 2 },
      single_person_pct: { value: 55, unit: '%', available: true, quartile: 4 },
      age_profile: { age_0_24: 18, age_25_64: 65, age_65_plus: 17 },
      owner_occupied_pct: { value: 35, unit: '%', available: true, quartile: 1 },
      avg_property_value: { value: 520000, unit: 'EUR', available: true, quartile: 4 },
      distance_to_train_km: { value: 0.8, unit: 'km', available: true, quartile: 1 },
      distance_to_supermarket_km: { value: 0.3, unit: 'km', available: true, quartile: 1 },
      urbanization: 'very_urban',
    },
  },
  tierBData: {
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
  },
  sunlight: {
    winter: 2.7,
    equinox: 6.4,
    summer: 10.1,
    annualAverage: 6.5,
    analysisYear: 2026,
  },
  viewingQuestions: {
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
  },
};

interface TabGeometry {
  text: string;
  outsideBarTop: boolean;
  outsideBarBottom: boolean;
  outsideInnerTop: boolean;
  outsideInnerBottom: boolean;
}

async function openSeededDossier(page: Page) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem('buurt-check-e2e-dossier-seed', JSON.stringify(seed));
  }, DOSSIER_SEED);

  await page.goto('/');
  await expect(page.locator('.building-card')).toBeVisible({ timeout: 30_000 });
}

test.use({
  browserName: 'webkit',
  ...devices['iPhone 13'],
});

test.describe('iOS tab bar safe-area stability', () => {
  test('keeps every tab inside the bar when the bottom inset grows during dossier scrolling', async ({ page }) => {
    await openSeededDossier(page);

    await page.addStyleTag({
      content: '.tab-bar { padding-bottom: 34px !important; }',
    });
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(200);

    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.tab-bar');
      const inner = document.querySelector('.tab-bar__inner');
      const tabs = Array.from(document.querySelectorAll('.tab-bar__tab'));

      if (!(bar instanceof HTMLElement) || !(inner instanceof HTMLElement)) {
        return null;
      }

      const barRect = bar.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();

      return {
        barHeight: barRect.height,
        innerHeight: innerRect.height,
        tabs: tabs.map((tab) => {
          if (!(tab instanceof HTMLElement)) {
            return null;
          }

          const rect = tab.getBoundingClientRect();
          return {
            text: tab.innerText,
            outsideBarTop: rect.top < barRect.top,
            outsideBarBottom: rect.bottom > barRect.bottom,
            outsideInnerTop: rect.top < innerRect.top,
            outsideInnerBottom: rect.bottom > innerRect.bottom,
          };
        }).filter((tab): tab is TabGeometry => tab !== null),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.barHeight).toBeGreaterThan(56);
    expect(Math.round(geometry?.innerHeight ?? 0)).toBe(56);

    for (const tab of geometry?.tabs ?? []) {
      expect(tab.outsideBarTop, `${tab.text} escaped above the tab bar`).toBe(false);
      expect(tab.outsideBarBottom, `${tab.text} escaped below the tab bar`).toBe(false);
      expect(tab.outsideInnerTop, `${tab.text} escaped above the inner tab row`).toBe(false);
      expect(tab.outsideInnerBottom, `${tab.text} escaped below the inner tab row`).toBe(false);
    }
  });
});
