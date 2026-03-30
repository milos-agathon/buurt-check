import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mapApiError, suggestAddresses } from '../services/api';
import { trackEvent } from '../services/analytics';
import { getRecent, addRecent, type RecentSearch } from '../services/recentSearches';
import { isFirstVisit } from '../services/firstVisit';
import type { AddressSuggestion } from '../types/api';
import './AddressSearch.css';

interface Props {
  onSelect: (suggestion: AddressSuggestion) => void;
  shortlistCount?: number;
  onNavigateToSaved?: () => void;
  onNavigateToCompare?: () => void;
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

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleSelect = (
    suggestion: AddressSuggestion,
    source: 'search' | 'recent' | 'example' = 'search',
  ) => {
    setQuery(suggestion.display_name);
    setIsOpen(false);
    setSuggestions([]);
    addRecent({
      id: suggestion.id,
      display_name: suggestion.display_name,
    });
    setRecentSearches(getRecent());
    trackEvent('address_search_submitted', {
      lookup_id: suggestion.id,
      source,
    });
    onSelect(suggestion);
  };

  const handleRecentSelect = (recent: RecentSearch) => {
    const suggestion: AddressSuggestion = {
      id: recent.id,
      display_name: recent.display_name,
      type: 'adres',
      score: 1,
    };
    handleSelect(suggestion, 'recent');
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

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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

  return (
    <div className="address-search" ref={containerRef}>
      <div className="address-search__wrapper">
        <svg className="address-search__pin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        <input
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
        />
        {errorMessage && <p className="address-search__error">{errorMessage}</p>}
        {searching && !isOpen && !errorMessage && (
          <div className="address-search__dropdown" id="address-suggestions">
            <div className="address-search__searching">
              <span className="address-search__searching-dot" />
              {t('search.searching')}
            </div>
          </div>
        )}
        {isOpen && suggestions.length > 0 && (
          <ul className="address-search__dropdown" id="address-suggestions" role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`address-suggestion-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`address-search__item${i === activeIndex ? ' address-search__item--active' : ''}`}
                onMouseDown={() => handleSelect(s)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {s.display_name}
              </li>
            ))}
          </ul>
        )}
        {!searching && hasSettledSuggestions && suggestions.length === 0 && query.length >= 2 && !errorMessage && (
          <div className="address-search__dropdown" id="address-suggestions">
            <div className="address-search__no-results">{t('search.noResults')}</div>
            <div className="address-search__no-results-hint">{t('search.noResultsHint')}</div>
          </div>
        )}
      </div>
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
                  onMouseDown={() => handleRecentSelect(r)}
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
        {!showRecent && recentSearches.length === 0 && !isOpen && query.length < 2 && isFirst && (
          <div className="address-search__value-props" data-testid="value-props">
            <div className="address-search__value-row">
              <span className="address-search__value-icon-circle">
                <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <span className="address-search__value-text">{t('search.valueProp.risk')}</span>
            </div>
            <div className="address-search__value-row">
              <span className="address-search__value-icon-circle">
                <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </span>
              <span className="address-search__value-text">{t('search.valueProp.sunlight')}</span>
            </div>
            <div className="address-search__value-row">
              <span className="address-search__value-icon-circle">
                <svg className="address-search__value-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 14l2 2 4-4" />
                </svg>
              </span>
              <span className="address-search__value-text">{t('search.valueProp.checklist')}</span>
            </div>
            <button
              type="button"
              className="address-search__example-link"
              onClick={() => handleSelect({
                id: 'adr-d3836e3ae5e5c07f18109908abba6dab',
                display_name: 'Keizersgracht 1, 1015CD Amsterdam',
                type: 'adres',
                score: 1,
              }, 'example')}
            >
              {t('search.exampleAddress')}
            </button>
            <p className="address-search__trust-signal">{t('search.trustSignal')}</p>
          </div>
        )}
        {!showRecent && recentSearches.length === 0 && !isOpen && query.length < 2 && !isFirst && (
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
    </div>
  );
}
