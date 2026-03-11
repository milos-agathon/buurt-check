import { render, screen, act, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AddressSearch from './AddressSearch';
import { setupTestI18n, makeSuggestion } from '../test/helpers';
import type { SuggestResponse } from '../types/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    suggestAddresses: vi.fn(),
  };
});

vi.mock('../services/firstVisit', () => ({
  isFirstVisit: vi.fn(() => true),
}));

vi.mock('../services/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { suggestAddresses } from '../services/api';
import { isFirstVisit } from '../services/firstVisit';
import { trackEvent } from '../services/analytics';
const mockSuggest = vi.mocked(suggestAddresses);
const mockIsFirstVisit = vi.mocked(isFirstVisit);
const mockTrackEvent = vi.mocked(trackEvent);

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [i18nEn, i18nNl] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-24T12:00:00Z'));
  mockSuggest.mockReset();
  mockIsFirstVisit.mockReset();
  mockTrackEvent.mockReset();
  mockIsFirstVisit.mockReturnValue(true);
  localStorage.removeItem('buurt-check-recent-searches');
  localStorage.removeItem('buurt-check-visited');
});

afterEach(() => {
  vi.useRealTimers();
});

interface RenderSearchOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelect?: (...args: any[]) => any;
  i18n?: Awaited<ReturnType<typeof setupTestI18n>>;
  shortlistCount?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigateToSaved?: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigateToCompare?: (...args: any[]) => any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSearch(optionsOrOnSelect?: RenderSearchOptions | any, i18nArg?: Awaited<ReturnType<typeof setupTestI18n>>) {
  // Support legacy call signature: renderSearch(onSelect, i18n)
  let opts: RenderSearchOptions;
  if (typeof optionsOrOnSelect === 'function' || optionsOrOnSelect === undefined) {
    opts = {
      onSelect: optionsOrOnSelect ?? vi.fn(),
      i18n: i18nArg ?? i18nEn,
    };
  } else {
    opts = optionsOrOnSelect;
  }

  const onSelect = opts.onSelect ?? vi.fn();
  const i18n = opts.i18n ?? i18nEn;
  const shortlistCount = opts.shortlistCount ?? 0;
  const onNavigateToSaved = opts.onNavigateToSaved;
  const onNavigateToCompare = opts.onNavigateToCompare;

  const result = render(
    <I18nextProvider i18n={i18n}>
      <AddressSearch
        onSelect={onSelect}
        shortlistCount={shortlistCount}
        onNavigateToSaved={onNavigateToSaved}
        onNavigateToCompare={onNavigateToCompare}
      />
    </I18nextProvider>,
  );
  return { ...result, onSelect };
}

/** Simulates typing by firing change events. We use fireEvent (not userEvent)
 *  because userEvent.type uses internal delays that conflict with vi.useFakeTimers. */
async function typeInto(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
}

