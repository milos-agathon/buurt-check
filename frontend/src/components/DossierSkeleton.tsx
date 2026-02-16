import Skeleton from './ui/Skeleton';
import RiskTileSkeleton from './RiskTileSkeleton';
import StatsSkeleton from './StatsSkeleton';
import './DossierSkeleton.css';

export default function DossierSkeleton() {
  return (
    <div className="dossier-skeleton" data-testid="dossier-skeleton" aria-hidden="true">
      <section className="dossier-skeleton__header">
        <Skeleton width="68%" height="20px" />
        <Skeleton width="44%" height="14px" className="dossier-skeleton__subline" />
      </section>

      <section className="dossier-skeleton__facts">
        <Skeleton width="36%" height="12px" />
        <Skeleton width="100%" height="48px" className="dossier-skeleton__facts-block" />
      </section>

      <RiskTileSkeleton />
      <StatsSkeleton />
    </div>
  );
}
