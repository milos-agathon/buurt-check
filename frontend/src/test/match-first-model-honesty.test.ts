import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const forbiddenClaims = [
  'predictive probability',
  'perfect fit',
  'objective best',
  'highest predictive power',
  'guaranteed',
  'raw_model_name',
  'internal_error_class',
];

function readFiles(root: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      chunks.push(readFiles(path));
    } else if (/\.(ts|tsx|json)$/.test(entry)) {
      chunks.push(readFileSync(path, 'utf8'));
    }
  }
  return chunks.join('\n').toLowerCase();
}

describe('match-first model honesty', () => {
  it('does not expose predictive claims or internal model fields in match-first UI code', () => {
    const source = [
      readFiles(join(process.cwd(), 'src', 'components', 'match-first')),
      readFiles(join(process.cwd(), 'src', 'services')),
      readFiles(join(process.cwd(), 'src', 'types')),
      readFileSync(join(process.cwd(), 'src', 'i18n', 'en.json'), 'utf8'),
      readFileSync(join(process.cwd(), 'src', 'i18n', 'nl.json'), 'utf8'),
    ].join('\n').toLowerCase();

    for (const claim of forbiddenClaims) {
      expect(source).not.toContain(claim);
    }
  });
});
