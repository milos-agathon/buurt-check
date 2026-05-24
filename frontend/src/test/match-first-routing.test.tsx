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
  expect(parseHashRoute('#/match/session/match-123/intro')).toMatchObject({
    route: 'matchSurveyIntro',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchSurveyIntro', sessionId: 'match-123' })).toBe('#/match/session/match-123/intro');
  expect(parseHashRoute('#/match/session/match-123/question/1')).toMatchObject({
    route: 'matchSurvey',
    sessionId: 'match-123',
    questionStep: 1,
  });
  expect(parseHashRoute('#/match/session/match-123/question/11')).toMatchObject({
    route: 'matchSurvey',
    sessionId: 'match-123',
    questionStep: 11,
  });
  expect(buildHashRoute({ route: 'matchSurvey', sessionId: 'match-123', questionStep: 1 })).toBe('#/match/session/match-123/question/1');
  expect(parseHashRoute('#/match/session/match-123/additional-preferences')).toMatchObject({
    route: 'matchAdditionalPreferences',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchAdditionalPreferences', sessionId: 'match-123' })).toBe('#/match/session/match-123/additional-preferences');
  expect(parseHashRoute('#/match/session/match-123/review')).toMatchObject({
    route: 'matchReview',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchReview', sessionId: 'match-123' })).toBe('#/match/session/match-123/review');
  expect(parseHashRoute('#/match/session/match-123/run')).toMatchObject({
    route: 'matchRun',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchRun', sessionId: 'match-123' })).toBe('#/match/session/match-123/run');
  expect(parseHashRoute('#/match/session/match-123/success')).toMatchObject({
    route: 'matchSuccess',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchSuccess', sessionId: 'match-123' })).toBe('#/match/session/match-123/success');
  expect(parseHashRoute('#/match/session/match-123/results')).toMatchObject({
    route: 'matchResults',
    sessionId: 'match-123',
  });
  expect(buildHashRoute({ route: 'matchResults', sessionId: 'match-123' })).toBe('#/match/session/match-123/results');
  expect(parseHashRoute('#/match/session/match-123/neighborhood/BU0363AA01')).toMatchObject({
    route: 'matchNeighborhood',
    sessionId: 'match-123',
    neighborhoodId: 'BU0363AA01',
  });
  expect(buildHashRoute({
    route: 'matchNeighborhood',
    sessionId: 'match-123',
    neighborhoodId: 'BU0363AA01',
  })).toBe('#/match/session/match-123/neighborhood/BU0363AA01');

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
  expect(parseHashRoute('#/match/quiz')).toMatchObject({ route: 'matchSurvey' });
  expect(parseHashRoute('#/match/map')).toMatchObject({ route: 'matchMap' });
});

it('rejects invalid match survey question steps outside the Phase 2 bounds', () => {
  expect(parseHashRoute('#/match/session/match-123/question/nope')).toMatchObject({
    route: 'not_found',
    rawPath: '/match/session/match-123/question/nope',
  });
  expect(parseHashRoute('#/match/session/match-123/question/0')).toMatchObject({
    route: 'not_found',
    rawPath: '/match/session/match-123/question/0',
  });
  expect(parseHashRoute('#/match/session/match-123/question/2.5')).toMatchObject({
    route: 'not_found',
    rawPath: '/match/session/match-123/question/2.5',
  });
  expect(parseHashRoute('#/match/session/match-123/question/12')).toMatchObject({
    route: 'not_found',
    rawPath: '/match/session/match-123/question/12',
  });
});

it('parses match return context separately from checkout session recovery', () => {
  expect(
    parseHashRoute('#/address/0363010000123456?lookup=adr-123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22mobileMode%22%3A%22list%22%2C%22selectedResultId%22%3A%22result-2%22%2C%22selectedResultRank%22%3A2%2C%22language%22%3A%22nl%22%2C%22selectedHouseId%22%3A%22house-7%22%7D'),
  ).toMatchObject({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
    sessionId: undefined,
    matchReturn: {
      target: '#/match/session/match-123/neighborhood/BU0363AA01',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      selectedResultId: 'result-2',
      selectedResultRank: 2,
      language: 'nl',
      selectedHouseId: 'house-7',
    },
  });

  expect(buildHashRoute({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
    matchReturn: {
      target: '#/match/session/match-123/neighborhood/BU0363AA01',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      selectedResultId: 'result-2',
      selectedResultRank: 2,
      language: 'nl',
      selectedHouseId: 'house-7',
    },
  })).toBe('#/address/0363010000123456?lookup=adr-123&match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01&match_context=%7B%22mapCenter%22%3A%5B52.36%2C4.9%5D%2C%22mapZoom%22%3A13%2C%22listScroll%22%3A240%2C%22mobileMode%22%3A%22list%22%2C%22selectedResultId%22%3A%22result-2%22%2C%22selectedResultRank%22%3A2%2C%22language%22%3A%22nl%22%2C%22selectedHouseId%22%3A%22house-7%22%7D');

  expect(parseHashRoute('#/address/0363010000123456?lookup=adr-123&report=report-123&session_id=cs_test_123&match_session=match-123')).toMatchObject({
    route: 'dossier',
    reportId: 'report-123',
    sessionId: 'cs_test_123',
    matchReturn: {
      target: '#/match/session/match-123/results',
      sessionId: 'match-123',
    },
  });
});

it('canonicalizes Dossier match returns to map routes from stable session params', () => {
  expect(
    parseHashRoute(
      '#/address/0363010000123456?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Freview&match_session=match-123',
    ),
  ).toMatchObject({
    route: 'dossier',
    matchReturn: {
      target: '#/match/session/match-123/results',
      sessionId: 'match-123',
    },
  });

  expect(
    parseHashRoute(
      '#/address/0363010000123456?match_return=%23%2Fmatch%2Freport&match_session=match-123&match_neighborhood=BU0363AA01',
    ),
  ).toMatchObject({
    route: 'dossier',
    matchReturn: {
      target: '#/match/session/match-123/neighborhood/BU0363AA01',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
    },
  });

  expect(buildHashRoute({
    route: 'dossier',
    vboId: '0363010000123456',
    matchReturn: {
      target: '#/match/session/match-123/review',
      sessionId: 'match-123',
    },
  })).toBe('#/address/0363010000123456?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fresults&match_session=match-123');
});

it('preserves Phase 7 Dossier bridge route context without reusing checkout session_id', () => {
  const route = buildHashRoute({
    route: 'dossier',
    vboId: '0363010000123456',
    lookupId: 'adr-123',
    matchReturn: {
      target: '#/match/session/match-123/neighborhood/BU0363AA01',
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
      jobId: 'match_job_123',
      resultSetId: 'mrs_123',
      preferenceVectorVersion: 'pv_v1',
      source: 'match_map',
      addressId: '0363010000123456',
      buildingId: 'bldg_BU0363AA01_001',
      returnUrl: '#/match/session/match-123/neighborhood/BU0363AA01',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      selectedResultId: 'rec_1',
      selectedResultRank: 1,
      language: 'nl',
      selectedHouseId: 'bldg_BU0363AA01_001',
    },
  });
  const params = new URLSearchParams(route.split('?')[1]);
  const context = JSON.parse(params.get('match_context') ?? '{}') as Record<string, unknown>;

  expect(route).toContain('#/address/0363010000123456?');
  expect(params.get('lookup')).toBe('adr-123');
  expect(params.get('session_id')).toBeNull();
  expect(params.get('match_session')).toBe('match-123');
  expect(context).toMatchObject({
    jobId: 'match_job_123',
    resultSetId: 'mrs_123',
    preferenceVectorVersion: 'pv_v1',
    source: 'match_map',
    addressId: '0363010000123456',
    buildingId: 'bldg_BU0363AA01_001',
    returnUrl: '#/match/session/match-123/neighborhood/BU0363AA01',
  });
  expect(parseHashRoute(route)).toMatchObject({
    route: 'dossier',
    sessionId: undefined,
    matchReturn: {
      sessionId: 'match-123',
      neighborhoodId: 'BU0363AA01',
      jobId: 'match_job_123',
      resultSetId: 'mrs_123',
      preferenceVectorVersion: 'pv_v1',
      source: 'match_map',
      addressId: '0363010000123456',
      buildingId: 'bldg_BU0363AA01_001',
      returnUrl: '#/match/session/match-123/neighborhood/BU0363AA01',
    },
  });
});

it('routes malformed match return context to not found instead of storing unsafe values', () => {
  expect(parseHashRoute(
    '#/address/0363010000123456?match_session=match-123&match_context=%7B%22mapCenter%22%3A%5B%22NaN%22%2C%22Infinity%22%5D%2C%22mapZoom%22%3A13%7D',
  )).toMatchObject({
    route: 'not_found',
    rawPath: '/address/0363010000123456',
  });

  expect(parseHashRoute(
    '#/address/0363010000123456?match_session=match-123&match_context=%7B%22mapZoom%22%3A%22nope%22%7D',
  )).toMatchObject({
    route: 'not_found',
    rawPath: '/address/0363010000123456',
  });

  expect(parseHashRoute(
    '#/address/0363010000123456?match_session=match-123&match_context=%7B%22listScroll%22%3A-1%7D',
  )).toMatchObject({
    route: 'not_found',
    rawPath: '/address/0363010000123456',
  });

  expect(parseHashRoute(
    '#/address/0363010000123456?match_session=match-123&match_context=%7B%22mobileMode%22%3A%22grid%22%7D',
  )).toMatchObject({
    route: 'not_found',
    rawPath: '/address/0363010000123456',
  });

  expect(parseHashRoute(
    '#/address/0363010000123456?match_session=match-123&match_context=%7B%22selectedResultRank%22%3A0%7D',
  )).toMatchObject({
    route: 'not_found',
    rawPath: '/address/0363010000123456',
  });
});
