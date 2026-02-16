import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestAddresses } from '../services/api';
import { getRecent, addRecent, type RecentSearch } from '../services/recentSearches';
import type { AddressSuggestion } from '../types/api';
import './AddressSearch.css';

interface Props {
  onSelect: (suggestion: AddressSuggestion) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function AddressSearch({ onSelect }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(getRecent());

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await suggestAddresses(q, 7, controller.signal);
      setSuggestions(data.suggestions);
      setIsOpen(data.suggestions.length > 0);
      setActiveIndex(-1);
      setError(false);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(true);
        setSuggestions([]);
        setIsOpen(false);
      }
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setError(false);
      return;
    }

    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSelect = (suggestion: AddressSuggestion) => {
    setQuery(suggestion.display_name);
    setIsOpen(false);
    setSuggestions([]);
    addRecent({
      id: suggestion.id,
      display_name: suggestion.display_name,
    });
    setRecentSearches(getRecent());
    onSelect(suggestion);
  };

  const handleRecentSelect = (recent: RecentSearch) => {
    const suggestion: AddressSuggestion = {
      id: recent.id,
      display_name: recent.display_name,
      type: 'adres',
      score: 1,
    };
    handleSelect(suggestion);
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
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Refresh recent searches when component re-renders (e.g. after settings clear)
  const refreshRecent = useCallback(() => {
    setRecentSearches(getRecent());
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const showRecent = query.length < 2 && !isOpen && recentSearches.length > 0;

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
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          autoComplete="off"
        />
      </div>
      {error && <p className="address-search__error">{t('search.error')}</p>}
      {isOpen && suggestions.length > 0 && (
        <ul className="address-search__dropdown" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
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
      {isOpen && suggestions.length === 0 && query.length >= 2 && !error && (
        <div className="address-search__dropdown">
          <div className="address-search__no-results">{t('search.noResults')}</div>
        </div>
      )}
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
      {!showRecent && recentSearches.length === 0 && !isOpen && query.length < 2 && (
        <div className="address-search__value-props" data-testid="value-props">
          <div className="address-search__value-row">
            <svg className="address-search__value-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <span className="address-search__value-text">{t('search.valueProp.sunlight')}</span>
          </div>
          <div className="address-search__value-row">
            <svg className="address-search__value-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
              <path d="M12 22c4-4 8-7.58 8-12a8 8 0 10-16 0c0 4.42 4 8 8 12z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="address-search__value-text">{t('search.valueProp.risk')}</span>
          </div>
          <div className="address-search__value-row">
            <svg className="address-search__value-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            <span className="address-search__value-text">{t('search.valueProp.checklist')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
