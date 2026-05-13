import en from '../i18n/en.json';
import nl from '../i18n/nl.json';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function getPath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

const requiredMatchKeys = [
  'matchFirst.landing.language',
  'matchFirst.landing.eyebrow',
  'matchFirst.landing.title',
  'matchFirst.landing.body',
  'matchFirst.landing.cta',
  'matchFirst.landing.addressLink',
  'matchFirst.common.back',
  'matchFirst.common.backToSurvey',
  'matchFirst.common.startOver',
  'matchFirst.routes.landing',
  'matchFirst.routes.intro',
  'matchFirst.routes.survey',
  'matchFirst.routes.review',
  'matchFirst.routes.run',
  'matchFirst.routes.success',
  'matchFirst.routes.results',
  'matchFirst.routes.neighborhood',
  'matchFirst.intro.eyebrow',
  'matchFirst.intro.title',
  'matchFirst.intro.body',
  'matchFirst.intro.cta',
  'matchFirst.survey.progressLabel',
  'matchFirst.survey.questionEyebrow',
  'matchFirst.survey.intentQuestion',
  'matchFirst.survey.intent.buy',
  'matchFirst.survey.intent.rent',
  'matchFirst.survey.intent.both',
  'matchFirst.survey.validationRequired',
  'matchFirst.survey.review',
  'matchFirst.survey.back',
  'matchFirst.review.eyebrow',
  'matchFirst.review.title',
  'matchFirst.review.body',
  'matchFirst.review.answerLabel',
  'matchFirst.review.showMatches',
  'matchFirst.review.missingAnswer',
  'matchFirst.progress.eyebrow',
  'matchFirst.progress.title',
  'matchFirst.progress.placeholder',
  'matchFirst.progress.honesty',
  'matchFirst.progress.backToSurvey',
  'matchFirst.recovery.eyebrow',
  'matchFirst.recovery.title',
  'matchFirst.recovery.body',
  'matchFirst.recovery.cta',
  'matchFirst.results.eyebrow',
  'matchFirst.results.unavailableTitle',
  'matchFirst.results.unavailableBody',
  'matchFirst.results.runRequired',
  'matchFirst.results.backToSurvey',
  'matchFirst.failure.noStrongMatches',
  'matchFirst.failure.slowBackend',
  'matchFirst.failure.failedBackend',
  'matchFirst.failure.completedWithFallback',
  'matchFirst.failure.noReliableAddress',
  'matchFirst.failure.noResults',
  'matchFirst.failure.missing3d',
  'match.quiz.journey.buy',
  'match.quiz.journey.rent',
  'match.quiz.journey.both',
  'match.warning.budget_max_missing',
  'match.warning.anchor_missing',
  'match.listings.title',
  'match.listings.mockLabel',
  'match.alerts.title',
  'match.alerts.create',
  'match.saved.title',
  'match.share.title',
  'match.share.exportPdf',
  'match.recommendations.title',
  'match.admin.title',
  'match.admin.dataFreshness',
];

it('defines Dutch and English copy for the Phase 2 match landing and quiz', () => {
  for (const key of requiredMatchKeys) {
    expect(getPath(en, key), `Missing EN key ${key}`).toEqual(expect.any(String));
    expect(getPath(nl, key), `Missing NL key ${key}`).toEqual(expect.any(String));
  }
});

it('keeps admin dashboard user-facing copy in i18n resources', async () => {
  const source = await readFile(
    join(process.cwd(), 'src/components/match/MatchAdminDashboard.tsx'),
    'utf8',
  );

  expect(source).not.toContain('defaultValue');
  expect(getPath(en, 'match.admin.title')).toEqual(expect.any(String));
  expect(getPath(nl, 'match.admin.title')).toEqual(expect.any(String));
});
