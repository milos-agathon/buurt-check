import Skeleton from './ui/Skeleton';
import './StatsSkeleton.css';

export default function StatsSkeleton() {
  return (
    <section className="stats-skeleton" data-testid="stats-skeleton" aria-hidden="true">
      <header className="stats-skeleton__header">
        <Skeleton width="36%" height="16px" />
        <Skeleton width="94px" height="22px" className="stats-skeleton__badge" />
      </header>
      <div className="stats-skeleton__rows">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="stats-skeleton__row">
            <Skeleton width="42%" height="12px" />
            <Skeleton width="26%" height="12px" />
          </div>
        ))}
      </div>
    </section>
  );
}
