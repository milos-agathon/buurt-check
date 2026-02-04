import { render, screen, act, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import AddressSearch from './AddressSearch';
import { setupTestI18n, makeSuggestion } from '../test/helpers';
import type { SuggestResponse } from '../types/api';

vi.mock('../services/api', () => ({
  suggestAddresses: vi.fn(),
}));

import { suggestAddresses } from '../services/api';
const mockSuggest = vi.mocked(suggestAddresses);

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(() => {
  vi.useFakeTimers();
  mockSuggest.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSearch(onSelect = vi.fn()) {
  const result = render(
    <I18nextProvider i18n={i18nInstance}>
      <AddressSearch onSelect={onSelect} />
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
    expect(screen.getByPlaceholderText('Paste or type a Dutch address...')).toBeInTheDocument();
  });

  it('does not fetch for queries < 2 chars', async () => {
    renderSearch();
    await typeInto(screen.getByRole('textbox'), 'a');
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it('debounces API calls by 300ms', async () => {
    mockSuggest.mockResolvedValue({ suggestions: [] });
    renderSearch();
    await typeInto(screen.getByRole('textbox'), 'am');

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
    const input = screen.getByRole('textbox');

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
    await typeAndFlush(screen.getByRole('textbox'), 'am');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('calls onSelect and closes dropdown on suggestion click', async () => {
    const response = suggestionsResponse(2);
    mockSuggest.mockResolvedValue(response);
    const { onSelect } = renderSearch();

    await typeAndFlush(screen.getByRole('textbox'), 'am');

    // Use fireEvent.mouseDown because the component uses onMouseDown
    await act(async () => {
      fireEvent.mouseDown(screen.getAllByRole('option')[1]);
    });

    expect(onSelect).toHaveBeenCalledWith(response.suggestions[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('updates input value to selected suggestion display_name', async () => {
    const response = suggestionsResponse(1);
    mockSuggest.mockResolvedValue(response);
    renderSearch();

    await typeAndFlush(screen.getByRole('textbox'), 'am');

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('option'));
    });
    expect(screen.getByRole('textbox')).toHaveValue(response.suggestions[0].display_name);
  });
});

describe('keyboard navigation', () => {
  async function setupWithSuggestions() {
    mockSuggest.mockResolvedValue(suggestionsResponse(3));
    const rendered = renderSearch();
    const input = screen.getByRole('textbox');
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
    mockSuggest.mockRejectedValue(new Error('Network error'));
    renderSearch();
    await typeAndFlush(screen.getByRole('textbox'), 'am');

    expect(screen.getByText('Could not search addresses')).toBeInTheDocument();
  });

  it('ignores AbortError (no error message shown)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockSuggest.mockRejectedValue(abortError);
    renderSearch();
    await typeAndFlush(screen.getByRole('textbox'), 'am');

    expect(screen.queryByText('Could not search addresses')).not.toBeInTheDocument();
  });
});
