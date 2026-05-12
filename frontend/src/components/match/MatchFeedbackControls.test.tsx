import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchFeedbackControls from './MatchFeedbackControls';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

it('captures love maybe and not-for-me feedback with updated-ranking explanation', async () => {
  const onSubmit = vi.fn().mockResolvedValue({
    explanation_code: 'match.feedback.explanation.updatedRanking',
    reranking_available: true,
  });

  render(
    <I18nextProvider i18n={i18n}>
      <MatchFeedbackControls
        recommendationId="rec_ijburg"
        neighborhoodId="nh_amsterdam_ijburg"
        onSubmit={onSubmit}
      />
    </I18nextProvider>,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Love' }));
  await userEvent.click(screen.getByRole('button', { name: 'Maybe' }));
  await userEvent.click(screen.getByRole('button', { name: 'Not for me' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    recommendation_id: 'rec_ijburg',
    neighborhood_id: 'nh_amsterdam_ijburg',
    feedback_type: 'love',
  }));
  expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
    feedback_type: 'not_for_me',
  }));
  expect(screen.getByText('Updated recommendations reflect your stated feedback.')).toBeInTheDocument();
});
