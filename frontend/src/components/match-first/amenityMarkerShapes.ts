import type { MatchNeighborhoodAmenityPoint, MatchNeighborhoodAmenityTag } from '../../types/matchFirst';

type AmenityShapeKey =
  | 'triangle'
  | 'square'
  | 'rounded-square'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'bolt'
  | 'wave'
  | 'cross'
  | 'book';

const AMENITY_MARKER_SHAPES: Record<string, AmenityShapeKey> = {
  transit: 'triangle',
  schools: 'square',
  childcare: 'rounded-square',
  parks_green: 'circle',
  parking: 'hexagon',
  ev_charging: 'bolt',
  swimming_water: 'wave',
  daily_shops: 'rounded-square',
  cafes_restaurants: 'circle',
  healthcare: 'cross',
  libraries_culture: 'book',
};

const AMENITY_MARKER_EMOJIS: Record<string, string> = {
  transit: '🚊',
  schools: '🎓',
  childcare: '🧸',
  parks_green: '🌳',
  parking: '🅿️',
  ev_charging: '🔌',
  swimming_water: '💧',
  daily_shops: '🛒',
  cafes_restaurants: '☕',
  healthcare: '➕',
  libraries_culture: '📚',
};

export function amenityMarkerShape(
  amenity: Pick<MatchNeighborhoodAmenityPoint | MatchNeighborhoodAmenityTag, 'amenity_key'>,
): AmenityShapeKey {
  return AMENITY_MARKER_SHAPES[amenity.amenity_key] ?? 'circle';
}

export function amenityMarkerEmoji(
  amenity: Pick<MatchNeighborhoodAmenityPoint | MatchNeighborhoodAmenityTag, 'amenity_key'>,
): string {
  return AMENITY_MARKER_EMOJIS[amenity.amenity_key] ?? '📍';
}
