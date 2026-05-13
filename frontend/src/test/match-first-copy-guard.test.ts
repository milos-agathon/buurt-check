import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const matchFirstRoot = join(projectRoot, 'src/components/match-first');
const matchSurfaceFiles = [
  join(projectRoot, 'src/App.tsx'),
];
const i18nFiles = [
  join(projectRoot, 'src/i18n/en.json'),
  join(projectRoot, 'src/i18n/nl.json'),
];

function collectFiles(dir: string, predicate: (filePath: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function readTranslationValues(filePath: string): string {
  return Object.values(JSON.parse(read(filePath)) as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

describe('match-first copy guard', () => {
  it('keeps visible match-first component copy behind translation keys', () => {
    const tsxFiles = collectFiles(matchFirstRoot, (filePath) => (
      filePath.endsWith('.tsx') && !filePath.endsWith('.test.tsx')
    ));

    const violations = tsxFiles.flatMap((filePath) => {
      const source = read(filePath);
      const visibleTextMatches = [...source.matchAll(/>\s*([A-Za-z][^<{]*[A-Za-z])\s*</g)]
        .map((match) => `${relative(projectRoot, filePath)}: ${match[1].trim()}`);
      const hardCodedLanguageMatches = [...source.matchAll(/(['"`])(NL|EN|Survey shell|Survey-shell)\1/g)]
        .map((match) => `${relative(projectRoot, filePath)}: ${match[2]}`);
      return [...visibleTextMatches, ...hardCodedLanguageMatches];
    });

    expect(violations).toEqual([]);
  });

  it('blocks unsupported model certainty claims in match-first copy', () => {
    const files = [
      ...collectFiles(matchFirstRoot, (filePath) => filePath.endsWith('.tsx')),
      ...matchSurfaceFiles,
      ...i18nFiles,
    ];
    const forbidden = [
      /\bpredictive probabilit(?:y|ies)\b/,
      /\bhighest predictive power\b/,
      /\bperfect fit\b/,
      /\bobjective best\b/,
      /\bguaranteed outcomes?\b/,
      /\bguaranteed affordability\b/,
      /\binvestment certainty\b/,
      /\bfuture value\b/,
      /\bguaranteed future\b/,
      /\bguaranteed safety\b/,
      /\bperfectly safe\b/,
      /\bsafest\b/,
      /\bhappiness\b/,
      /\bmake you happy\b/,
    ];

    const violations = files.flatMap((filePath) => {
      const lower = read(filePath).toLowerCase();
      return forbidden
        .filter((pattern) => pattern.test(lower))
        .map((pattern) => `${relative(projectRoot, filePath)}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not expose developer placeholder terms in bundled translations', () => {
    const forbidden = ['survey shell', 'survey-shell', 'backend', 'polling', 'connected'];
    const violations = i18nFiles.flatMap((filePath) => {
      const lower = readTranslationValues(filePath).toLowerCase();
      return forbidden
        .filter((phrase) => lower.includes(phrase))
        .map((phrase) => `${relative(projectRoot, filePath)}: ${phrase}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps match-surface language labels and fallbacks behind translation keys', () => {
    const forbidden = [
      />\s*English\s*</,
      />\s*Nederlands\s*</,
      /Could not reopen this address\. Search for it again\./,
    ];
    const violations = matchSurfaceFiles.flatMap((filePath) => {
      const source = read(filePath);
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(projectRoot, filePath)}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps App route fallbacks and Suspense loading states localized', () => {
    const source = read(join(projectRoot, 'src/App.tsx'));
    const violations = [
      ...[...source.matchAll(/\bt\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]/g)]
        .map((match) => `src/App.tsx: ${match[0]}`),
      ...[...source.matchAll(/<Suspense\s+fallback=\{null\}>/g)]
        .map((match) => `src/App.tsx: ${match[0]}`),
    ];

    expect(violations).toEqual([]);
  });
});
