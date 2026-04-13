import { expect, test } from '@playwright/test';

test.use({ acceptDownloads: true });

const DOSSIER_SEED = {
  address: {
    id: 'adr-abc123',
    adresseerbaar_object_id: 'vbo-123',
    pand_id: 'pand-123',
    display_name: 'Teststraat 1, 1234 AB Amsterdam',
    street: 'Teststraat',
    house_number: '1',
    postcode: '1234AB',
    city: 'Amsterdam',
    municipality: 'Amsterdam',
    latitude: 52.3702,
    longitude: 4.8952,
    rd_x: 121687,
    rd_y: 487326,
    buurt_code: 'BU12345678',
  },
  buildingResponse: {
    address_id: 'vbo-123',
    building: {
      pand_id: 'pand-123',
      construction_year: 1999,
      status: 'Verblijfsobject in gebruik',
      status_en: 'Addressable object in use',
      intended_use: ['woonfunctie'],
      intended_use_en: ['residential'],
      num_units: 1,
      floor_area_m2: 85,
    },
  },
  sunlight: {
    winter: 2.4,
    equinox: 5.8,
    summer: 9.7,
    annualAverage: 6.1,
  },
  shadowSnapshots: [
    { label: 'winter', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
    { label: 'equinox', hour: 12, dataUrl: 'data:image/png;base64,BBB', viewpoint: 'top' },
    { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,CCC', viewpoint: 'top' },
  ],
};

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  + '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n'
  + 'trailer\n<< /Root 1 0 R >>\n%%EOF',
);

test('auto-starts the full dossier download after Stripe return confirmation', async ({ page }) => {
  const exportBodies: Array<Record<string, unknown>> = [];
  let confirmCalls = 0;
  let sunlightCalls = 0;

  page.on('console', (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    console.log(`[pageerror] ${error.stack ?? error.message}`);
  });

  await page.addInitScript((seed) => {
    localStorage.setItem('buurt-check-e2e-dossier-seed', JSON.stringify(seed));
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
  }, DOSSIER_SEED);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/pricing') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          price_cents: 399,
          price_eur: '3.99',
          currency: 'EUR',
          server_render_available: false,
          web_checkout_available: true,
          web_checkout_provider: 'stripe',
        }),
      });
      return;
    }

    if (path === '/api/billing/checkout-session/cs_test_123/confirm') {
      confirmCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          report_id: 'report-123',
          entitled: true,
          report_type: 'short',
        }),
      });
      return;
    }

    if (path === '/api/address/vbo-123/sunlight') {
      sunlightCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          cached: true,
          score: 88,
        }),
      });
      return;
    }

    if (path === '/api/address/vbo-123/export' && request.method() === 'POST') {
      const postData = request.postDataJSON() as Record<string, unknown>;
      exportBodies.push(postData);
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: PDF_BYTES,
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'mocked-unhandled-endpoint' }),
    });
  });

  await page.goto(
    '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
  );

  await expect.poll(() => confirmCalls).toBe(1);
  await expect.poll(() => sunlightCalls).toBeGreaterThan(0);
  await expect.poll(() => exportBodies.length).toBe(1);

  await expect(page.getByTestId('export-ready-actions')).toBeVisible();
  await expect(page.getByTestId('export-ready-actions').getByRole('button').first()).toBeVisible();

  expect(exportBodies[0]).toMatchObject({
    report_id: 'report-123',
    template: 'full_dossier',
    address: 'Teststraat 1, 1234 AB Amsterdam',
  });
});

