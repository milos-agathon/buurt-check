import {
  clearMatchSessionSnapshot,
  readActiveMatchSessionSnapshot,
  readMatchResultsMapState,
  readMatchSessionSnapshot,
  saveMatchReturnContextAsResultsMapState,
  saveMatchSessionSnapshot,
} from './matchSessionStorage';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

it('mirrors active session answers, step, locale, version, and stale-result state in sessionStorage', () => {
  saveMatchSessionSnapshot('match-storage', {
    sessionId: 'match-storage',
    locale: 'nl',
    step: 3,
    answerVersion: 2,
    staleResults: true,
    answers: {
      intent: 'buy',
      household_type: 'family_young_child',
    },
  });

  expect(readMatchSessionSnapshot('match-storage')).toMatchObject({
    sessionId: 'match-storage',
    locale: 'nl',
    step: 3,
    answerVersion: 2,
    staleResults: true,
    answers: {
      intent: 'buy',
      household_type: 'family_young_child',
    },
  });
  expect(readActiveMatchSessionSnapshot()).toMatchObject({
    sessionId: 'match-storage',
    answers: { intent: 'buy' },
  });
});

it('ignores corrupt persisted data instead of throwing', () => {
  sessionStorage.setItem('buurt-check-match-first-session:broken', '{');

  expect(readMatchSessionSnapshot('broken')).toBeNull();
});

it('can clear one active session snapshot without affecting other sessions', () => {
  saveMatchSessionSnapshot('match-one', {
    sessionId: 'match-one',
    locale: 'en',
    step: 1,
    answerVersion: 1,
    staleResults: false,
    answers: { intent: 'rent' },
  });
  saveMatchSessionSnapshot('match-two', {
    sessionId: 'match-two',
    locale: 'en',
    step: 1,
    answerVersion: 1,
    staleResults: false,
    answers: { intent: 'buy' },
  });

  clearMatchSessionSnapshot('match-two');

  expect(readMatchSessionSnapshot('match-two')).toBeNull();
  expect(readMatchSessionSnapshot('match-one')).toMatchObject({
    answers: { intent: 'rent' },
  });
});

it('stores a Dossier match-return context as restorable results map state', () => {
  saveMatchReturnContextAsResultsMapState({
    sessionId: 'match-return',
    jobId: 'match_job_return',
    resultSetId: 'mrs_return',
    preferenceVectorVersion: 'pv_return',
    selectedResultId: 'rec_return',
    neighborhoodId: 'BU0363AA01',
    selectedResultRank: 2,
    selectedHouseId: 'bldg_return_001',
    mapCenter: [52.36, 4.9],
    mapZoom: 13,
    listScroll: 240,
    mobileMode: 'list',
    language: 'nl',
  });

  expect(readMatchResultsMapState('match-return')).toMatchObject({
    sessionId: 'match-return',
    jobId: 'match_job_return',
    resultSetId: 'mrs_return',
    preferenceVectorVersion: 'pv_return',
    selectedRecommendationId: 'rec_return',
    selectedNeighborhoodId: 'BU0363AA01',
    selectedResultRank: 2,
    selectedHouseId: 'bldg_return_001',
    mapCenter: [52.36, 4.9],
    mapZoom: 13,
    listScroll: 240,
    mobileMode: 'list',
    locale: 'nl',
  });
});

it('ignores incomplete Dossier return context instead of corrupting map state', () => {
  saveMatchReturnContextAsResultsMapState({
    sessionId: 'match-return',
    resultSetId: 'mrs_return',
    preferenceVectorVersion: 'pv_return',
    mapCenter: [52.36, 4.9],
    mapZoom: 13,
  });

  expect(readMatchResultsMapState('match-return')).toBeNull();
});
