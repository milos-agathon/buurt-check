import en from '../i18n/en.json';
import nl from '../i18n/nl.json';

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const MIN_KEY_COUNT = 396;

test('en.json and nl.json have identical key sets', () => {
  const enKeys = new Set(flatKeys(en));
  const nlKeys = new Set(flatKeys(nl));
  const missingInNl = [...enKeys].filter((k) => !nlKeys.has(k));
  const missingInEn = [...nlKeys].filter((k) => !enKeys.has(k));
  expect(missingInNl, `Keys in en.json missing from nl.json: ${missingInNl.join(', ')}`).toEqual(
    [],
  );
  expect(missingInEn, `Keys in nl.json missing from en.json: ${missingInEn.join(', ')}`).toEqual(
    [],
  );
});

test(`en.json has at least ${MIN_KEY_COUNT} keys (minimum threshold policy)`, () => {
  const enKeys = flatKeys(en);
  expect(
    enKeys.length,
    `Expected at least ${MIN_KEY_COUNT} i18n keys, got ${enKeys.length}`,
  ).toBeGreaterThanOrEqual(MIN_KEY_COUNT);
});

test(`nl.json has at least ${MIN_KEY_COUNT} keys (minimum threshold policy)`, () => {
  const nlKeys = flatKeys(nl);
  expect(
    nlKeys.length,
    `Expected at least ${MIN_KEY_COUNT} i18n keys, got ${nlKeys.length}`,
  ).toBeGreaterThanOrEqual(MIN_KEY_COUNT);
});