test('captures and scrubs a real Stripe return without creating a replacement short report', async ({ page }) => {
  let confirmCalls = 0;
  let createShortReportCalls = 0;
  let lookupCalls = 0;
  const exportBodies: Array<Record<string, unknown>> = [];

  page.on('console', (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    console.log(`[pageerror] ${error.stack ?? error.message}`);
  });

  await page.addInitScript(() => {
    sessionStorage.setItem(
      'buurt-check:post-checkout-export',
      JSON.stringify({ reportId: 'report-123', template: 'full_dossier' }),
    );
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/pricing') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          price_cents: 399,
          price_eur: '3.99',
          currency: 'EUR',
          server_render_available: false,
          web_checkout_available: true,
          web_checkout_provider: 'stripe',
        }),
      });
      return;
    }

    if (path === '/api/address/lookup' && url.searchParams.get('id') === 'adr-abc123') {
      lookupCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'adr-abc123',
          adresseerbaar_object_id: 'vbo-123',
          pand_id: 'pand-123',
          display_name: 'Teststraat 1, 1234 AB Amsterdam',
          street: 'Teststraat',
          house_number: '1',
          postcode: '1234AB',
          city: 'Amsterdam',
          municipality: 'Amsterdam',
          latitude: 52.3702,
          longitude: 4.8952,
          rd_x: 121687,
          rd_y: 487326,
          buurt_code: 'BU12345678',
        }),
      });
      return;
    }

    if (path === '/api/address/vbo-123/building') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          address_id: 'vbo-123',
          building: {
            pand_id: 'pand-123',
            construction_year: 1999,
            status: 'Verblijfsobject in gebruik',
            status_en: 'Addressable object in use',
            intended_use: ['woonfunctie'],
            intended_use_en: ['residential'],
            num_units: 1,
            floor_area_m2: 85,
          },
        }),
      });
      return;
    }

    if (path === '/api/reports/report-123/entitlement') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'report not found for buyer' }),
      });
      return;
    }

    if (path === '/api/reports/short' && request.method() === 'POST') {
      createShortReportCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          report_id: 'report-replacement',
          report_type: 'short',
          already_purchased: false,
        }),
      });
      return;
    }

    if (path === '/api/billing/checkout-session/cs_test_123/confirm') {
      confirmCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          report_id: 'report-123',
          entitled: true,
          report_type: 'short',
        }),
      });
      return;
    }

    if (
      path === '/api/address/vbo-123/building3d'
      || path === '/api/address/vbo-123/neighborhood3d'
      || path === '/api/address/vbo-123/risks'
      || path === '/api/address/vbo-123/risk-comparisons'
      || path === '/api/address/vbo-123/neighborhood'
      || path === '/api/address/vbo-123/viewing-questions'
      || path === '/api/address/vbo-123/tier-b'
      || path === '/api/address/vbo-123/property-warnings'
      || path === '/api/address/vbo-123/livability'
      || path === '/api/address/vbo-123/weather-tmy'
    ) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'mocked-nonblocking-endpoint' }),
      });
      return;
    }

    if (path === '/api/address/vbo-123/sunlight') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          cached: true,
          score: 88,
        }),
      });
      return;
    }

    if (path === '/api/address/vbo-123/export' && request.method() === 'POST') {
      exportBodies.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: PDF_BYTES,
      });
      return;
    }

    if (path === '/api/address/wms-tile') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'mocked-nonblocking-endpoint' }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'mocked-unhandled-endpoint' }),
    });
  });

  await page.goto(
    '/?report=report-123&session_id=cs_test_123&buyer_resume=signed-buyer-token#/address/vbo-123?lookup=adr-abc123',
  );

  await expect.poll(() => lookupCalls > 0, { timeout: 20_000 }).toBeTruthy();
  await expect.poll(() => confirmCalls > 0, { timeout: 20_000 }).toBeTruthy();
  await expect.poll(() => page.url(), { timeout: 20_000 }).not.toContain('session_id=');
  await expect.poll(() => page.url(), { timeout: 20_000 }).not.toContain('buyer_resume=');
  await expect.poll(() => exportBodies.length, { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId('export-ready-actions')).toBeVisible();
  expect(exportBodies[0]).toMatchObject({
    report_id: 'report-123',
    template: 'full_dossier',
    address: 'Teststraat 1, 1234 AB Amsterdam',
  });
  expect(createShortReportCalls).toBe(0);
});
