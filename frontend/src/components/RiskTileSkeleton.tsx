import Skeleton from './ui/Skeleton';
import './RiskTileSkeleton.css';

export default function RiskTileSkeleton() {
  return (
    <div className="risk-tile-skeleton-grid" data-testid="risk-tile-skeleton">
      {[0, 1, 2].map((index) => (
        <article key={index} className="risk-tile-skeleton-card" aria-hidden="true">
          <div className="risk-tile-skeleton-card__score-area">
            <Skeleton width="36px" height="36px" className="risk-tile-skeleton-card__score" />
          </div>
          <div className="risk-tile-skeleton-card__header">
            <Skeleton width="56%" height="12px" className="risk-tile-skeleton-card__label" />
            <Skeleton width="72px" height="22px" className="risk-tile-skeleton-card__badge" />
          </div>
          <Skeleton width="10px" height="14px" className="risk-tile-skeleton-card__chevron" />
        </article>
      ))}
    </div>
  );
}
