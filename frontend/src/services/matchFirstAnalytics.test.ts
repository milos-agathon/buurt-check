import { recordMatchFirstEvent } from './matchFirstAnalytics';

const storageKey = 'buurt-check-match-first-analytics';

function readStoredEvents(): unknown[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown[];
}

beforeEach(() => {
  localStorage.clear();
});

it('records stable match-first landing event names without translated labels', () => {
  recordMatchFirstEvent('match_first_cta_clicked', {
    locale: 'nl',
    source: 'landing',
    route: '#/match/survey',
  });

  expect(readStoredEvents()).toMatchObject([
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
    expect(readStoredEvents()).toEqual([]);
  } finally {
    setItemSpy.mockRestore();
  }
});
