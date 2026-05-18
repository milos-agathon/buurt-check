import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import SurveyShell from './SurveyShell';
import {
  readMatchSessionSnapshot,
  saveMatchSessionSnapshot,
} from '../../services/matchSessionStorage';
import type { MatchFirstSurveyAnswers } from '../../types/matchFirst';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

const completeAnswers: MatchFirstSurveyAnswers = {
  intent: 'rent',
  budget: { rent_max: 220000 },
  household_type: 'couple',
  anchor_location: { type: 'city', label: 'Rotterdam Centraal' },
  commute: { max_minutes: 45 },
  lifestyle_priorities: ['green_access', 'public_transport'],
  must_haves: ['good_transit'],
  dealbreakers: ['high_noise'],
  housing_types: ['apartment'],
  area_character: 'quiet_city',
  language: 'en',
};

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
    new Response(JSON.stringify({
      session_id: 'match-sync-ok',
      answer_version: 1,
      is_complete: false,
      validation: {},
      stale_results: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function SurveyHarness(props: Partial<ComponentProps<typeof SurveyShell>> = {}) {
  const [step, setStep] = useState(props.step ?? 1);
  return (
    <SurveyShell
      {...props}
      step={step}
      onStepChange={(nextStep) => {
        setStep(nextStep);
        props.onStepChange?.(nextStep);
      }}
    />
  );
}

function renderSurvey(props: Partial<ComponentProps<typeof SurveyShell>> = {}) {
  const onReview = props.onReview ?? vi.fn();
  const onBack = props.onBack ?? vi.fn();
  const rendered = render(
    <I18nextProvider i18n={i18n}>
      <SurveyHarness
        onReview={onReview}
        onBack={onBack}
        {...props}
      />
    </I18nextProvider>,
  );
  return { ...rendered, onReview, onBack };
}

function readStoredAnalytics(): Array<{ event_name: string; context?: Record<string, unknown> }> {
  return JSON.parse(localStorage.getItem('buurt-check-match-first-analytics') ?? '[]') as Array<{
    event_name: string;
    context?: Record<string, unknown>;
  }>;
}

it('renders exactly one question with validation before advancing', async () => {
  const user = userEvent.setup();
  renderSurvey();

  expect(screen.getByRole('progressbar', { name: 'Question 1 of 11' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Next' }));
  const validation = screen.getByRole('alert');
  expect(validation).toHaveTextContent('Choose an answer to continue.');

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  expect(screen.getByRole('radio', { name: 'Buy' })).toBeChecked();

  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('progressbar', { name: 'Question 2 of 11' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What budget range should we respect?');
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
});

it('moves focus to the validation message when required answer validation fails', async () => {
  const user = userEvent.setup();
  renderSurvey();

  await user.click(screen.getByRole('button', { name: 'Next' }));

  await expect(screen.findByRole('alert')).resolves.toHaveFocus();
});

it('moves focus to the active question heading after step changes', async () => {
  const user = userEvent.setup();
  renderSurvey();

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: 'What budget range should we respect?' })).toHaveFocus();
  });

  await user.click(screen.getByRole('button', { name: 'Back' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: 'Are you looking to buy, rent, or both?' })).toHaveFocus();
  });
});

it('persists answers after selection and scopes them to the active match session', async () => {
  const user = userEvent.setup();
  const first = renderSurvey({ sessionId: 'match-one' });

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  expect(readMatchSessionSnapshot('match-one')?.answers).toMatchObject({ intent: 'buy' });
  first.unmount();

  renderSurvey({ sessionId: 'match-two' });
  expect(screen.getByRole('radio', { name: 'Buy' })).not.toBeChecked();

  await user.click(screen.getByRole('radio', { name: 'Rent' }));
  expect(readMatchSessionSnapshot('match-two')?.answers).toMatchObject({ intent: 'rent' });
  expect(readMatchSessionSnapshot('match-one')?.answers).toMatchObject({ intent: 'buy' });
});

it('records answer-saved analytics only after backend answer persistence succeeds', async () => {
  const user = userEvent.setup();
  let resolveAnswerPatch: ((response: Response) => void) | undefined;
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/answers')) {
      return new Promise<Response>((resolve) => {
        resolveAnswerPatch = resolve;
      });
    }
    return new Response(JSON.stringify({ accepted: true, duplicate: false }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  renderSurvey({ sessionId: 'match-analytics-save' });

  await user.click(screen.getByRole('radio', { name: 'Buy' }));

  expect(readStoredAnalytics().some((event) => event.event_name === 'match_survey_answer_saved')).toBe(false);

  resolveAnswerPatch?.(new Response(JSON.stringify({
    session_id: 'match-analytics-save',
    answer_version: 1,
    is_complete: false,
    validation: {},
    stale_results: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  await waitFor(() => {
    expect(readStoredAnalytics()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_name: 'match_survey_answer_saved',
        context: expect.objectContaining({
          question_id: 'intent',
          step: 1,
          total_steps: 11,
          answer_type: 'single',
          answer_count: 1,
        }),
      }),
    ]));
  });
});

it('records answer-save-failed analytics without recording saved when backend persistence fails', async () => {
  const user = userEvent.setup();
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/answers')) {
      throw new Error('offline');
    }
    return new Response(JSON.stringify({ accepted: true, duplicate: false }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  renderSurvey({ sessionId: 'match-analytics-fail' });

  await user.click(screen.getByRole('radio', { name: 'Rent' }));

  await waitFor(() => {
    expect(readStoredAnalytics()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_name: 'match_survey_answer_save_failed',
        context: expect.objectContaining({
          question_id: 'intent',
          step: 1,
          total_steps: 11,
          error_code: 'match.survey.answer_save_failed',
        }),
      }),
    ]));
  });
  expect(readStoredAnalytics().some((event) => event.event_name === 'match_survey_answer_saved')).toBe(false);
});

