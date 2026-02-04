import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestAddresses } from '../services/api';
import type { AddressSuggestion } from '../types/api';
import './AddressSearch.css';

interface Props {
  onSelect: (suggestion: AddressSuggestion) => void;
}

export default function AddressSearch({ onSelect }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(false);

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
    onSelect(suggestion);
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

  return (
    <div className="address-search" ref={containerRef}>
      <input
        type="text"
        className="address-search__input"
        value={query}
        onChange={e => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('search.placeholder')}
        autoComplete="off"
      />
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
    </div>
  );
}
