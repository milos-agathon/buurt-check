import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
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
  const onReview = vi.fn();
  const onBack = vi.fn();
  const rendered = render(
    <I18nextProvider i18n={i18n}>
      <SurveyShell
        onComplete={onComplete}
        {...({
          onReview,
          onBack,
          ...props,
        } as ComponentProps<typeof SurveyShell>)}
      />
    </I18nextProvider>,
  );
  return { ...rendered, onComplete, onReview, onBack };
}

it('renders exactly one question with validation before routing to review', async () => {
  const user = userEvent.setup();
  const { onReview } = renderSurvey();

  expect(screen.getByRole('progressbar', { name: 'Question 1 of 1' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  const validation = screen.getByRole('alert');
  expect(validation).toHaveTextContent('Choose one answer to continue.');

  const buy = screen.getByRole('radio', { name: 'Buy' });
  expect(buy).toHaveAttribute('aria-describedby', validation.id);
  await user.click(buy);
  expect(screen.getByRole('radio', { name: 'Buy' })).toBeChecked();

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  expect(onReview).toHaveBeenCalledWith({ intent: 'buy' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Are you looking to buy, rent, or both?');
});

it('moves focus to the validation message when required answer validation fails', async () => {
  const user = userEvent.setup();
  renderSurvey();

  await user.click(screen.getByRole('button', { name: 'Review answer' }));

  await expect(screen.findByRole('alert')).resolves.toHaveFocus();
});

it('persists answers and lets the first question go back to the intro', async () => {
  const user = userEvent.setup();
  const { onBack, onReview } = renderSurvey();

  await user.click(screen.getByRole('radio', { name: 'Both' }));
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-survey:default') ?? '{}')).toMatchObject({
    intent: 'both',
  });

  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(onBack).toHaveBeenCalledTimes(1);

  expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();

  await user.click(screen.getByRole('button', { name: 'Review answer' }));
  expect(onReview).toHaveBeenCalledWith({ intent: 'both' });
});

it('scopes persisted answers to the active match session', async () => {
  const user = userEvent.setup();
  const first = renderSurvey({ sessionId: 'match-one' });

  await user.click(screen.getByRole('radio', { name: 'Buy' }));
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-survey:match-one') ?? '{}')).toMatchObject({
    intent: 'buy',
  });
  first.unmount();

  renderSurvey({ sessionId: 'match-two' });
  expect(screen.getByRole('radio', { name: 'Buy' })).not.toBeChecked();

  await user.click(screen.getByRole('radio', { name: 'Rent' }));
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-survey:match-two') ?? '{}')).toMatchObject({
    intent: 'rent',
  });
  expect(JSON.parse(localStorage.getItem('buurt-check-match-first-survey:match-one') ?? '{}')).toMatchObject({
    intent: 'buy',
  });
});

it('keeps the current answer usable when localStorage writes fail', async () => {
  const user = userEvent.setup();
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  try {
    const { onReview } = renderSurvey({ sessionId: 'match-storage-fail' });

    await user.click(screen.getByRole('radio', { name: 'Rent' }));
    expect(screen.getByRole('radio', { name: 'Rent' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Review answer' }));
    expect(onReview).toHaveBeenCalledWith({ intent: 'rent' });
  } finally {
    setItemSpy.mockRestore();
  }
});
