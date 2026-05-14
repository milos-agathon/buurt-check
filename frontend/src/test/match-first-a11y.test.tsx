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
import SurveyIntro from '../components/match-first/SurveyIntro';
import SurveyReview from '../components/match-first/SurveyReview';
import SurveyShell, { type MatchFirstSurveyAnswers } from '../components/match-first/SurveyShell';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
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
  const [stage, setStage] = useState<'landing' | 'intro' | 'survey' | 'review' | 'run'>('landing');
  const [answer, setAnswer] = useState<MatchFirstSurveyAnswers | null>(null);

  if (stage === 'intro') {
    return <SurveyIntro onStartSurvey={() => setStage('survey')} />;
  }
  if (stage === 'survey') {
    return (
      <SurveyShell
        onBack={() => setStage('intro')}
        onReview={(answers) => {
          setAnswer(answers);
          setStage('review');
        }}
      />
    );
  }
  if (stage === 'review') {
    return (
      <SurveyReview
        onBack={() => setStage('survey')}
        onComplete={(answers) => {
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

  await user.click(screen.getByRole('button', { name: 'Review answer' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Choose one answer to continue.');
  await expectNoSeriousA11yViolations(container);
});

it('review missing-answer state has no serious accessibility violations', async () => {
  const { container } = renderWithI18n(<SurveyReview onBack={() => {}} onComplete={() => {}} />);

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey question before reviewing your match.');
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

it('supports keyboard progress from landing to intro to survey to review', async () => {
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

  screen.getByRole('button', { name: 'Back' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'First, we need to understand how you want to live.' })).toBeInTheDocument();

  screen.getByRole('button', { name: 'Start the match' }).focus();
  await user.keyboard('{Enter}');
  screen.getByRole('radio', { name: 'Both' }).focus();
  await user.keyboard('[Space]');
  screen.getByRole('button', { name: 'Review answer' }).focus();
  await user.keyboard('{Enter}');

  expect(screen.getByRole('heading', { name: 'Ready to find your best neighborhoods?' })).toBeInTheDocument();
  screen.getByRole('button', { name: 'Show my matches' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('both');
});

it('keeps reduced-motion hero animation disabled in CSS', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  render(<HeroMapBackground />);
  const css = await readFile(join(process.cwd(), 'src/components/match-first/HeroMapBackground.css'), 'utf8');

  expect(screen.getByTestId('hero-map-background')).toHaveAttribute('data-motion', 'standard');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.hero-map-background__image[^}]*animation:\s*none/s);
});
