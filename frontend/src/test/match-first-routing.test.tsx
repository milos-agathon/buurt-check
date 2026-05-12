import { parseHashRoute, parseRoute, buildHashRoute } from '../routing/hashRoutes';

it('routes root and #/match to the match-first landing while preserving checkout recovery', () => {
  expect(parseRoute('/', '')).toMatchObject({ route: 'matchLanding' });
  expect(parseHashRoute('#/match')).toMatchObject({ route: 'matchLanding' });

  expect(parseRoute('/', 'report=report-123&session_id=cs_test_123')).toMatchObject({
    route: 'dossier',
    reportId: 'report-123',
    sessionId: 'cs_test_123',
  });
});

it('adds a survey shell route without breaking legacy match and Dossier routes', () => {
  expect(parseHashRoute('#/match/survey')).toMatchObject({ route: 'matchSurvey' });
  expect(buildHashRoute({ route: 'matchSurvey' })).toBe('#/match/survey');

  expect(parseHashRoute('#/search')).toMatchObject({ route: 'search' });
  expect(parseHashRoute('#/address/0363010000123456?lookup=adr-123')).toMatchObject({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
  });
  expect(parseHashRoute('#/briefing?lookup=adr-123')).toMatchObject({
    route: 'dossier',
    lookupId: 'adr-123',
  });
  expect(parseHashRoute('#/shared/share-token')).toMatchObject({
    route: 'shared',
    sharedMode: 'briefing',
    shareToken: 'share-token',
  });
  expect(parseHashRoute('#/shared-pack/pack-token')).toMatchObject({
    route: 'shared',
    sharedMode: 'pack',
    shareToken: 'pack-token',
  });
  expect(parseHashRoute('#/pack/0363010000123456/report-123')).toMatchObject({
    route: 'pack',
    vboId: '0363010000123456',
    reportId: 'report-123',
  });
  expect(parseHashRoute('#/match/quiz')).toMatchObject({ route: 'matchQuiz' });
  expect(parseHashRoute('#/match/map')).toMatchObject({ route: 'matchMap' });
});
