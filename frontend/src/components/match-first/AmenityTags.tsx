import { useTranslation } from 'react-i18next';
import type { MatchNeighborhoodAmenityTag } from '../../types/matchFirst';

interface AmenityTagsProps {
  tags: MatchNeighborhoodAmenityTag[];
  loading?: boolean;
  failed?: boolean;
  activeAmenityKey?: string | null;
  onFilterClick?: (tag: MatchNeighborhoodAmenityTag) => void;
}

export default function AmenityTags({
  tags,
  loading = false,
  failed = false,
  activeAmenityKey = null,
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

  return (
    <>
      {activeTag && (
        <p className="amenity-tags__status" role="status">
          {t('matchFirst.neighborhood.activeAmenityFilter', { amenity: t(activeTag.label_key) })}
        </p>
      )}
      <ul className="amenity-tags" aria-label={t('matchFirst.neighborhood.amenitiesLabel')} data-testid="amenity-tags">
        {visibleTags.map((tag) => {
          const reasonKey = `matchFirst.amenity.reason.${tag.reason_code}`;
          const isActive = tag.amenity_key === activeAmenityKey;
          return (
            <li key={tag.amenity_key} className="amenity-tags__item">
              <button
                type="button"
                className={`amenity-tags__button${isActive ? ' amenity-tags__button--active' : ''}`}
                aria-label={t('matchFirst.neighborhood.filterAmenity', { amenity: t(tag.label_key) })}
                aria-pressed={isActive}
                onClick={() => onFilterClick?.(tag)}
              >
                <span className="amenity-tags__label">{t(tag.label_key)}</span>
                <span className="amenity-tags__reason">
                  {i18n.exists(reasonKey) ? t(reasonKey) : t('matchFirst.amenity.reason.default_context')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
