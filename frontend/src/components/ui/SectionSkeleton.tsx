import Skeleton from './Skeleton';
import './SectionSkeleton.css';

type Variant = 'building-facts' | 'property-warnings' | 'livability' | 'neighborhood-stats';

interface Props {
  variant: Variant;
  'data-testid'?: string;
}

function BuildingFactsSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--building-facts" aria-hidden="true">
      <Skeleton width="40%" height="18px" />
      <div className="section-skeleton__grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="section-skeleton__row">
            <Skeleton width="80px" height="12px" />
            <Skeleton width="100px" height="12px" />
          </div>
        ))}
      </div>
      <Skeleton width="50%" height="10px" className="section-skeleton__source" />
    </div>
  );
}

function PropertyWarningsSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--property-warnings" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="section-skeleton__warning-card">
          <Skeleton width="48%" height="16px" />
          <Skeleton width="64px" height="20px" className="section-skeleton__badge" />
          <Skeleton width="90%" height="12px" />
          <Skeleton width="70%" height="12px" />
          <Skeleton width="40%" height="10px" className="section-skeleton__source" />
        </div>
      ))}
    </div>
  );
}

function LivabilitySkeleton() {
  return (
    <div className="section-skeleton section-skeleton--livability" aria-hidden="true">
      <div className="section-skeleton__livability-header">
        <Skeleton width="56px" height="48px" className="section-skeleton__score-box" />
        <div className="section-skeleton__livability-text">
          <Skeleton width="60%" height="14px" />
          <Skeleton width="40%" height="12px" />
        </div>
      </div>
      <div className="section-skeleton__dimensions">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="section-skeleton__dimension-row">
            <Skeleton width="80px" height="12px" />
            <div className="section-skeleton__dimension-track">
              <Skeleton width={`${40 + i * 8}%`} height="8px" />
            </div>
            <Skeleton width="24px" height="12px" />
          </div>
        ))}
      </div>
      <Skeleton width="50%" height="10px" className="section-skeleton__source" />
    </div>
  );
}

function NeighborhoodStatsSkeleton() {
  return (
    <div className="section-skeleton section-skeleton--neighborhood-stats" aria-hidden="true">
      <div className="section-skeleton__ns-header">
        <Skeleton width="50%" height="18px" />
        <Skeleton width="30%" height="12px" />
      </div>
      <Skeleton width="72px" height="22px" className="section-skeleton__badge" />
      <div className="section-skeleton__ns-group">
        <Skeleton width="60px" height="10px" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="section-skeleton__ns-indicator">
            <Skeleton width="80px" height="12px" />
            <Skeleton width="60px" height="12px" />
          </div>
        ))}
      </div>
      <div className="section-skeleton__ns-group">
        <Skeleton width="60px" height="10px" />
        {[0, 1].map((i) => (
          <div key={i} className="section-skeleton__ns-indicator">
            <Skeleton width="80px" height="12px" />
            <Skeleton width="60px" height="12px" />
          </div>
        ))}
      </div>
      <Skeleton width="50%" height="10px" className="section-skeleton__source" />
    </div>
  );
}

const VARIANTS = {
  'building-facts': BuildingFactsSkeleton,
  'property-warnings': PropertyWarningsSkeleton,
  'livability': LivabilitySkeleton,
  'neighborhood-stats': NeighborhoodStatsSkeleton,
} satisfies Record<Variant, () => ReturnType<typeof BuildingFactsSkeleton>>;

export default function SectionSkeleton({ variant, 'data-testid': testId }: Props) {
  const Component = VARIANTS[variant];
  return (
    <div data-testid={testId || `section-skeleton-${variant}`}>
      <Component />
    </div>
  );
}
