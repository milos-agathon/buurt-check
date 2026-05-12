import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import MatchFirstLanding from './MatchFirstLanding';
import { setupTestI18n } from '../../test/helpers';
import { recordMatchFirstEvent } from '../../services/matchFirstAnalytics';

vi.mock('../../services/matchFirstAnalytics', () => ({
  recordMatchFirstEvent: vi.fn(),
}));

const mockRecordMatchFirstEvent = vi.mocked(recordMatchFirstEvent);

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

beforeEach(() => {
  mockRecordMatchFirstEvent.mockReset();
});

function renderLanding(
  i18n = i18nEn,
  props: Partial<React.ComponentProps<typeof MatchFirstLanding>> = {},
) {
  const onStartMatch = props.onStartMatch ?? vi.fn();
  const onSearchAddress = props.onSearchAddress ?? vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <MatchFirstLanding
        onStartMatch={onStartMatch}
        onSearchAddress={onSearchAddress}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onStartMatch, onSearchAddress };
}

it('renders one dominant match CTA and demotes address search to a text link', async () => {
  const user = userEvent.setup();
  const { onStartMatch, onSearchAddress } = renderLanding();

  const primaryCta = screen.getByRole('button', { name: 'Find my dream neighborhood' });
  expect(primaryCta).toHaveClass('match-first-landing__cta');

  const addressLink = screen.getByRole('link', { name: 'Already have an address?' });
  expect(addressLink).toHaveAttribute('href', '#/search');
  expect(addressLink).toHaveClass('match-first-landing__address-link');
  expect(screen.queryByRole('button', { name: 'Already have an address?' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /address/i })).not.toBeInTheDocument();

  await user.click(primaryCta);
  expect(onStartMatch).toHaveBeenCalledTimes(1);
  expect(mockRecordMatchFirstEvent).toHaveBeenCalledWith('match_first_cta_clicked', {
    locale: 'en',
    source: 'landing',
  });

  await user.click(addressLink);
  expect(onSearchAddress).toHaveBeenCalledTimes(1);
  expect(mockRecordMatchFirstEvent).toHaveBeenCalledWith('match_first_search_link_clicked', {
    locale: 'en',
    source: 'landing',
  });
});

it('uses bilingual translation keys for the CTA, search link, and language control', async () => {
  const user = userEvent.setup();
  const onLanguageChange = vi.fn();
  renderLanding(i18nNl, { onLanguageChange });

  expect(screen.getByRole('button', { name: 'Vind mijn droombuurt' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Heb je al een adres?' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Taal' })).toBeInTheDocument();

  const englishButton = screen.getByRole('button', { name: 'Engels' });
  expect(englishButton).toHaveAttribute('aria-pressed', 'false');

  await user.click(englishButton);
  expect(onLanguageChange).toHaveBeenCalledWith('en');
});

it('language buttons use native keyboard behavior instead of custom radio semantics', async () => {
  const user = userEvent.setup();
  const onLanguageChange = vi.fn();
  renderLanding(i18nEn, { onLanguageChange });

  const dutchButton = screen.getByRole('button', { name: 'Dutch' });
  dutchButton.focus();
  await user.keyboard('{Enter}');

  expect(onLanguageChange).toHaveBeenCalledWith('nl');
  expect(dutchButton).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
