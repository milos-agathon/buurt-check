import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import SurveyIntro from './SurveyIntro';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

it('introduces the survey before the first question starts', async () => {
  const user = userEvent.setup();
  const onStartSurvey = vi.fn();

  render(
    <I18nextProvider i18n={i18n}>
      <SurveyIntro onStartSurvey={onStartSurvey} />
    </I18nextProvider>,
  );

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'First, we need to understand how you want to live.',
  );
  expect(screen.getByText('A few quick choices help us match you with neighborhoods that fit your life, not just your budget.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Start the match' }));
  expect(onStartSurvey).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
});
