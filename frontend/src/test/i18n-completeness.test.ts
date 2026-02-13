import en from '../i18n/en.json';
import nl from '../i18n/nl.json';

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

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
