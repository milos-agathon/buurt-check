import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchMapFeature, MatchMapResponse } from '../../types/match';
import './MatchMap.css';

interface MatchMapProps {
  map: MatchMapResponse | null;
  loading?: boolean;
  errorCode?: string | null;
  onRetry?: () => void;
  onStartSurvey?: () => void;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(1))}%`;
}

function projectPoint(coordinates: [number, number], bounds: number[]) {
  const [lng, lat] = coordinates;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const lngRange = maxLng - minLng || 1;
  const latRange = maxLat - minLat || 1;
  return {
    left: formatPercent(clampPercent(((lng - minLng) / lngRange) * 100)),
    top: formatPercent(clampPercent(((maxLat - lat) / latRange) * 100)),
  };
}

function SourceBadges({ sourceRefs }: { sourceRefs: string[] }) {
  if (sourceRefs.length === 0) return <span>-</span>;
  return (
    <span className="match-map__source-badges">
      {sourceRefs.map((sourceRef) => (
        <span className="match-source-badge" key={sourceRef}>{sourceRef}</span>
      ))}
    </span>
  );
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return compact;
}

export default function MatchMap({
  map,
  loading = false,
  errorCode = null,
  onRetry,
  onStartSurvey,
}: MatchMapProps) {
  const { t } = useTranslation();
  const compact = useCompactLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = map?.features?.find((feature) => feature.properties.neighborhood_id === selectedId)
    ?? map?.features?.[0]
    ?? null;

  if (loading) {
    return (
      <section className="match-map" aria-busy="true">
        <h1>{t('match.map.title')}</h1>
        <p role="status">{t('match.map.loading')}</p>
      </section>
    );
  }

  if (errorCode) {
    return (
      <section className="match-map" role="alert">
        <h1>{t('match.map.title')}</h1>
        <p>{t(errorCode === 'match.warning.map_failed' ? 'match.map.retryableError' : errorCode)}</p>
        {onRetry && (
          <button type="button" className="match-map__action" onClick={onRetry}>
            {t('match.map.retry')}
          </button>
        )}
      </section>
    );
  }

  if (!map) {
    return (
      <section className="match-map">
        <h1>{t('match.map.title')}</h1>
        <p>{t('match.map.finishFirst')}</p>
        <button type="button" className="match-map__action" onClick={onStartSurvey}>
          {t('match.map.goToSurvey')}
        </button>
      </section>
    );
  }

  if (map.features.length === 0) {
    return (
      <section className="match-map">
        <h1>{t('match.map.title')}</h1>
        <p>{t(map?.empty_state_code ?? 'match.map.empty')}</p>
        {map?.missing_coordinates.map((item) => (
          <p key={item.neighborhood_id}>{t('match.map.missingCoordinateItem', { name: item.name })}</p>
        ))}
      </section>
    );
  }

  return (
    <section className="match-map" data-layout={compact ? 'mobile' : 'desktop'} aria-labelledby="match-map-title">
      <header className="match-map__header">
        <p>{t('match.map.eyebrow')}</p>
        <h1 id="match-map-title">{t('match.map.title')}</h1>
        <p className="match-map__method-note">{t('match.map.methodNote')}</p>
      </header>

      <div className="match-map__canvas" role="group" aria-label={t('match.map.canvasLabel')}>
        {map.features.map((feature: MatchMapFeature) => {
          const [lng, lat] = feature.geometry.coordinates;
          return (
            <button
              key={feature.properties.neighborhood_id}
              type="button"
              className="match-map__marker"
              style={projectPoint(feature.geometry.coordinates, map.bounds)}
              data-lng={String(lng)}
              data-lat={String(lat)}
              aria-pressed={selected?.properties.neighborhood_id === feature.properties.neighborhood_id}
              onClick={() => setSelectedId(feature.properties.neighborhood_id)}
            >
              <span>{feature.properties.match_score}</span>
              <small>{feature.properties.name}</small>
            </button>
          );
        })}
      </div>

      <ol className="match-map__ranked-list" aria-label={t('match.map.rankedListLabel')}>
        {map.features.map((feature) => (
          <li key={feature.properties.neighborhood_id}>
            <button
              type="button"
              className="match-map__ranked-button"
              aria-pressed={selected?.properties.neighborhood_id === feature.properties.neighborhood_id}
              aria-label={t('match.map.openFromList', { name: feature.properties.name })}
              onClick={() => setSelectedId(feature.properties.neighborhood_id)}
            >
              <span>{feature.properties.name}</span>
              <strong>{feature.properties.match_score}/100</strong>
            </button>
          </li>
        ))}
      </ol>

      {selected && (
        <aside className="match-map__detail" aria-label={t('match.map.selectedDetails')}>
          <h2>{selected.properties.name}</h2>
          <p>{selected.properties.municipality}</p>
          <dl>
            <div>
              <dt>{t('match.map.matchScore')}</dt>
              <dd>{selected.properties.match_score}/100</dd>
            </div>
            <div>
              <dt>{t('match.map.category')}</dt>
              <dd>{selected.properties.category}</dd>
            </div>
            <div>
              <dt>{t('match.map.confidence')}</dt>
              <dd>{selected.properties.confidence.score}/100</dd>
            </div>
            <div>
              <dt>{t('match.map.sources')}</dt>
              <dd><SourceBadges sourceRefs={selected.properties.source_refs} /></dd>
            </div>
          </dl>
          {selected.properties.missing_data.length > 0 && (
            <p>{t('match.map.missingData', { items: selected.properties.missing_data.join(', ') })}</p>
          )}
        </aside>
      )}

      {map.missing_coordinates.length > 0 && (
        <div className="match-map__notice">
          {map.missing_coordinates.map((item) => (
            <p key={item.neighborhood_id}>{t('match.map.missingCoordinateItem', { name: item.name })}</p>
          ))}
        </div>
      )}
    </section>
  );
}
