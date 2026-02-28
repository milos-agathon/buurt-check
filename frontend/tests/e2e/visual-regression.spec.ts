import { expect, test, type Page } from '@playwright/test';
import { installMockAddressFlow } from './helpers/mockApi';

const SHORTLIST_SEED = [
  {
    vboId: '0363010000696734',
    address: 'Keizersgracht 100, Amsterdam',
    postcode: '1015AA',
    city: 'Amsterdam',
    riskScores: { noise: 56, air: 74, climate: 52, sunlight: 45 },
    savedAt: 1739200000000,
  },
  {
    vboId: '0363010000696735',
    address: 'Prinsengracht 220, Amsterdam',
    postcode: '1016HC',
    city: 'Amsterdam',
    riskScores: { noise: 49, air: 68, climate: 47, sunlight: 51 },
    savedAt: 1739201000000,
  },
];

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

async function seedShortlist(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript(
    ({ items, currentTheme }) => {
      window.localStorage.setItem('buurt-check-shortlist', JSON.stringify(items));
      if (currentTheme === 'dark') {
        window.localStorage.setItem('buurt-check-theme', 'dark');
      }
    },
    { items: SHORTLIST_SEED, currentTheme: theme },
  );
}

async function openSeededDossier(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript(
    ({ seed, currentTheme }) => {
      window.localStorage.setItem('buurt-check-e2e-dossier-seed', JSON.stringify(seed));
      if (currentTheme === 'dark') {
        window.localStorage.setItem('buurt-check-theme', 'dark');
      }
    },
    { seed: DOSSIER_SEED, currentTheme: theme },
  );
  await page.goto('/');
  await expect(page.locator('.address-header')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.building-card')).toBeVisible({ timeout: 20000 });
}

test.describe('Phase 5 Visual Regression - Mobile Light', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });

  test('search screen baseline', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto('/');
    await expect(page).toHaveScreenshot('search-screen.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('saved screen baseline', async ({ page }) => {
    await seedShortlist(page, 'light');
    await page.goto('/');
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByTestId('shortlist-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('saved-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('compare screen baseline', async ({ page }) => {
    await seedShortlist(page, 'light');
    await page.goto('/');
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByRole('button', { name: /Compare|Vergelijk/ })).toBeVisible();
    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByRole('heading', { name: /Compare|Vergelijk/ })).toBeVisible();

    await expect(page).toHaveScreenshot('compare-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('dossier screen baseline', async ({ page }) => {
    await openSeededDossier(page, 'light');
    await expect(page).toHaveScreenshot('dossier-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('settings screen baseline', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('settings-screen-mobile-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Phase 5 Visual Regression - Mobile Dark', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });

  test('saved screen dark baseline', async ({ page }) => {
    await seedShortlist(page, 'dark');
    await page.goto('/');
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByTestId('shortlist-screen')).toBeVisible();

    await expect(page).toHaveScreenshot('saved-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('dossier screen dark baseline', async ({ page }) => {
    await openSeededDossier(page, 'dark');
    await expect(page).toHaveScreenshot('dossier-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('search screen dark baseline', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('buurt-check-theme', 'dark');
    });
    await installMockAddressFlow(page);
    await page.goto('/');
    await expect(page).toHaveScreenshot('search-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('compare screen dark baseline', async ({ page }) => {
    await seedShortlist(page, 'dark');
    await page.goto('/');
    await page.getByRole('tab', { name: /Saved|Opgeslagen/ }).click();
    await expect(page.getByRole('button', { name: /Compare|Vergelijk/ })).toBeVisible();
    await page.getByRole('button', { name: /Compare|Vergelijk/ }).click();
    await expect(page.getByRole('heading', { name: /Compare|Vergelijk/ })).toBeVisible();

    await expect(page).toHaveScreenshot('compare-screen-mobile-dark.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Phase 5 Visual Regression - Desktop Light', () => {
  test.use({
    viewport: { width: 1366, height: 900 },
    colorScheme: 'light',
  });

  test('search screen desktop baseline', async ({ page }) => {
    await installMockAddressFlow(page);
    await page.goto('/');
    await expect(page).toHaveScreenshot('search-screen-desktop-light.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
