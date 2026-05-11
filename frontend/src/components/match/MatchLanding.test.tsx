import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchLanding from './MatchLanding';
import { setupTestI18n } from '../../test/helpers';
import { recordMatchEvent } from '../../services/matchAnalytics';

vi.mock('../../services/matchAnalytics', () => ({
  recordMatchEvent: vi.fn(),
}));

const mockRecordMatchEvent = vi.mocked(recordMatchEvent);

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

beforeEach(() => {
  mockRecordMatchEvent.mockReset();
});

function renderLanding(
  i18n = i18nEn,
  props: Partial<React.ComponentProps<typeof MatchLanding>> = {},
) {
  const onStartQuiz = props.onStartQuiz ?? vi.fn();
  const onCompareKnown = props.onCompareKnown ?? vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchLanding
        onStartQuiz={onStartQuiz}
        onCompareKnown={onCompareKnown}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onStartQuiz, onCompareKnown };
}

it('renders bilingual landing entry points and records quiz start', async () => {
  const user = userEvent.setup();
  const { onStartQuiz, onCompareKnown } = renderLanding();

  await user.click(screen.getByRole('button', { name: 'Find my best neighborhoods' }));

  expect(onStartQuiz).toHaveBeenCalledTimes(1);
  expect(mockRecordMatchEvent).toHaveBeenCalledWith('match_quiz_started', {
    locale: 'en',
    source: 'match_landing',
  });

  await user.click(screen.getByRole('button', { name: 'Compare a neighborhood I already like' }));
  expect(onCompareKnown).toHaveBeenCalledTimes(1);

  renderLanding(i18nNl);
  expect(screen.getByRole('button', { name: 'Vind mijn beste buurten' })).toBeInTheDocument();
});

it('uses an accessible language selector', async () => {
  const user = userEvent.setup();
  const onLanguageChange = vi.fn();
  renderLanding(i18nEn, { onLanguageChange });

  await user.selectOptions(screen.getByLabelText('Language'), 'nl');

  expect(onLanguageChange).toHaveBeenCalledWith('nl');
});
