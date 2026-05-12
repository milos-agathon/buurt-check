import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import MatchFirstLanding from '../components/match-first/MatchFirstLanding';
import { setupTestI18n } from './helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

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
