import Skeleton from './ui/Skeleton';
import './RiskTileSkeleton.css';

export default function RiskTileSkeleton() {
  return (
    <div className="risk-tile-skeleton-grid" data-testid="risk-tile-skeleton">
      {[0, 1, 2, 3].map((index) => (
        <article key={index} className="risk-tile-skeleton-card" aria-hidden="true">
          <div className="risk-tile-skeleton-card__header">
            <Skeleton width="42%" height="12px" />
            <Skeleton width="72px" height="22px" className="risk-tile-skeleton-card__badge" />
          </div>
          <Skeleton width="58px" height="46px" className="risk-tile-skeleton-card__score" />
          <Skeleton width="100%" height="8px" className="risk-tile-skeleton-card__bar" />
          <Skeleton width="78%" height="12px" className="risk-tile-skeleton-card__summary" />
        </article>
      ))}
    </div>
  );
}
