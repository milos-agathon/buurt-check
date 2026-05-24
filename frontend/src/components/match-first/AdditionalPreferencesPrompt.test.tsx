import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import AdditionalPreferencesPrompt from './AdditionalPreferencesPrompt';
import type { MatchCustomPreferenceExtractionResponse } from '../../types/matchFirst';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

const extraction: MatchCustomPreferenceExtractionResponse = {
  session_id: 'match-extra',
  locale: 'en',
  needs_clarification: false,
  warnings: [],
  items: [
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
  ],
};

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});

function renderPrompt(props: Partial<Parameters<typeof AdditionalPreferencesPrompt>[0]> = {}) {
  const onBack = props.onBack ?? vi.fn();
  const onSkip = props.onSkip ?? vi.fn();
  const onReview = props.onReview ?? vi.fn();
  const onExtract = props.onExtract ?? vi.fn(async () => extraction);
  render(
    <I18nextProvider i18n={i18n}>
      <AdditionalPreferencesPrompt
        sessionId="match-extra"
        onBack={onBack}
        onSkip={onSkip}
        onReview={onReview}
        onExtract={onExtract}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onBack, onSkip, onReview, onExtract };
}

it('renders one calm optional prompt with examples, privacy copy, and skip', () => {
  renderPrompt();

  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Anything else that matters?' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Question 12 of 12' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Additional preferences' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  expect(screen.getByText('Close to the beach')).toBeInTheDocument();
  expect(screen.getByText('Near daily market')).toBeInTheDocument();
  expect(screen.getByText(/We only save stable preference keys/)).toBeInTheDocument();
  expect(screen.queryByText(/chat/i)).not.toBeInTheDocument();
});

it('extracts typed preferences and shows a reviewable non-scoring summary without raw text', async () => {
  const user = userEvent.setup();
  const { onExtract, onReview } = renderPrompt();

  await user.type(screen.getByRole('textbox', { name: 'Additional preferences' }), 'Close to the beach and near a church.');
  await user.click(screen.getByRole('button', { name: 'Review this preference' }));

  await waitFor(() => {
    expect(onExtract).toHaveBeenCalledWith('Close to the beach and near a church.');
  });
  expect(screen.getByText('Coast or beach access')).toBeInTheDocument();
  expect(screen.getByText('Place of worship nearby')).toBeInTheDocument();
  expect(screen.getByText('Saved for future support')).toBeInTheDocument();
  expect(screen.getByText('Shown as map context')).toBeInTheDocument();
  expect(screen.queryByText('Close to the beach and near a church.')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Continue to review' }));
  expect(onReview).toHaveBeenCalledWith(extraction.items);
});

it('lets the user remove extracted items before continuing', async () => {
  const user = userEvent.setup();
  const { onReview } = renderPrompt();

  await user.type(screen.getByRole('textbox', { name: 'Additional preferences' }), 'Close to the beach and near a church.');
  await user.click(screen.getByRole('button', { name: 'Review this preference' }));
  await screen.findByText('Coast or beach access');
  await user.click(screen.getByRole('button', { name: 'Remove Coast or beach access' }));
  await user.click(screen.getByRole('button', { name: 'Continue to review' }));

  expect(onReview).toHaveBeenCalledWith([
    expect.objectContaining({ normalized_key: 'place_of_worship_proximity' }),
  ]);
});

it('supports skip and retry states without starting matching', async () => {
  const user = userEvent.setup();
  const onSkip = vi.fn();
  const onExtract = vi.fn(async () => {
    throw new Error('network');
  });
  renderPrompt({ onSkip, onExtract });

  await user.click(screen.getByRole('button', { name: 'Skip' }));
  expect(onSkip).toHaveBeenCalledTimes(1);

  await user.type(screen.getByRole('textbox', { name: 'Additional preferences' }), 'Close to the beach');
  await user.click(screen.getByRole('button', { name: 'Review this preference' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('We could not read that preference yet. Try again or skip this step.');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
