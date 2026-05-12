import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchSimilarResponse } from '../../types/match';
import './MatchSimilarSearch.css';

interface KnownNeighborhood {
  id: string;
  name: string;
}

interface MatchSimilarSearchProps {
  knownNeighborhoods: KnownNeighborhood[];
  response: MatchSimilarResponse | null;
  loading?: boolean;
  errorCode?: string | null;
  onSearch?: (sourceId: string, filters: { cheaper: boolean; greener: boolean; calmer: boolean }) => void;
}

export default function MatchSimilarSearch({
  knownNeighborhoods,
  response,
  loading = false,
  errorCode = null,
  onSearch,
}: MatchSimilarSearchProps) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = useState(knownNeighborhoods[0]?.id ?? '');
  const [filters, setFilters] = useState({ cheaper: true, greener: false, calmer: false });
  const results = useMemo(
    () => [...(response?.results ?? [])].sort((a, b) => b.similarity_score - a.similarity_score),
    [response],
  );

  return (
    <section className="match-similar" aria-labelledby="match-similar-title">
      <header>
        <p>{t('match.similar.eyebrow')}</p>
        <h1 id="match-similar-title">{t('match.similar.title')}</h1>
      </header>

      <div className="match-similar__controls">
        <label>
          {t('match.similar.source')}
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            {knownNeighborhoods.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        {(['cheaper', 'greener', 'calmer'] as const).map((filter) => (
          <label key={filter} className="match-similar__filter">
            <input
              type="checkbox"
              checked={filters[filter]}
              onChange={() => setFilters((current) => ({ ...current, [filter]: !current[filter] }))}
            />
            {t(`match.similar.filter.${filter}`)}
          </label>
        ))}
        <button type="button" onClick={() => onSearch?.(sourceId, filters)}>
          {t('match.similar.search')}
        </button>
      </div>

      {loading && <p role="status">{t('match.similar.loading')}</p>}
      {errorCode && <p role="alert">{t(errorCode)}</p>}
      {!loading && !errorCode && results.length === 0 && (
        <p>{t(response?.empty_state_code ?? 'match.similar.empty')}</p>
      )}

      <ol className="match-similar__results">
        {results.map((result) => (
          <li key={result.neighborhood_id}>
            <article className="match-similar__card">
              <h2>{result.name}</h2>
              <p>{result.municipality}</p>
              <p>{t('match.similar.score', { score: result.similarity_score })}</p>
              <p>{t('match.similar.confidence', { score: result.confidence.score })}</p>
              {result.meaningful_differences.length > 0 && (
                <p>{t('match.similar.differences', {
                  items: result.meaningful_differences.map((item) => item.feature).join(', '),
                })}</p>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
