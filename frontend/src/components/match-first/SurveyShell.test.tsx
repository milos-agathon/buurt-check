import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import SurveyShell from './SurveyShell';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  localStorage.clear();
});

function renderSurvey(props: Partial<React.ComponentProps<typeof SurveyShell>> = {}) {
  const onComplete = props.onComplete ?? vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <SurveyShell onComplete={onComplete} {...props} />
    </I18nextProvider>,
  );
  return { onComplete };
}

it('renders exactly one question with validation before review', async () => {
  const user = userEvent.setup();
  renderSurvey();

  expect(screen.getByRole('progressbar', { name: 'Question 1 of 1' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose one answer to continue.');

  await user.click(screen.getByRole('button', { name: 'Buy' }));
  expect(screen.getByRole('button', { name: 'Buy' })).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ready to find your best neighborhoods?');
  expect(screen.getByText('Buy')).toBeInTheDocument();
});

it('persists answers and allows back navigation before completing', async () => {
  const user = userEvent.setup();
  const { onComplete } = renderSurvey();

  await user.click(screen.getByRole('button', { name: 'Both' }));
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-survey') ?? '{}')).toMatchObject({
    intent: 'both',
  });

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');
  expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  await user.click(screen.getByRole('button', { name: 'Show my matches' }));

  expect(onComplete).toHaveBeenCalledWith({ intent: 'both' });
});
