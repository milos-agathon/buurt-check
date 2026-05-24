import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import SurveyReview from './SurveyReview';
import { saveMatchSessionSnapshot } from '../../services/matchSessionStorage';
import type { MatchCustomPreferenceItem, MatchFirstSurveyAnswers } from '../../types/matchFirst';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

const completeAnswers: MatchFirstSurveyAnswers = {
  intent: 'rent',
  budget: { rent_max: 220000 },
  household_type: 'couple',
  anchor_location: { type: 'city', label: 'Rotterdam Centraal' },
  commute: { max_minutes: 45 },
  lifestyle_priorities: ['green_access', 'public_transport'],
  must_haves: ['good_transit'],
  dealbreakers: ['high_noise'],
  housing_types: ['apartment'],
  area_character: 'quiet_city',
  language: 'en',
};

const customPreferences: MatchCustomPreferenceItem[] = [
  {
    custom_preference_id: 'cp_coast',
    raw_user_phrase_ref: 'custom_preferences:0',
    normalized_key: 'coast_or_beach_proximity',
    category: 'geography',
    use_status: 'saved_unsupported',
    feature_key: null,
    default_weight: 0,
    weight: 0,
    source_requirement: 'coast_distance_metric',
    privacy_class: 'standard',
    label_key: 'matchFirst.additionalPreferences.label.coast',
    explanation_key: 'matchFirst.additionalPreferences.explanation.coastSavedUnsupported',
    reason_code: 'match.customPreference.coast_distance_unavailable',
  },
  {
    custom_preference_id: 'cp_worship',
    raw_user_phrase_ref: 'custom_preferences:1',
    normalized_key: 'place_of_worship_proximity',
    category: 'amenity',
    use_status: 'map_context_only',
    feature_key: null,
    default_weight: 0,
    weight: 0,
    source_requirement: 'neutral_amenity_overlay',
    privacy_class: 'sensitive_context',
    label_key: 'matchFirst.additionalPreferences.label.placeOfWorship',
    explanation_key: 'matchFirst.additionalPreferences.explanation.placeOfWorshipMapContext',
    reason_code: 'match.customPreference.sensitive_amenity_context_only',
  },
];

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(() => {
  sessionStorage.clear();
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

it('restores the saved answer set and completes from the review route', async () => {
  const user = userEvent.setup();
  saveMatchSessionSnapshot('match-review', {
    sessionId: 'match-review',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: completeAnswers,
  });
  const { onComplete } = renderReview({ sessionId: 'match-review' });

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ready to find your best neighborhoods?');
  expect(screen.getByText('Rent')).toBeInTheDocument();
  expect(screen.getByText('Rotterdam Centraal')).toBeInTheDocument();
  expect(screen.getByText('Budget')).toBeInTheDocument();
  expect(screen.getByText('Maximum monthly rent €2,200')).toBeInTheDocument();
  expect(screen.getByText('Maximum travel time')).toBeInTheDocument();
  expect(screen.getByText('45 minutes')).toBeInTheDocument();
  expect(screen.getByText('Must-haves')).toBeInTheDocument();
  expect(screen.getByText('Good transit')).toBeInTheDocument();
  expect(screen.getByText('Housing')).toBeInTheDocument();
  expect(screen.getByText('Apartment')).toBeInTheDocument();
  expect(screen.getByText('Area')).toBeInTheDocument();
  expect(screen.getByText('Quiet city')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Show my matches' }));
  expect(onComplete).toHaveBeenCalledWith(completeAnswers);
});

it('recovers to the survey when no complete answer set has been saved for the review route', async () => {
  const user = userEvent.setup();
  const { onBack, onComplete } = renderReview();

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey questions before reviewing your match.');
  expect(screen.queryByRole('button', { name: 'Show my matches' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('recovers to the survey when persisted answers are present but invalid', async () => {
  const user = userEvent.setup();
  saveMatchSessionSnapshot('match-invalid-review', {
    sessionId: 'match-invalid-review',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: {
      ...completeAnswers,
      anchor_location: { type: 'city', label: '   ' },
      lifestyle_priorities: [],
    },
  });
  const { onBack, onComplete } = renderReview({ sessionId: 'match-invalid-review' });

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey questions before reviewing your match.');
  expect(screen.queryByRole('button', { name: 'Show my matches' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('recovers to the survey when persisted answers contain unknown stable option values', async () => {
  const user = userEvent.setup();
  saveMatchSessionSnapshot('match-invalid-options', {
    sessionId: 'match-invalid-options',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: {
      ...completeAnswers,
      intent: 'Rent' as MatchFirstSurveyAnswers['intent'],
      lifestyle_priorities: ['green_access', 'unknown_priority'] as MatchFirstSurveyAnswers['lifestyle_priorities'],
    },
  });
  const { onBack, onComplete } = renderReview({ sessionId: 'match-invalid-options' });

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey questions before reviewing your match.');
  expect(screen.queryByRole('button', { name: 'Show my matches' })).not.toBeInTheDocument();
  expect(screen.queryByText('unknown_priority')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Back to survey' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

it('renders a backend sync error without losing the review answers', async () => {
  renderReview({
    sessionId: 'match-sync-error',
    answers: completeAnswers,
    syncErrorKey: 'matchFirst.review.syncFailed',
    onComplete: vi.fn(),
  });

  expect(screen.getByRole('alert')).toHaveTextContent('We could not sync your saved answers yet. Try again before opening your match map.');
  expect(screen.getByRole('button', { name: 'Show my matches' })).toBeInTheDocument();
  expect(screen.getByText('Rent')).toBeInTheDocument();
});

it('shows reviewed custom preferences with their non-scoring usage status', async () => {
  const user = userEvent.setup();
  const onEditCustomPreferences = vi.fn();
  renderReview({
    sessionId: 'match-custom-review',
    answers: completeAnswers,
    customPreferences,
    customPreferencesReviewed: true,
    onEditCustomPreferences,
  });

  expect(screen.getByText('Additional preferences')).toBeInTheDocument();
  expect(screen.getByText('Coast or beach access')).toBeInTheDocument();
  expect(screen.getByText('Saved for future support')).toBeInTheDocument();
  expect(screen.getByText('Place of worship nearby')).toBeInTheDocument();
  expect(screen.getByText('Shown as map context')).toBeInTheDocument();
  expect(screen.queryByText('Close to the beach')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Edit additional preferences' }));
  expect(onEditCustomPreferences).toHaveBeenCalledTimes(1);
});

it('does not read answers saved for a different match session', async () => {
  const user = userEvent.setup();
  saveMatchSessionSnapshot('match-one', {
    sessionId: 'match-one',
    locale: 'en',
    step: 11,
    answerVersion: 11,
    staleResults: true,
    answers: completeAnswers,
  });
  const { onBack, onComplete } = renderReview({ sessionId: 'match-two' });

  expect(screen.getByRole('alert')).toHaveTextContent('Answer the survey questions before reviewing your match.');

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
      answers: {
        ...completeAnswers,
        intent: 'both',
        budget: { buy_min: 35000000, buy_max: 50000000, rent_max: 220000 },
      },
    });

    expect(screen.getByText('Both')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show my matches' }));
    expect(onComplete).toHaveBeenCalledWith({
      ...completeAnswers,
      intent: 'both',
      budget: { buy_min: 35000000, buy_max: 50000000, rent_max: 220000 },
    });
  } finally {
    getItemSpy.mockRestore();
  }
});