function suggestionsResponse(count: number): SuggestResponse {
  return {
    suggestions: Array.from({ length: count }, (_, i) =>
      makeSuggestion({ id: `s${i}`, display_name: `Street ${i}, Amsterdam` }),
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Types into input, advances the debounce timer, and waits for state updates. */
async function typeAndFlush(input: HTMLElement, value: string) {
  await typeInto(input, value);
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
}

describe('input behavior', () => {
  it('renders input with translated placeholder', () => {
    renderSearch();
    expect(screen.getByPlaceholderText('e.g. Keizersgracht 1, Amsterdam')).toBeInTheDocument();
  });

  it('does not fetch for queries < 2 chars', async () => {
    renderSearch();
    await typeInto(screen.getByRole('combobox'), 'a');
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('debounces API calls by 300ms', async () => {
    mockSuggest.mockResolvedValue({ suggestions: [] });
    renderSearch();
    await typeInto(screen.getByRole('combobox'), 'am');

    // Not called yet — within debounce window
    expect(mockSuggest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest).toHaveBeenCalledWith('am', 7, expect.any(AbortSignal));
  });

  it('cancels pending debounce on new input', async () => {
    mockSuggest.mockResolvedValue({ suggestions: [] });
    renderSearch();
    const input = screen.getByRole('combobox');

    await typeInto(input, 'am');
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    // Type more before debounce fires
    await typeInto(input, 'ams');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    // Only one call — for the final value 'ams'
    expect(mockSuggest).toHaveBeenCalledTimes(1);
    expect(mockSuggest).toHaveBeenCalledWith('ams', 7, expect.any(AbortSignal));
  });
});

describe('suggestions dropdown', () => {
  it('shows suggestion list when API returns results', async () => {
    mockSuggest.mockResolvedValue(suggestionsResponse(3));
    renderSearch();
    await typeAndFlush(screen.getByRole('combobox'), 'am');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('calls onSelect and closes dropdown on suggestion click', async () => {
    const response = suggestionsResponse(2);
    mockSuggest.mockResolvedValue(response);
    const { onSelect } = renderSearch();

    await typeAndFlush(screen.getByRole('combobox'), 'am');

    // Use fireEvent.mouseDown because the component uses onMouseDown
    await act(async () => {
      fireEvent.mouseDown(screen.getAllByRole('option')[1]);
    });

    expect(onSelect).toHaveBeenCalledWith(response.suggestions[1]);
    expect(mockTrackEvent).toHaveBeenCalledWith('address_search_submitted', {
      lookup_id: response.suggestions[1].id,
      source: 'search',
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('updates input value to selected suggestion display_name', async () => {
    const response = suggestionsResponse(1);
    mockSuggest.mockResolvedValue(response);
    renderSearch();

    await typeAndFlush(screen.getByRole('combobox'), 'am');

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('option'));
    });
    expect(screen.getByRole('combobox')).toHaveValue(response.suggestions[0].display_name);
  });
});

describe('combobox accessibility', () => {
  it('renders combobox semantics on the input and listbox id linkage', async () => {
    mockSuggest.mockResolvedValue(suggestionsResponse(2));
    renderSearch();

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-controls', 'address-suggestions');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await typeAndFlush(input, 'am');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'address-suggestions');
  });

  it('updates aria-activedescendant to the highlighted suggestion id', async () => {
    mockSuggest.mockResolvedValue(suggestionsResponse(3));
    renderSearch();

    const input = screen.getByRole('combobox');
    await typeAndFlush(input, 'am');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });

    expect(input).toHaveAttribute('aria-activedescendant', 'address-suggestion-0');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('id', 'address-suggestion-0');
  });
});

describe('keyboard navigation', () => {
  async function setupWithSuggestions() {
    mockSuggest.mockResolvedValue(suggestionsResponse(3));
    const rendered = renderSearch();
    const input = screen.getByRole('combobox');
    await typeAndFlush(input, 'am');
    return { ...rendered, input };
  }

  it('ArrowDown moves active index down (aria-selected)', async () => {
    const { input } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowDown clamps at last item', async () => {
    const { input } = await setupWithSuggestions();
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      });
    }

    const options = screen.getAllByRole('option');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowUp moves active index up', async () => {
    const { input } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp clamps at 0', async () => {
    const { input } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter selects active suggestion', async () => {
    const { input, onSelect } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', display_name: 'Street 1, Amsterdam' }),
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter does nothing when no item is active (activeIndex = -1)', async () => {
    const { input, onSelect } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onSelect).not.toHaveBeenCalled();
    // Dropdown stays open
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Escape closes dropdown', async () => {
    const { input } = await setupWithSuggestions();
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('error handling', () => {
  it('shows error message when API fails', async () => {
    mockSuggest.mockRejectedValue(new TypeError('Network error'));
    renderSearch();
    await typeAndFlush(screen.getByRole('combobox'), 'am');

    expect(screen.getByText("We couldn't connect to our servers. Check your internet connection and try again.")).toBeInTheDocument();
  });

  it('ignores AbortError (no error message shown)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockSuggest.mockRejectedValue(abortError);
    renderSearch();
    await typeAndFlush(screen.getByRole('combobox'), 'am');

    expect(screen.queryByText('Could not search addresses')).not.toBeInTheDocument();
  });

  it('ignores a late response from an aborted request after the query is cleared', async () => {
    const pending = deferred<SuggestResponse>();
    mockSuggest.mockImplementation((_query, _limit, signal) => {
      signal?.addEventListener('abort', () => {
        pending.reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
      return pending.promise;
    });

    renderSearch();
    const input = screen.getByRole('combobox');

    await typeInto(input, 'am');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    await typeInto(input, 'a');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Street 0, Amsterdam')).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't connect to our servers. Check your internet connection and try again.")).not.toBeInTheDocument();
    expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
  });
});

describe('recent search i18n formatting', () => {
  it('shows Dutch relative time labels in NL mode', () => {
    const now = Date.now();
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      {
        id: 'recent-1',
        display_name: 'Prinsengracht 1, Amsterdam',
        timestamp: now - (5 * 60 * 1000),
      },
    ]));

    renderSearch(vi.fn(), i18nNl);

    expect(screen.getByText('5m geleden')).toBeInTheDocument();
  });

  it('shows English relative time labels in EN mode', () => {
    const now = Date.now();
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      {
        id: 'recent-1',
        display_name: 'Prinsengracht 1, Amsterdam',
        timestamp: now - (5 * 60 * 1000),
      },
    ]));

    renderSearch(vi.fn(), i18nEn);

    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('passes i18n locale to toLocaleDateString in NL mode', () => {
    const now = Date.now();
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      {
        id: 'recent-1',
        display_name: 'Prinsengracht 1, Amsterdam',
        timestamp: now - (10 * 24 * 60 * 60 * 1000),
      },
    ]));

    const dateSpy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('formatted-date');

    renderSearch(vi.fn(), i18nNl);

    expect(screen.getByText('formatted-date')).toBeInTheDocument();
    expect(dateSpy).toHaveBeenCalledWith('nl-NL');

    dateSpy.mockRestore();
  });

  it('passes i18n locale to toLocaleDateString in EN mode', () => {
    const now = Date.now();
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      {
        id: 'recent-1',
        display_name: 'Prinsengracht 1, Amsterdam',
        timestamp: now - (10 * 24 * 60 * 60 * 1000),
      },
    ]));

    const dateSpy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('formatted-date');

    renderSearch(vi.fn(), i18nEn);

    expect(screen.getByText('formatted-date')).toBeInTheDocument();
    expect(dateSpy).toHaveBeenCalledWith('en-US');

    dateSpy.mockRestore();
  });
});

