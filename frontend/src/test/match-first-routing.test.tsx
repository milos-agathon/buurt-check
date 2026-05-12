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

it('adds survey intro and survey shell routes without breaking legacy match and Dossier routes', () => {
  expect(parseHashRoute('#/match/intro')).toMatchObject({ route: 'matchSurveyIntro' });
  expect(buildHashRoute({ route: 'matchSurveyIntro' })).toBe('#/match/intro');

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

it('parses match return context separately from checkout session recovery', () => {
  expect(
    parseHashRoute('#/address/0363010000123456?lookup=adr-123&match_return=%23%2Fmatch%2Fmap&match_session=match-123&match_neighborhood=BU0363AA01'),
  ).toMatchObject({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
    sessionId: undefined,
    matchReturn: {
      target: '#/match/map',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
    },
  });

  expect(buildHashRoute({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
    matchReturn: {
      target: '#/match/map',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
    },
  })).toBe('#/address/0363010000123456?lookup=adr-123&match_return=%23%2Fmatch%2Fmap&match_session=match-123&match_neighborhood=BU0363AA01');

  expect(parseHashRoute('#/address/0363010000123456?lookup=adr-123&report=report-123&session_id=cs_test_123&match_session=match-123')).toMatchObject({
    route: 'dossier',
    reportId: 'report-123',
    sessionId: 'cs_test_123',
    matchReturn: {
      target: '#/match/map',
      sessionId: 'match-123',
    },
  });
});
