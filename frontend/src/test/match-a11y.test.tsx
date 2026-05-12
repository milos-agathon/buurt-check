import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import MatchLanding from '../components/match/MatchLanding';
import MatchQuiz from '../components/match/MatchQuiz';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  const severe = results.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
}

function renderWithI18n(ui: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

it('match landing has no serious accessibility violations', async () => {
  const { container } = renderWithI18n(
    <MatchLanding onStartQuiz={() => {}} onCompareKnown={() => {}} />,
  );

  await expectNoSeriousA11yViolations(container);
});

it('match quiz controls have no serious accessibility violations', async () => {
  const { container } = renderWithI18n(<MatchQuiz onSubmit={() => {}} />);

  await expectNoSeriousA11yViolations(container);
});