describe('returning user re-engagement', () => {
  beforeEach(() => {
    mockIsFirstVisit.mockReturnValue(false);
  });

  it('shows welcome-back section for returning users with no recent searches', () => {
    renderSearch();
    expect(screen.getByTestId('welcome-back')).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.queryByTestId('value-props')).not.toBeInTheDocument();
  });

  it('shows value props for first-time users (not welcome-back)', () => {
    mockIsFirstVisit.mockReturnValue(true);
    renderSearch();
    expect(screen.getByTestId('value-props')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-back')).not.toBeInTheDocument();
  });

  it('shows saved address count when shortlistCount > 0', () => {
    renderSearch({ shortlistCount: 3 });
    expect(screen.getByText('You have 3 saved addresses')).toBeInTheDocument();
  });

  it('shows singular form for 1 saved address', () => {
    renderSearch({ shortlistCount: 1 });
    expect(screen.getByText('You have 1 saved address')).toBeInTheDocument();
  });

  it('shows "View saved properties" button when shortlistCount > 0', () => {
    const onNavigateToSaved = vi.fn();
    renderSearch({ shortlistCount: 2, onNavigateToSaved });
    const btn = screen.getByText('View saved properties');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onNavigateToSaved).toHaveBeenCalledTimes(1);
  });

  it('shows "Compare" button when shortlistCount >= 2', () => {
    const onNavigateToCompare = vi.fn();
    renderSearch({ shortlistCount: 2, onNavigateToCompare });
    const btn = screen.getByText('Compare your saved addresses');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onNavigateToCompare).toHaveBeenCalledTimes(1);
  });

  it('does not show compare button when shortlistCount < 2', () => {
    renderSearch({ shortlistCount: 1 });
    expect(screen.queryByText('Compare your saved addresses')).not.toBeInTheDocument();
  });

  it('does not show saved count when shortlistCount is 0', () => {
    renderSearch({ shortlistCount: 0 });
    expect(screen.queryByText(/saved address/)).not.toBeInTheDocument();
  });

  it('shows search prompt for returning users', () => {
    renderSearch();
    expect(screen.getByText('Search for a new address')).toBeInTheDocument();
  });

  it('shows recent searches instead of welcome-back when recent searches exist', () => {
    const now = Date.now();
    localStorage.setItem('buurt-check-recent-searches', JSON.stringify([
      { id: 'r1', display_name: 'Herengracht 1, Amsterdam', timestamp: now - 60000 },
    ]));

    renderSearch();
    expect(screen.getByTestId('recent-searches')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-back')).not.toBeInTheDocument();
  });

  it('shows Dutch welcome-back text in NL mode', () => {
    renderSearch({ i18n: i18nNl, shortlistCount: 2, onNavigateToSaved: vi.fn(), onNavigateToCompare: vi.fn() });
    expect(screen.getByText('Welkom terug')).toBeInTheDocument();
    expect(screen.getByText('Je hebt 2 opgeslagen adressen')).toBeInTheDocument();
    expect(screen.getByText('Bekijk opgeslagen woningen')).toBeInTheDocument();
    expect(screen.getByText('Vergelijk je opgeslagen adressen')).toBeInTheDocument();
  });
});
