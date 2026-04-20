const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();

  const seed = {
    address: {
      id: 'adr-abc123',
      display_name: 'Example Street 12, 1234AB Sample City',
      adresseerbaar_object_id: 'vbo-123',
      street: 'Example Street',
      house_number: '12',
      postcode: '1234AB',
      city: 'Sample City',
      municipality: 'Katwijk',
      province: 'Zuid-Holland',
      latitude: 52.18012,
      longitude: 4.43321,
      rd_x: 90000,
      rd_y: 463000,
    },
    buildingResponse: {
      address_id: 'vbo-123',
      building: {
        pand_id: '0363100012345678',
        construction_year: 1987,
        status: 'Pand in gebruik',
        status_en: 'Building in use',
        intended_use: ['woonfunctie'],
        intended_use_en: ['residential'],
        num_units: 1,
        floor_area_m2: 130,
      },
    },
    viewingQuestions: {
      address_id: 'vbo-123',
      categories: [
        { name: 'Noise', name_nl: 'Geluid', severity: 'moderate', questions: [
          { text_en: 'With windows open on Example Street in Sample City, can you hear traffic in the bedroom (score 50/100)? Current road-noise signal is 65.0 dB Lden.', text_nl: '' },
          { text_en: 'Visit once during evening rush hour on Example Street in Sample City and once after 22:00. Is there a clear difference in noise?', text_nl: '' },
          { text_en: 'Ask which rooms face the busiest side of the street and what glazing is installed.', text_nl: '' },
        ] },
        { name: 'Climate Stress', name_nl: 'Klimaatstress', severity: 'critical', questions: [
          { text_en: 'Because climate stress is elevated on Example Street in Sample City (score 15/100), ask whether heavy rain has ever caused water ingress in the home or street. Current levels are heat: medium, water: high.', text_nl: '' },
          { text_en: 'Check gutters, downspouts, and crawl space/basement for signs of recurring moisture.', text_nl: '' },
          { text_en: 'Ask what heat mitigation is in place (external shading, ventilation, cooling) during warm summer periods.', text_nl: '' },
        ] },
      ],
    },
  };

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((value) => {
    localStorage.setItem('buurt-check-e2e-dossier-seed', JSON.stringify(value));
    localStorage.setItem('buurt-check-theme', 'dark');
  }, seed);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tabbar-nonfixed-checklist.png', fullPage: false });
  await browser.close();
})();
