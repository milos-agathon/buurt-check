import { useState, useRef, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { mapApiError, suggestAddresses } from '../services/api';
import { trackEvent } from '../services/clientEvents';
import { getRecent, type RecentSearch } from '../services/recentSearches';
import { isFirstVisit } from '../services/firstVisit';
import type { AddressSuggestion } from '../types/api';
import SearchEvidencePreview from './SearchEvidencePreview';
import './AddressSearch.css';

interface Props {
  onSelect: (suggestion: AddressSuggestion) => void;
  shortlistCount?: number;
  onNavigateToSaved?: () => void;
  onNavigateToCompare?: () => void;
}

const EXAMPLE_ADDRESS_QUERY = 'Keizersgracht 1, Amsterdam';
const EXAMPLE_ADDRESS_PREFIX = 'keizersgracht 1';

const EVIDENCE_CARD_KEYS = ['topChecks', 'coverage', 'pack'] as const;
type DropdownPlacement = 'below' | 'above';

const EVIDENCE_CARD_ICONS: Record<typeof EVIDENCE_CARD_KEYS[number], ReactNode> = {
  topChecks: (
    <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h11" />
      <path d="M8 12h11" />
      <path d="M8 18h11" />
      <path d="M4.2 6.2l.6.6 1.4-1.6" />
      <path d="M4.2 12.2l.6.6 1.4-1.6" />
      <path d="M4.2 18.2l.6.6 1.4-1.6" />
    </svg>
  ),
  coverage: (
    <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H7a3 3 0 00-3 3V5.5z" />
      <path d="M8 7h7" />
      <path d="M8 11h5" />
      <path d="M7 18h12" />
    </svg>
  ),
  pack: (
    <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  ),
};

function splitSuggestionDisplayName(displayName: string): { primary: string; meta: string } {
  const parts = displayName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { primary: displayName, meta: '' };
  }

  return {
    primary: parts[0],
    meta: parts.slice(1).join(', '),
  };
}

