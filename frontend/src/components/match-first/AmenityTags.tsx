import { useTranslation } from 'react-i18next';
import type { MatchNeighborhoodAmenityTag } from '../../types/matchFirst';

interface AmenityTagsProps {
  tags: MatchNeighborhoodAmenityTag[];
  loading?: boolean;
  failed?: boolean;
}

export default function AmenityTags({ tags, loading = false, failed = false }: AmenityTagsProps) {
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

  return (
    <ul className="amenity-tags" aria-label={t('matchFirst.neighborhood.amenitiesLabel')} data-testid="amenity-tags">
      {tags.slice(0, 7).map((tag) => {
        const reasonKey = `matchFirst.amenity.reason.${tag.reason_code}`;
        return (
          <li key={tag.amenity_key} className="amenity-tags__item">
            <span className="amenity-tags__label">{t(tag.label_key)}</span>
            <span className="amenity-tags__reason">
              {i18n.exists(reasonKey) ? t(reasonKey) : t('matchFirst.amenity.reason.default_context')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
