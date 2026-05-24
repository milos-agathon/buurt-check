import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { useState, type ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import SurveyShell, { type MatchFirstSurveyAnswers } from '../components/match-first/SurveyShell';
import SurveyReview from '../components/match-first/SurveyReview';
import { readMatchSessionSnapshot } from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  await i18n.changeLanguage('en');
  vi.restoreAllMocks();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
    new Response(JSON.stringify({
      session_id: 'match-survey-test',
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

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function SurveyHarness({
  sessionId = 'match-survey-test',
  initialStep = 1,
  onReview = vi.fn(),
}: {
  sessionId?: string;
  initialStep?: number;
  onReview?: (answers: MatchFirstSurveyAnswers) => void;
}) {
  const [step, setStep] = useState(initialStep);
  return (
    <SurveyShell
      sessionId={sessionId}
      step={step}
      onStepChange={setStep}
      onBack={() => {}}
      onReview={onReview}
    />
  );
}

async function answerFirstQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Both' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

async function completeSurvey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Both' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.clear(screen.getByRole('spinbutton', { name: 'Minimum budget' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Minimum budget' }), '450000');
  await user.clear(screen.getByRole('spinbutton', { name: 'Maximum budget' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum budget' }), '650000');
  await user.clear(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Maximum monthly rent' }), '2500');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('radio', { name: 'Young family' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.type(screen.getByRole('textbox', { name: 'City or station' }), 'Utrecht Centraal');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('slider', { name: 'Maximum travel time' }));
  await user.keyboard('{ArrowRight}');
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('checkbox', { name: 'Green space' }));
  await user.click(screen.getByRole('checkbox', { name: 'Calm streets' }));
  await user.click(screen.getByRole('checkbox', { name: 'Public transport' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('checkbox', { name: 'Parks nearby' }));
  await user.click(screen.getByRole('checkbox', { name: 'Good transit' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('checkbox', { name: 'Busy nightlife' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('checkbox', { name: 'Row house' }));
  await user.click(screen.getByRole('checkbox', { name: 'Family house' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('radio', { name: 'Quiet city' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));

  await user.click(screen.getByRole('radio', { name: 'English' }));
}

it('shows exactly one survey question with progress and a back button only after question 1', async () => {
  const user = userEvent.setup();
  renderWithI18n(<SurveyHarness />);

  expect(screen.getByRole('progressbar', { name: 'Question 1 of 11' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

  await answerFirstQuestion(user);

  expect(screen.getByRole('progressbar', { name: 'Question 2 of 11' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'What budget range should we respect?' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
});

it('blocks required-question navigation with localized accessible validation', async () => {
  const user = userEvent.setup();
  renderWithI18n(<SurveyHarness />);

  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Choose an answer to continue.');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
});

it('saves answers after every step and restores them after a refresh', async () => {
  const user = userEvent.setup();
  const firstRender = renderWithI18n(<SurveyHarness sessionId="match-persist" />);

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  expect(readMatchSessionSnapshot('match-persist')?.answers).toMatchObject({ intent: 'buy' });

  firstRender.unmount();
  renderWithI18n(<SurveyHarness sessionId="match-persist" />);

  expect(screen.getByRole('radio', { name: 'Buy' })).toBeChecked();
});

it('preserves stable answer values when language changes', async () => {
  const user = userEvent.setup();
  renderWithI18n(<SurveyHarness sessionId="match-language" />);

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  await act(async () => {
    await i18n.changeLanguage('nl');
  });

  expect(await screen.findByRole('radio', { name: 'Kopen' })).toBeChecked();
  expect(readMatchSessionSnapshot('match-language')?.answers).toMatchObject({ intent: 'buy' });
});

it('reaches review only after the final survey question and does not start matching early', async () => {
  const user = userEvent.setup();
  const onReview = vi.fn();
  renderWithI18n(<SurveyHarness sessionId="match-complete" onReview={onReview} />);

  await completeSurvey(user);
  expect(onReview).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Review answers' }));

  await waitFor(() => {
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'both',
      household_type: 'family_young_child',
      language: 'en',
    }));
  });
  expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/run'), expect.anything());
}, 10000);

it('renders a concise review from persisted raw answers and starts only from the final CTA', async () => {
  const user = userEvent.setup();
  const onComplete = vi.fn();
  renderWithI18n(<SurveyHarness sessionId="match-review" />);
  await completeSurvey(user);

  renderWithI18n(
    <SurveyReview
      sessionId="match-review"
      onBack={() => {}}
      onComplete={onComplete}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Ready to find your best neighborhoods?' })).toBeInTheDocument();
  expect(screen.getByText('Both')).toBeInTheDocument();
  expect(screen.getByText('Utrecht Centraal')).toBeInTheDocument();
  expect(onComplete).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Show my matches' }));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    intent: 'both',
    lifestyle_priorities: ['green_access', 'calmness', 'public_transport'],
  }));
}, 10000);
