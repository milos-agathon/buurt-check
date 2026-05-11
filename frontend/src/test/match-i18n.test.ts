import en from '../i18n/en.json';
import nl from '../i18n/nl.json';

function getPath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

const requiredMatchKeys = [
  'match.landing.title',
  'match.landing.findCta',
  'match.landing.compareCta',
  'match.quiz.title',
  'match.quiz.journey.buy',
  'match.quiz.journey.rent',
  'match.quiz.journey.both',
  'match.quiz.fields.buyMax',
  'match.quiz.fields.rentMax',
  'match.quiz.household.family',
  'match.quiz.fields.anchor',
  'match.quiz.fields.commute',
  'match.quiz.fields.optionalAnchors',
  'match.quiz.mustHaves.green_access',
  'match.quiz.niceToHaves.train_nearby',
  'match.quiz.fields.language',
  'match.quiz.lifestyle.calmness',
  'match.quiz.lifestyle.green_space',
  'match.quiz.validation.journey',
  'match.warning.budget_max_missing',
  'match.warning.anchor_missing',
];

it('defines Dutch and English copy for the Phase 2 match landing and quiz', () => {
  for (const key of requiredMatchKeys) {
    expect(getPath(en, key), `Missing EN key ${key}`).toEqual(expect.any(String));
    expect(getPath(nl, key), `Missing NL key ${key}`).toEqual(expect.any(String));
  }
});
