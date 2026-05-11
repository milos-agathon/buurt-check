import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchQuiz from './MatchQuiz';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderQuiz(props: Partial<React.ComponentProps<typeof MatchQuiz>> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchQuiz onSubmit={onSubmit} {...props} />
    </I18nextProvider>,
  );
  return { onSubmit };
}

async function completeRequiredQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Both' }));
  await user.type(screen.getByLabelText('Maximum purchase budget'), '625000');
  await user.type(screen.getByLabelText('Maximum monthly rent'), '2200');
  await user.click(screen.getByRole('radio', { name: 'Family' }));
  await user.type(screen.getByLabelText('Current city or preferred anchor'), 'Amsterdam');
  await user.type(screen.getByLabelText('Maximum commute time'), '45');
  await user.type(screen.getByLabelText('Work or school anchors'), 'Amsterdam Zuid');
  await user.click(within(screen.getByRole('group', { name: 'Must-haves' })).getByRole('checkbox', { name: 'Green space' }));
  await user.click(within(screen.getByRole('group', { name: 'Must-haves' })).getByRole('checkbox', { name: 'Schools' }));
  await user.click(within(screen.getByRole('group', { name: 'Nice-to-haves' })).getByRole('checkbox', { name: 'Train nearby' }));
  await user.click(screen.getByRole('radio', { name: 'House' }));
  await user.selectOptions(screen.getByLabelText('Report language'), 'nl');
  const lifestyle = within(screen.getByRole('group', { name: 'Lifestyle priorities' }));
  await user.click(lifestyle.getByRole('checkbox', { name: 'Calmness' }));
  await user.click(lifestyle.getByRole('checkbox', { name: 'Family fit' }));
}

it('validates required controls before submitting', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderQuiz();

  await user.click(screen.getByRole('button', { name: 'Create my preference profile' }));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Choose whether you want to buy, rent, or both.')).toBeInTheDocument();
  expect(screen.getByText('Add a current city or preferred anchor location.')).toBeInTheDocument();
});

it('captures required quiz answers as a typed payload', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderQuiz();

  await completeRequiredQuiz(user);
  await user.click(screen.getByRole('button', { name: 'Create my preference profile' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    journey_intent: 'both',
    locale: 'nl',
    language_preference: 'nl',
    household_type: 'family',
    current_city: 'Amsterdam',
    budget: expect.objectContaining({ buy_max: 62500000, rent_max: 220000 }),
    commute_limits: [expect.objectContaining({ max_minutes: 45 })],
    anchor_locations: [expect.objectContaining({ query: 'Amsterdam Zuid' })],
    must_haves: expect.arrayContaining(['green_access', 'schools']),
    nice_to_haves: expect.arrayContaining(['train_nearby']),
    property_types: ['house'],
    lifestyle_priorities: expect.objectContaining({ calmness: 5, family_fit: 5 }),
  }));
});

it('keeps controls keyboard reachable and grouped by accessible names', async () => {
  const user = userEvent.setup();
  renderQuiz();

  await user.tab();
  expect(screen.getByRole('radio', { name: 'Buy' })).toHaveFocus();

  expect(screen.getByRole('group', { name: 'Journey' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Must-haves' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Lifestyle priorities' })).toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Property type' })).getByText('Apartment')).toBeInTheDocument();
});
