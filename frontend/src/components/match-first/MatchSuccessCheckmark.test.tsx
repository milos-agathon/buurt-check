import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchSuccessCheckmark from './MatchSuccessCheckmark';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

it('renders a large animated Buurt Check checkmark and opens the results route by CTA', async () => {
  const user = userEvent.setup();
  const onOpenResults = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchSuccessCheckmark
        status="completed"
        reducedMotion={false}
        onOpenResults={onOpenResults}
      />
    </I18nextProvider>,
  );

  const checkmark = screen.getByTestId('match-success-checkmark');
  expect(checkmark).toHaveAttribute('data-motion', 'animated');
  expect(checkmark).toHaveAccessibleName('Buurt Check match complete');
  expect(checkmark).toHaveClass('match-success-checkmark__mark--animated');
  expect(screen.getByRole('heading', { name: 'Your neighborhood matches are ready.' })).toBeInTheDocument();
  expect(screen.queryByText(/confetti/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Open my map' }));
  expect(onOpenResults).toHaveBeenCalledTimes(1);
});

it('uses a static reduced-motion checkmark variant', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchSuccessCheckmark
        status="completed"
        reducedMotion
        onOpenResults={() => {}}
      />
    </I18nextProvider>,
  );

  const checkmark = screen.getByTestId('match-success-checkmark');
  expect(checkmark).toHaveAttribute('data-motion', 'reduced');
  expect(checkmark).toHaveClass('match-success-checkmark__mark--static');
  expect(checkmark).not.toHaveClass('match-success-checkmark__mark--animated');
});

it('surfaces completed-with-fallback state in friendly copy', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchSuccessCheckmark
        status="completed_with_fallback"
        reducedMotion={false}
        onOpenResults={() => {}}
      />
    </I18nextProvider>,
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    'We found your matches using the stable scoring model. Some advanced ranking features were skipped this time.',
  );
  expect(screen.queryByText(/exception|stack|model trace|match_job/i)).not.toBeInTheDocument();
});
