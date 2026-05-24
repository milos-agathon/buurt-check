import { useTranslation } from 'react-i18next';
import type {
  MatchNeighborhoodAmenityTag,
  MatchNeighborhoodAmenityUnavailable,
} from '../../types/matchFirst';
import { amenityMarkerEmoji, amenityMarkerShape } from './amenityMarkerShapes';

interface AmenityTagsProps {
  tags: MatchNeighborhoodAmenityTag[];
  loading?: boolean;
  failed?: boolean;
  activeAmenityKey?: string | null;
  markerCountsByAmenity?: Record<string, number>;
  unavailableByAmenity?: Record<string, MatchNeighborhoodAmenityUnavailable>;
  onFilterClick?: (tag: MatchNeighborhoodAmenityTag) => void;
}

export default function AmenityTags({
  tags,
  loading = false,
  failed = false,
  activeAmenityKey = null,
  markerCountsByAmenity = {},
  unavailableByAmenity = {},
  onFilterClick,
}: AmenityTagsProps) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return <p className="neighborhood-detail__muted" role="status">{t('matchFirst.neighborhood.amenitiesLoading')}</p>;
  }

  if (failed) {
    return <p className="neighborhood-detail__muted" role="status">{t('matchFirst.neighborhood.amenitiesUnavailable')}</p>;
  }

  if (tags.length === 0) {
    return <p className="neighborhood-detail__muted">{t('matchFirst.neighborhood.amenitiesEmpty')}</p>;
  }

  const visibleTags = tags.slice(0, 7);
  const activeTag = visibleTags.find((tag) => tag.amenity_key === activeAmenityKey) ?? null;
  const markerCount = visibleTags.reduce(
    (total, tag) => total + (markerCountsByAmenity[tag.amenity_key] ?? 0),
    0,
  );

  return (
    <>
      {markerCount === 0 && (
        <p className="amenity-tags__status" role="status">
          {t('matchFirst.neighborhood.amenitiesNoMarkers')}
        </p>
      )}
      {activeTag && (
        <p className="amenity-tags__status" role="status">
          {t('matchFirst.neighborhood.activeAmenityFilter', { amenity: t(activeTag.label_key) })}
        </p>
      )}
      <ul className="amenity-tags" aria-label={t('matchFirst.neighborhood.amenitiesLabel')} data-testid="amenity-tags">
        {visibleTags.map((tag) => {
          const reasonKey = `matchFirst.amenity.reason.${tag.reason_code}`;
          const isActive = tag.amenity_key === activeAmenityKey;
          const markerCountForTag = markerCountsByAmenity[tag.amenity_key] ?? 0;
          const markerShape = amenityMarkerShape(tag);
          const markerEmoji = amenityMarkerEmoji(tag);
          const hasMarkers = markerCountForTag > 0;
          const unavailable = unavailableByAmenity[tag.amenity_key] ?? null;
          const unavailableReasonKey = unavailable?.reason_code;
          const availabilityText = hasMarkers
            ? t('matchFirst.neighborhood.amenityMarkerCount', { count: markerCountForTag })
            : t(
              unavailableReasonKey && i18n.exists(unavailableReasonKey)
                ? unavailableReasonKey
                : 'matchFirst.neighborhood.amenityMarkersUnavailableReason',
            );
          return (
            <li key={tag.amenity_key} className="amenity-tags__item">
              <button
                type="button"
                className={`amenity-tags__button${isActive ? ' amenity-tags__button--active' : ''}`}
                aria-label={t('matchFirst.neighborhood.filterAmenity', { amenity: t(tag.label_key) })}
                aria-pressed={isActive}
                disabled={!hasMarkers}
                onClick={() => onFilterClick?.(tag)}
              >
                <span
                  className="amenity-tags__shape"
                  data-marker-shape={markerShape}
                  data-marker-emoji={markerEmoji}
                  data-empty={hasMarkers ? 'false' : 'true'}
                  data-testid={`amenity-filter-shape-${markerShape}`}
                  aria-hidden="true"
                />
                <span
                  className="amenity-tags__emoji"
                  data-testid={`amenity-filter-emoji-${tag.amenity_key}`}
                  aria-hidden="true"
                >
                  {markerEmoji}
                </span>
                <span className="amenity-tags__label">{t(tag.label_key)}</span>
                <span className="amenity-tags__reason">
                  {i18n.exists(reasonKey) ? t(reasonKey) : t('matchFirst.amenity.reason.default_context')}
                </span>
                <span className="amenity-tags__availability">
                  {availabilityText}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
