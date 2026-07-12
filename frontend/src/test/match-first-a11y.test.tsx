import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import { useState, type ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import App from '../App';
import HeroMapBackground from '../components/match-first/HeroMapBackground';
import MatchFirstLanding from '../components/match-first/MatchFirstLanding';
import MultiSelectQuestion from '../components/match-first/MultiSelectQuestion';
import SurveyIntro from '../components/match-first/SurveyIntro';
import SurveyReview from '../components/match-first/SurveyReview';
import SurveyShell, { type MatchFirstSurveyAnswers } from '../components/match-first/SurveyShell';
import { saveMatchSessionSnapshot } from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-test-reduced-motion');
});

function renderWithI18n(ui: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      {ui}
    </I18nextProvider>,
  );
}

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  const severe = results.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
}

function MatchFirstKeyboardHarness() {
  const [stage, setStage] = useState<'landing' | 'intro' | 'survey' | 'run'>('landing');
  const [step, setStep] = useState(1);
  const [answer, setAnswer] = useState<MatchFirstSurveyAnswers | null>(null);

  if (stage === 'intro') {
    return <SurveyIntro onStartSurvey={() => setStage('survey')} />;
  }
  if (stage === 'survey') {
    return (
      <SurveyShell
        step={step}
        onStepChange={setStep}
        onBack={() => setStage('intro')}
        onReview={(answers) => {
          setAnswer(answers);
          setStage('run');
        }}
      />
    );
  }
  if (stage === 'run') {
    return <p role="status">{answer?.intent}</p>;
  }
  return <MatchFirstLanding onStartMatch={() => setStage('intro')} onSearchAddress={() => {}} />;
}

it('match-first landing has no serious accessibility violations', async () => {
  const { container } = renderWithI18n(
    <MatchFirstLanding onStartMatch={() => {}} onSearchAddress={() => {}} />,
  );

  await expectNoSeriousA11yViolations(container);
});

