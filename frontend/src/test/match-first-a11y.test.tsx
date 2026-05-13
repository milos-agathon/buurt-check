import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  localStorage.clear();
  document.documentElement.removeAttribute('data-test-reduced-motion');
});

function MatchFirstKeyboardHarness() {
  const [stage, setStage] = useState<'landing' | 'intro' | 'survey' | 'review' | 'run'>('landing');
  const [answer, setAnswer] = useState<MatchFirstSurveyAnswers | null>(null);

  if (stage === 'intro') {
    return <SurveyIntro onStartSurvey={() => setStage('survey')} onBack={() => setStage('landing')} />;
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
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <MatchFirstLanding onStartMatch={() => {}} onSearchAddress={() => {}} />
    </I18nextProvider>,
  );

  const results = await axe(container);
  const severe = results.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
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

it('keeps the Dossier back-to-map action on a native focusable button', async () => {
  const source = await readFile(join(process.cwd(), 'src/App.tsx'), 'utf8');

  expect(source).toMatch(/<button[\s\S]*className="app__match-return-button"[\s\S]*onClick={handleBackToMatchMap}/);
  expect(source).toContain("{t('dossier.backToMatchMap')}");
});