export default function AddressSearch({ onSelect, shortlistCount = 0, onNavigateToSaved, onNavigateToCompare }: Props) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSettledSuggestions, setHasSettledSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(getRecent());
  const [isFirst] = useState(() => isFirstVisit());
  const [dropdownLayout, setDropdownLayout] = useState<{ maxHeight: number | null; placement: DropdownPlacement }>({
    maxHeight: null,
    placement: 'below',
  });

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchWrapperRef = useRef<HTMLElement>(null);
  const requestSeqRef = useRef(0);

  const cancelActiveSearch = useCallback(() => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setSearching(false);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    setSearching(true);
    setErrorMessage(null);
    try {
      const data = await suggestAddresses(q, 7, controller.signal);
      if (requestSeqRef.current !== requestId) return;
      setSuggestions(data.suggestions);
      setIsOpen(data.suggestions.length > 0);
      setActiveIndex(-1);
      setHasSettledSuggestions(true);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort && requestSeqRef.current === requestId) {
        setErrorMessage(mapApiError(err, t));
        setSuggestions([]);
        setIsOpen(false);
        setHasSettledSuggestions(true);
      }
    } finally {
      if (requestSeqRef.current === requestId) {
        abortRef.current = null;
        setSearching(false);
      }
    }
  }, [t]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    cancelActiveSearch();
    setErrorMessage(null);

    if (value.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setActiveIndex(-1);
      setHasSettledSuggestions(false);
      return;
    }

    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setHasSettledSuggestions(false);
    setSearching(true);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSelect = useCallback((
    suggestion: AddressSuggestion,
    source: 'search' | 'recent' | 'example' = 'search',
  ) => {
    setQuery(suggestion.display_name);
    setIsOpen(false);
    setSuggestions([]);
    trackEvent('address_search_submitted', {
      lookup_id: suggestion.id,
      source,
    });
    onSelect(suggestion);
  }, [onSelect]);

  const handleSelectPointerDown = (
    event: React.PointerEvent,
    suggestion: AddressSuggestion,
    source: 'search' | 'recent' | 'example' = 'search',
  ) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    handleSelect(suggestion, source);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleExampleClick = useCallback(async () => {
    cancelActiveSearch();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    setSearching(true);
    setErrorMessage(null);
    setHasSettledSuggestions(false);

    try {
      const data = await suggestAddresses(EXAMPLE_ADDRESS_QUERY, 5, controller.signal);
      if (requestSeqRef.current !== requestId) return;

      const exampleSuggestion = data.suggestions.find((suggestion) =>
        suggestion.display_name.toLowerCase().startsWith(EXAMPLE_ADDRESS_PREFIX),
      );

      if (!exampleSuggestion) {
        setErrorMessage(t('search.noResults'));
        setHasSettledSuggestions(true);
        return;
      }

      handleSelect(exampleSuggestion, 'example');
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort && requestSeqRef.current === requestId) {
        setErrorMessage(mapApiError(err, t));
        setHasSettledSuggestions(true);
      }
    } finally {
      if (requestSeqRef.current === requestId) {
        abortRef.current = null;
        setSearching(false);
      }
    }
  }, [cancelActiveSearch, handleSelect, t]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelActiveSearch();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cancelActiveSearch]);

  // Refresh recent searches when component re-renders (e.g. after settings clear)
  const refreshRecent = useCallback(() => {
    setRecentSearches(getRecent());
  }, []);

  const formatRelativeTime = useCallback((timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('search.recentTime.justNow');
    if (mins < 60) return t('search.recentTime.minutesAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('search.recentTime.hoursAgo', { count: hrs });
    const days = Math.floor(hrs / 24);
    if (days === 1) return t('search.recentTime.yesterday');
    if (days < 7) return t('search.recentTime.daysAgo', { count: days });
    const locale = i18n.language === 'nl' ? 'nl-NL' : 'en-US';
    return new Date(timestamp).toLocaleDateString(locale);
  }, [i18n.language, t]);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const showRecent = query.length < 2 && !isOpen && recentSearches.length > 0;
  const isExpanded = isOpen && suggestions.length > 0;
  const activeSuggestionId = isExpanded && activeIndex >= 0
    ? `address-suggestion-${activeIndex}`
    : undefined;
  const showValueProps = !showRecent && recentSearches.length === 0 && !isOpen && query.length < 2 && isFirst;
  const showWelcomeBack = !showRecent && recentSearches.length === 0 && !isOpen && query.length < 2 && !isFirst;
  const shouldShowDropdown = (
    isExpanded
    || (searching && !isOpen && !errorMessage)
    || (!searching && hasSettledSuggestions && suggestions.length === 0 && query.length >= 2 && !errorMessage)
  );
  const showDesktopEvidencePanel = !showRecent && !showValueProps && !showWelcomeBack;
  const rootClassName = [
    'address-search',
    shouldShowDropdown ? 'address-search--suggesting' : '',
    showDesktopEvidencePanel ? 'address-search--with-desktop-evidence' : '',
  ].filter(Boolean).join(' ');
  const dropdownClassName = `address-search__dropdown${dropdownLayout.placement === 'above' ? ' address-search__dropdown--above' : ''}`;
  const dropdownStyle = dropdownLayout.maxHeight === null
    ? undefined
    : ({ '--address-search-dropdown-max-height': `${dropdownLayout.maxHeight}px` } as CSSProperties);

  useEffect(() => {
    if (!shouldShowDropdown) {
      setDropdownLayout(current => current.maxHeight === null && current.placement === 'below'
        ? current
        : { maxHeight: null, placement: 'below' });
      return;
    }

    const updateDropdownLayout = () => {
      const wrapper = searchWrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const rootStyle = getComputedStyle(document.documentElement);
      const readPxVar = (name: string, fallback: number): number => {
        const value = Number.parseFloat(rootStyle.getPropertyValue(name));
        return Number.isFinite(value) ? value : fallback;
      };
      const tabBarHeight = readPxVar('--tab-bar-height', 56);
      const viewportBottomOffset = readPxVar('--viewport-bottom-offset', 0);
      const isDesktop = window.matchMedia('(min-width: 960px)').matches;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const dropdownGap = 8;
      const navClearance = isDesktop
        ? tabBarHeight + viewportBottomOffset + 36
        : tabBarHeight + viewportBottomOffset + 16;
      const availableBelow = viewportHeight - navClearance - rect.bottom - dropdownGap;
      const availableAbove = rect.top - 16 - dropdownGap;
      const placement: DropdownPlacement = isDesktop && availableBelow < 160 && availableAbove > availableBelow
        ? 'above'
        : 'below';
      const rawAvailable = placement === 'above' ? availableAbove : availableBelow;
      const viewportCap = isDesktop ? 336 : (viewportHeight <= 760 ? 176 : 224);
      const nextMaxHeight = Math.max(72, Math.min(viewportCap, Math.floor(rawAvailable)));

      setDropdownLayout(current => (
        current.maxHeight === nextMaxHeight && current.placement === placement
          ? current
          : { maxHeight: nextMaxHeight, placement }
      ));
    };

    updateDropdownLayout();
    window.addEventListener('resize', updateDropdownLayout);
    window.visualViewport?.addEventListener('resize', updateDropdownLayout);
    return () => {
      window.removeEventListener('resize', updateDropdownLayout);
      window.visualViewport?.removeEventListener('resize', updateDropdownLayout);
    };
  }, [shouldShowDropdown, suggestions.length]);

  return (
    <div className={rootClassName} ref={containerRef}>
      <section className="address-search__hero" aria-labelledby="address-search-title">
        <p className="address-search__eyebrow">{t('search.eyebrow')}</p>
        <h1 className="address-search__title" id="address-search-title" aria-label={t('search.heroTitle')}>
          <span className="address-search__title-line">{t('search.heroTitleLine1')}</span>
          <span className="address-search__title-line">
            <em>{t('search.heroTitleBefore')}</em> {t('search.heroTitleLine2Rest')}
          </span>
        </h1>
        <p className="address-search__subtitle">{t('search.heroSubtitle')}</p>
      </section>

      <section className="address-search__wrapper" aria-labelledby="address-search-input-label" ref={searchWrapperRef}>
        <label className="sr-only" id="address-search-input-label" htmlFor="address-search-input">
          {t('search.inputLabel')}
        </label>
        <div className="address-search__input-shell">
          <svg className="address-search__pin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <input
            id="address-search-input"
            type="text"
            className="address-search__input"
            role="combobox"
            aria-expanded={isExpanded}
            aria-controls="address-suggestions"
            aria-activedescendant={activeSuggestionId}
            aria-autocomplete="list"
            inputMode="search"
            maxLength={200}
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <p className="address-search__input-note">{t('search.inputNote')}</p>
        {errorMessage && <p className="address-search__error">{errorMessage}</p>}
        {searching && !isOpen && !errorMessage && (
          <div className={dropdownClassName} id="address-suggestions" style={dropdownStyle}>
            <div className="address-search__searching">
              <span className="address-search__searching-dot" />
              {t('search.searching')}
            </div>
          </div>
        )}
        {isOpen && suggestions.length > 0 && (
          <ul className={dropdownClassName} id="address-suggestions" role="listbox" style={dropdownStyle}>
            {suggestions.map((s, i) => {
              const display = splitSuggestionDisplayName(s.display_name);
              return (
                <li
                  key={s.id}
                  id={`address-suggestion-${i}`}
                  role="option"
                  aria-label={s.display_name}
                  aria-selected={i === activeIndex}
                  className={`address-search__item address-search__suggestion${i === activeIndex ? ' address-search__item--active address-search__suggestion--active' : ''}`}
                  onPointerDown={event => handleSelectPointerDown(event, s)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className="address-search__item-primary address-search__suggestion-primary">{display.primary}</span>
                  {display.meta && (
                    <span className="address-search__item-meta address-search__suggestion-secondary">{display.meta}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!searching && hasSettledSuggestions && suggestions.length === 0 && query.length >= 2 && !errorMessage && (
          <div className={dropdownClassName} id="address-suggestions" style={dropdownStyle}>
            <div className="address-search__no-results">{t('search.noResults')}</div>
            <div className="address-search__no-results-hint">{t('search.noResultsHint')}</div>
          </div>
        )}
      </section>

      <div className="address-search__below-input">
        {showRecent && (
          <div className="address-search__recent" data-testid="recent-searches">
            <div className="address-search__recent-header">
              <span className="address-search__recent-title">{t('search.recentTitle')}</span>
            </div>
            <ul className="address-search__recent-list">
              {recentSearches.map(r => (
                <li
                  key={r.id}
                  className="address-search__recent-item"
                  onPointerDown={event => handleSelectPointerDown(event, {
                    id: r.id,
                    display_name: r.display_name,
                    type: 'adres',
                    score: 1,
                  }, 'recent')}
                >
                  <svg className="address-search__recent-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span className="address-search__recent-name">{r.display_name}</span>
                  <span className="address-search__recent-time">{formatRelativeTime(r.timestamp)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {showValueProps && (
          <div className="address-search__value-props" data-testid="value-props">
            <div className="address-search__value-header">
              <p className="address-search__panel-label">{t('search.evidencePanelLabel')}</p>
              <h3 className="address-search__panel-title">{t('search.evidencePanelTitle')}</h3>
              <p className="address-search__panel-copy">{t('search.evidencePanelBody')}</p>
            </div>
            <div className="address-search__value-list">
              {EVIDENCE_CARD_KEYS.map((key) => (
                <div className={`address-search__value-row address-search__value-row--${key}`} key={key}>
                  <span className="address-search__value-icon-circle">
                    {EVIDENCE_CARD_ICONS[key]}
                  </span>
                  <span className="address-search__value-content">
                    <span className="address-search__value-text">{t(`search.valueProp.${key}.title`)}</span>
                    <span className="address-search__value-detail">{t(`search.valueProp.${key}.body`)}</span>
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="address-search__example-link"
              onClick={() => {
                void handleExampleClick();
              }}
            >
              {t('search.exampleAddress')}
            </button>
          </div>
        )}
        {showWelcomeBack && (
          <div className="address-search__welcome-back" data-testid="welcome-back">
            <h3 className="address-search__welcome-back-title">{t('search.welcomeBack')}</h3>
            {shortlistCount > 0 && (
              <p className="address-search__welcome-back-saved">
                {t('search.savedCount', { count: shortlistCount })}
              </p>
            )}
            {shortlistCount > 0 && onNavigateToSaved && (
              <button
                type="button"
                className="address-search__welcome-back-action address-search__welcome-back-action--primary"
                onClick={onNavigateToSaved}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
                {t('search.viewSaved')}
              </button>
            )}
            {shortlistCount >= 2 && onNavigateToCompare && (
              <button
                type="button"
                className="address-search__welcome-back-action"
                onClick={onNavigateToCompare}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                {t('search.compareSaved')}
              </button>
            )}
            <p className="address-search__welcome-back-prompt">{t('search.searchAnother')}</p>
          </div>
        )}
      </div>

      {showDesktopEvidencePanel && <SearchEvidencePreview />}
    </div>
  );
}
