import {
  clearMatchSessionSnapshot,
  readActiveMatchSessionSnapshot,
  readMatchSessionSnapshot,
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
