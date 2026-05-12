import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SurveyShell from './SurveyShell';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

it('renders a placeholder survey route shell with exactly one question', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <SurveyShell />
    </I18nextProvider>,
  );

  expect(screen.getByRole('progressbar', { name: 'Question 1 of 1' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What kind of home search are you starting?');
});
