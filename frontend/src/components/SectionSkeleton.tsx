import Skeleton from './ui/Skeleton';

export type SectionSkeletonVariant =
  | 'building-facts'
  | 'property-warnings'
  | 'livability'
  | 'neighborhood-stats';

interface SectionSkeletonProps {
  variant: SectionSkeletonVariant;
}

function BuildingFactsSkeleton() {
  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(84px, 38%) 1fr',
    gap: 'var(--space-base)',
    alignItems: 'center',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <Skeleton width="38%" height="20px" />
      <div style={{ display: 'grid', gap: '6px' }}>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} style={rowStyle}>
            <Skeleton width="84%" height="12px" />
            <Skeleton width="68%" height="12px" />
          </div>
        ))}
      </div>
      <Skeleton width="52%" height="10px" />
    </div>
  );
}

function PropertyWarningsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {[0, 1].map((index) => (
        <article key={index} className="property-warnings__card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
            <Skeleton width="46%" height="16px" />
            <Skeleton width="72px" height="20px" style={{ borderRadius: 'var(--radius-pill)' }} />
          </div>
          <Skeleton width="96%" height="12px" />
          <Skeleton width="84%" height="12px" />
          <Skeleton width="58%" height="10px" />
        </article>
      ))}
    </div>
  );
}

function LivabilitySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <div className="livability-card__header">
        <Skeleton width="56px" height="48px" style={{ borderRadius: 'var(--radius-card)', flexShrink: 0 }} />
        <div className="livability-card__header-text" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Skeleton width="62%" height="14px" />
          <Skeleton width="48%" height="12px" />
        </div>
        <Skeleton width="12px" height="14px" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="livability-card__dimension">
            <Skeleton width="84px" height="12px" />
            <Skeleton width="100%" height="8px" style={{ borderRadius: 'var(--radius-pill)' }} />
            <Skeleton width="30px" height="12px" />
          </div>
        ))}
      </div>

      <div style={{ height: '40px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
        {[0, 1, 2, 3, 4].map((bar) => (
          <Skeleton
            key={bar}
            width="100%"
            height={`${18 + bar * 4}px`}
            style={{ flex: 1, borderRadius: '2px 2px 0 0' }}
          />
        ))}
      </div>
      <Skeleton width="56%" height="10px" />
    </div>
  );
}

function NeighborhoodStatsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <Skeleton width="44%" height="20px" />
      <Skeleton width="58%" height="12px" />
      <Skeleton width="96px" height="20px" style={{ borderRadius: 'var(--radius-pill)' }} />

      {[0, 1, 2].map((group) => (
        <div
          key={group}
          className="neighborhood-card__group"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}
        >
          <Skeleton width="30%" height="11px" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {[0, 1].map((row) => (
              <div key={`${group}-${row}`} className="neighborhood-card__indicator">
                <Skeleton width="42%" height="12px" />
                <Skeleton width="34%" height="12px" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <Skeleton width="100%" height="46px" style={{ borderRadius: 'var(--radius-sm)' }} />
      <Skeleton width="52%" height="10px" />
    </div>
  );
}

export default function SectionSkeleton({ variant }: SectionSkeletonProps) {
  return (
    <div
      className={`section-skeleton section-skeleton--${variant}`}
      data-testid={`section-skeleton-${variant}`}
      aria-hidden="true"
    >
      {variant === 'building-facts' && <BuildingFactsSkeleton />}
      {variant === 'property-warnings' && <PropertyWarningsSkeleton />}
      {variant === 'livability' && <LivabilitySkeleton />}
      {variant === 'neighborhood-stats' && <NeighborhoodStatsSkeleton />}
    </div>
  );
}
