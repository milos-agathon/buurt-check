import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const projectRoot = process.cwd();
const matchFirstRoot = join(projectRoot, 'src/components/match-first');
const matchSurfaceFiles = [
  join(projectRoot, 'src/components/match/MatchLanding.tsx'),
  join(projectRoot, 'src/components/match/MatchQuiz.tsx'),
  join(projectRoot, 'src/components/match/MatchMap.tsx'),
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
      'predictive probability',
      'highest predictive power',
      'perfect fit',
      'guaranteed outcome',
      'guaranteed outcomes',
    ];

    const violations = files.flatMap((filePath) => {
      const lower = read(filePath).toLowerCase();
      return forbidden
        .filter((phrase) => lower.includes(phrase))
        .map((phrase) => `${relative(projectRoot, filePath)}: ${phrase}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not expose developer placeholder terms in bundled translations', () => {
    const forbidden = ['survey shell', 'survey-shell'];
    const violations = i18nFiles.flatMap((filePath) => {
      const lower = read(filePath).toLowerCase();
      return forbidden
        .filter((phrase) => lower.includes(phrase))
        .map((phrase) => `${relative(projectRoot, filePath)}: ${phrase}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps legacy match-surface language labels and fallbacks behind translation keys', () => {
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
});
