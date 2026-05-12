import {
  MATCH_FIRST_LANDING_EVENTS,
  getStoredMatchFirstEvents,
  recordMatchFirstEvent,
} from './matchFirstAnalytics';

beforeEach(() => {
  localStorage.clear();
});

it('records stable match-first landing event names without translated labels', () => {
  expect(MATCH_FIRST_LANDING_EVENTS).toEqual([
    'match_first_landing_shown',
    'match_first_cta_clicked',
    'match_first_search_link_clicked',
  ]);

  recordMatchFirstEvent('match_first_cta_clicked', {
    locale: 'nl',
    source: 'landing',
    route: '#/match/survey',
  });

  expect(getStoredMatchFirstEvents()).toMatchObject([
    {
      event_name: 'match_first_cta_clicked',
      locale: 'nl',
      context: {
        locale: 'nl',
        source: 'landing',
        route: '#/match/survey',
      },
    },
  ]);
});
