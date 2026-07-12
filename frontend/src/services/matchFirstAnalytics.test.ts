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

it('records privacy-safe survey lifecycle events', () => {
  recordMatchFirstEvent('match_first_survey_question_shown', {
    locale: 'en',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'anchor_location',
    step: 4,
    total_steps: 11,
  });
  recordMatchFirstEvent('match_first_survey_answer_saved', {
    locale: 'en',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'anchor_location',
    answer_type: 'anchor',
    answer_count: 1,
  });
  recordMatchFirstEvent('match_first_survey_review_shown', {
    locale: 'nl',
    source: 'review',
    session_id: 'match-123',
    total_steps: 11,
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_first_survey_question_shown',
      locale: 'en',
      context: {
        locale: 'en',
        source: 'survey',
        session_id: 'match-123',
        question_id: 'anchor_location',
        step: 4,
        total_steps: 11,
      },
    },
    {
      event_name: 'match_first_survey_answer_saved',
      context: {
        question_id: 'anchor_location',
        answer_type: 'anchor',
        answer_count: 1,
      },
    },
    {
      event_name: 'match_first_survey_review_shown',
      locale: 'nl',
    },
  ]);
});

it('drops translated labels exact anchors and free text from survey analytics context', () => {
  recordMatchFirstEvent('match_first_survey_answer_saved', {
    locale: 'nl',
    source: 'survey',
    session_id: 'match-123',
    question_id: 'intent',
    answer_type: 'single',
    answer_label: 'Rustige buurt',
    anchor_label: 'Utrecht Centraal',
    free_text: 'I want a place close to my office',
    answer_value: 'buy',
  });

  expect(readStoredEvents()).toMatchObject([
    {
      event_name: 'match_first_survey_answer_saved',
      locale: 'nl',
      context: {
        locale: 'nl',
        source: 'survey',
        session_id: 'match-123',
        question_id: 'intent',
        answer_type: 'single',
      },
    },
  ]);
  expect(JSON.stringify(readStoredEvents())).not.toContain('Rustige buurt');
  expect(JSON.stringify(readStoredEvents())).not.toContain('Utrecht Centraal');
  expect(JSON.stringify(readStoredEvents())).not.toContain('buy');
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