it('survey intro has no serious accessibility violations and exposes one action', async () => {
  const { container } = renderWithI18n(<SurveyIntro onStartSurvey={() => {}} />);

  expect(screen.getByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Start the match' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  await expectNoSeriousA11yViolations(container);
});

it('survey validation state has no serious accessibility violations', async () => {
  const user = userEvent.setup();
  const { container } = renderWithI18n(<SurveyShell onBack={() => {}} onReview={() => {}} />);

  await user.click(screen.getByRole('button', { name: 'Next' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Choose an answer to continue.');
  await expectNoSeriousA11yViolations(container);
});

it('multi-select maximum state exposes an accessible localized explanation', async () => {
  const { container } = renderWithI18n(
    <MultiSelectQuestion
      questionId="lifestyle_priorities"
      legend="Which daily-life priorities matter most?"
      maxSelections={3}
      value={['green_access', 'calmness', 'public_transport']}
      options={[
        { value: 'green_access', labelKey: 'matchFirst.survey.answers.lifestyle.greenAccess' },
        { value: 'calmness', labelKey: 'matchFirst.survey.answers.lifestyle.calmness' },
        { value: 'public_transport', labelKey: 'matchFirst.survey.answers.lifestyle.publicTransport' },
        { value: 'schools_childcare', labelKey: 'matchFirst.survey.answers.lifestyle.schoolsChildcare' },
      ]}
      onChange={() => {}}
    />,
  );

  expect(screen.getByText('Maximum 3 selected. Remove one to choose another.')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Schools and childcare' })).toBeDisabled();
  await expectNoSeriousA11yViolations(container);
});

it('review missing-answer state has no serious accessibility violations', async () => {
  const { container } = renderWithI18n(<SurveyReview onBack={() => {}} onComplete={() => {}} />);

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey questions before reviewing your match.');
  await expectNoSeriousA11yViolations(container);
});

it.each([
  ['run', '#/match/session/match-a11y/run', 'Your match map is not ready'],
  ['success', '#/match/session/match-a11y/success', 'Match status unavailable'],
  ['results', '#/match/session/match-a11y/results', 'Results unavailable'],
  ['neighborhood', '#/match/session/match-a11y/neighborhood/BU0363AA01', 'Results unavailable'],
])('direct %s unavailable state has no serious accessibility violations', async (_label, hash, heading) => {
  window.location.hash = hash;
  const { container } = renderWithI18n(<App />);

  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  await expectNoSeriousA11yViolations(container);
});

it('Dossier address-unavailable recovery and back-to-map state are rendered accessibly', async () => {
  window.location.hash = '#/address/0363100012345678?match_return=%23%2Fmatch%2Fsession%2Fmatch-123%2Fneighborhood%2FBU0363AA01&match_session=match-123&match_neighborhood=BU0363AA01';
  const user = userEvent.setup();
  const { container } = renderWithI18n(<App />);

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Address unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose nearby address' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search manually' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to match map' })).toBeInTheDocument();
  });
  await expectNoSeriousA11yViolations(container);

  await user.click(screen.getByRole('button', { name: 'Back to match map' }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Selected neighborhood context' })).toBeInTheDocument();
  });
  await expectNoSeriousA11yViolations(container);
});

it('supports keyboard progress from landing to intro and through survey steps', async () => {
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchFirstKeyboardHarness />
    </I18nextProvider>,
  );

  screen.getByRole('button', { name: 'Find my dream neighborhood' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();

  screen.getByRole('button', { name: 'Start the match' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();

  screen.getByRole('radio', { name: 'Both' }).focus();
  await user.keyboard('[Space]');
  screen.getByRole('button', { name: 'Next' }).focus();
  await user.keyboard('{Enter}');

  expect(screen.getByRole('heading', { name: 'What budget range should we respect?' })).toBeInTheDocument();
  screen.getByRole('button', { name: 'Back' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'Are you looking to buy, rent, or both?' })).toBeInTheDocument();
});

it('completes the full survey with keyboard input only', async () => {
  const user = userEvent.setup();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchFirstKeyboardHarness />
    </I18nextProvider>,
  );

  const pressButton = async (name: string) => {
    screen.getByRole('button', { name }).focus();
    await user.keyboard('{Enter}');
  };
  const chooseRadio = async (name: string) => {
    screen.getByRole('radio', { name }).focus();
    await user.keyboard('[Space]');
  };
  const chooseCheckbox = async (name: string) => {
    screen.getByRole('checkbox', { name }).focus();
    await user.keyboard('[Space]');
  };
  const typeInto = async (role: 'spinbutton' | 'textbox', name: string, value: string) => {
    screen.getByRole(role, { name }).focus();
    await user.keyboard(value);
  };

  await pressButton('Find my dream neighborhood');
  await pressButton('Start the match');

  await chooseRadio('Both');
  await pressButton('Next');

  await typeInto('spinbutton', 'Minimum budget', '450000');
  await typeInto('spinbutton', 'Maximum budget', '650000');
  await typeInto('spinbutton', 'Maximum monthly rent', '2500');
  await pressButton('Next');

  await chooseRadio('Young family');
  await pressButton('Next');

  await typeInto('textbox', 'City or station', 'Utrecht Centraal');
  await pressButton('Next');

  screen.getByRole('slider', { name: 'Maximum travel time' }).focus();
  await user.keyboard('{ArrowRight}');
  await pressButton('Next');

  await chooseCheckbox('Green space');
  await chooseCheckbox('Calm streets');
  await chooseCheckbox('Public transport');
  await pressButton('Next');

  await chooseCheckbox('Parks nearby');
  await chooseCheckbox('Good transit');
  await pressButton('Next');

  await chooseCheckbox('Busy nightlife');
  await pressButton('Next');

  await chooseCheckbox('Row house');
  await chooseCheckbox('Family house');
  await pressButton('Next');

  await chooseRadio('Quiet city');
  await pressButton('Next');

  await chooseRadio('English');
  await pressButton('Review answers');

  expect(await screen.findByRole('status')).toHaveTextContent('both');
});

it('review with complete persisted answers has no serious accessibility violations', async () => {
  saveMatchSessionSnapshot('match-a11y-review', {
    sessionId: 'match-a11y-review',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: {
      intent: 'both',
      budget: { buy_min: 45000000, buy_max: 65000000, rent_max: 250000 },
      household_type: 'family_young_child',
      anchor_location: { type: 'city', label: 'Utrecht Centraal' },
      commute: { max_minutes: 45 },
      lifestyle_priorities: ['green_access', 'calmness'],
      must_haves: ['parks_nearby'],
      housing_types: ['row_house'],
      area_character: 'quiet_city',
      language: 'en',
    },
  });
  const { container } = renderWithI18n(
    <SurveyReview sessionId="match-a11y-review" onBack={() => {}} onComplete={() => {}} />,
  );

  expect(screen.getByRole('button', { name: 'Show my matches' })).toBeInTheDocument();
  await expectNoSeriousA11yViolations(container);
});

it('keeps reduced-motion hero animation disabled in CSS', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  render(<HeroMapBackground />);
  const css = await readFile(join(process.cwd(), 'src/components/match-first/HeroMapBackground.css'), 'utf8');

  expect(screen.getByTestId('hero-map-background')).toHaveAttribute('data-motion', 'standard');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.hero-map-background__image[^}]*animation:\s*none/s);
});
