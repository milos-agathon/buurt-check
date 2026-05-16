import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const matchFirstRoot = join(projectRoot, 'src/components/match-first');
const matchSurfaceFiles = [
  join(projectRoot, 'src/App.tsx'),
  join(projectRoot, 'src/components/NotFoundScreen.tsx'),
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
      const visibleTextMatches = [...source.matchAll(/>[ \t]*([A-Za-z][^<{\r\n]*[A-Za-z])[ \t]*</g)]
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

  it('keeps match-first survey review copy out of search-first framing', () => {
    const en = JSON.parse(read(join(projectRoot, 'src/i18n/en.json'))) as Record<string, string>;
    const nl = JSON.parse(read(join(projectRoot, 'src/i18n/nl.json'))) as Record<string, string>;

    expect(en['matchFirst.review.answerLabel'].toLowerCase()).not.toContain('search');
    expect(nl['matchFirst.review.answerLabel'].toLowerCase()).not.toContain('zoek');
  });

  it('keeps Phase 2 survey and match-state copy out of search-first and certainty framing', () => {
    const en = JSON.parse(read(join(projectRoot, 'src/i18n/en.json'))) as Record<string, string>;
    const nl = JSON.parse(read(join(projectRoot, 'src/i18n/nl.json'))) as Record<string, string>;
    const keys = [
      'matchFirst.survey.questions.household.title',
      'matchFirst.survey.questions.housing.title',
      'matchFirst.survey.questions.housing.helper',
      'matchFirst.failure.noStrongMatches',
    ];
    const forbiddenByLocale = [
      [en, /\b(search|perfect|predict|guarantee|safe|safest)\b/i],
      [nl, /\b(zoek|perfect|voorspel|garantie|veilig|veiligst)\b/i],
    ] as const;

    const violations = forbiddenByLocale.flatMap(([translations, pattern]) => (
      keys
        .filter((key) => pattern.test(translations[key] ?? ''))
        .map((key) => `${key}: ${translations[key]}`)
    ));

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
    const violations = matchSurfaceFiles.flatMap((filePath) => {
      const source = read(filePath);
      return [
        ...[...source.matchAll(/\bt\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]/g)]
          .map((match) => `${relative(projectRoot, filePath)}: ${match[0]}`),
        ...[...source.matchAll(/<Suspense\s+fallback=\{null\}>/g)]
          .map((match) => `${relative(projectRoot, filePath)}: ${match[0]}`),
      ];
    });

    expect(violations).toEqual([]);
  });
});
