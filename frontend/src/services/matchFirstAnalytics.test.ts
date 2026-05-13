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

it('returns the analytics event when localStorage writes fail', () => {
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    const event = recordMatchFirstEvent('match_first_search_link_clicked', {
      locale: 'en',
      source: 'landing',
    });

    expect(event).toMatchObject({
      event_name: 'match_first_search_link_clicked',
      locale: 'en',
      context: {
        locale: 'en',
        source: 'landing',
      },
    });
    expect(getStoredMatchFirstEvents()).toEqual([]);
  } finally {
    setItemSpy.mockRestore();
  }
});
