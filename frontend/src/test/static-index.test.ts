import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

it('positions static metadata around match-first neighborhood discovery', () => {
  expect(html).toContain('<title>Buurt Check | Neighborhood match</title>');
  expect(html).toMatch(/Match with Dutch neighborhoods before checking a specific home address/i);
  expect(html).not.toMatch(/property risk dossier/i);
});

it('keeps the no-JavaScript loading fallback bilingual under explicit language tags', () => {
  expect(html).toContain('<span lang="nl">Buurt Check wordt geladen</span>');
  expect(html).toContain('<span lang="en">Buurt Check is loading</span>');
  expect(html).toContain('<span lang="nl">Als dit zichtbaar blijft, is de app niet gestart in deze browser.</span>');
  expect(html).toContain('<span lang="en">If this stays visible, the app did not start in this browser.</span>');
});