it('captures a rent-only budget as monthly rent max', async () => {
  const user = userEvent.setup();
  renderSurvey({ sessionId: 'match-rent-budget' });

  await user.click(screen.getByRole('radio', { name: 'Rent' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.queryByRole('spinbutton', { name: 'Minimum budget' })).not.toBeInTheDocument();
  await user.clear(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }), '2200');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Who are we matching for?');
  expect(readMatchSessionSnapshot('match-rent-budget')?.answers.budget).toMatchObject({
    rent_max: 220000,
  });
});

it('prunes stale budget fields when the user changes intent', async () => {
  const user = userEvent.setup();
  renderSurvey({ sessionId: 'match-budget-switch' });

  await user.click(screen.getByRole('radio', { name: 'Rent' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.clear(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }), '2200');
  await user.click(screen.getByRole('button', { name: 'Back' }));

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Minimum budget' }), '350000');
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum budget' }), '500000');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  const storedBudget = readMatchSessionSnapshot('match-budget-switch')?.answers.budget;
  expect(storedBudget).toEqual({ buy_min: 35000000, buy_max: 50000000 });
});

it('requires both buy and rent budget fields when the intent is both', async () => {
  const user = userEvent.setup();
  renderSurvey({ sessionId: 'match-both-budget' });

  await user.click(screen.getByRole('radio', { name: 'Both' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Minimum budget' }), '350000');
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum budget' }), '500000');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Choose an answer to continue.');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What budget range should we respect?');

  await user.type(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }), '2200');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Who are we matching for?');
  expect(readMatchSessionSnapshot('match-both-budget')?.answers.budget).toEqual({
    buy_min: 35000000,
    buy_max: 50000000,
    rent_max: 220000,
  });
});

it('restores saved answers on remount for the same active session', async () => {
  const user = userEvent.setup();
  const first = renderSurvey({ sessionId: 'match-restore' });

  await user.click(screen.getByRole('radio', { name: 'Both' }));
  first.unmount();

  renderSurvey({ sessionId: 'match-restore' });
  expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();
});

it('keeps the current answer usable when sessionStorage writes fail', async () => {
  const user = userEvent.setup();
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    renderSurvey({ sessionId: 'match-storage-fail' });

    await user.click(screen.getByRole('radio', { name: 'Rent' }));
    expect(screen.getByRole('radio', { name: 'Rent' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What budget range should we respect?');
  } finally {
    setItemSpy.mockRestore();
  }
});

it('keeps the user on the current question when backend answer sync fails', async () => {
  const user = userEvent.setup();
  const onStepChange = vi.fn();
  fetchSpy.mockRejectedValue(new Error('offline'));
  renderSurvey({ sessionId: 'match-sync-fail', onStepChange });

  await user.click(screen.getByRole('radio', { name: 'Rent' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We could not save your latest answer yet. Check your connection and try again.',
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');
  expect(onStepChange).not.toHaveBeenCalled();
});

it('surfaces stable backend warning codes when answer sync is rejected', async () => {
  const user = userEvent.setup();
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({
    detail: 'match.warning.invalid_answer_value',
  }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  }));
  renderSurvey({ sessionId: 'match-sync-rejected' });

  await user.click(screen.getByRole('radio', { name: 'Rent' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'That answer is not supported anymore. Choose another answer.',
  );
});

it('does not open review when the final backend answer sync fails', async () => {
  const user = userEvent.setup();
  const onReview = vi.fn();
  fetchSpy.mockRejectedValue(new Error('offline'));
  saveMatchSessionSnapshot('match-final-sync-fail', {
    sessionId: 'match-final-sync-fail',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: completeAnswers,
  });

  renderSurvey({ sessionId: 'match-final-sync-fail', step: 11, onReview });
  await user.click(screen.getByRole('button', { name: 'Review answers' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We could not save your latest answer yet. Check your connection and try again.',
  );
  expect(onReview).not.toHaveBeenCalled();
});
