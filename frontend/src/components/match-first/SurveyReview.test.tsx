import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import SurveyReview from './SurveyReview';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  localStorage.clear();
});

function renderReview(props: Partial<ComponentProps<typeof SurveyReview>> = {}) {
  const onBack = props.onBack ?? vi.fn();
  const onComplete = props.onComplete ?? vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <SurveyReview onBack={onBack} onComplete={onComplete} {...props} />
    </I18nextProvider>,
  );
  return { onBack, onComplete };
}

it('restores the saved answer and completes from the review route', async () => {
  const user = userEvent.setup();
  localStorage.setItem('buurt-check-match-first-survey:match-review', JSON.stringify({ intent: 'rent' }));
  const { onComplete } = renderReview({ sessionId: 'match-review' });

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ready to find your best neighborhoods?');
  expect(screen.getByText('Rent')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show my matches' }));
  expect(onComplete).toHaveBeenCalledWith({ intent: 'rent' });
});

it('recovers to the survey when no answer has been saved for the review route', async () => {
  const user = userEvent.setup();
  const { onBack, onComplete } = renderReview();

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey question before reviewing your match.');
  expect(screen.queryByRole('button', { name: 'Show my matches' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('does not read answers saved for a different match session', async () => {
  const user = userEvent.setup();
  localStorage.setItem('buurt-check-match-first-survey:match-one', JSON.stringify({ intent: 'buy' }));
  const { onBack, onComplete } = renderReview({ sessionId: 'match-two' });

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey question before reviewing your match.');

  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('renders answers passed from App state when storage is unavailable', async () => {
  const user = userEvent.setup();
  const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    const { onComplete } = renderReview({
      sessionId: 'match-storage-fail',
      answers: { intent: 'both' },
    });

    expect(screen.getByText('Both')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show my matches' }));
    expect(onComplete).toHaveBeenCalledWith({ intent: 'both' });
  } finally {
    getItemSpy.mockRestore();
  }
});
