import './SkeletonCard.css';

interface SkeletonCardProps {
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function SkeletonCard({ children, ...props }: SkeletonCardProps) {
  return (
    <div className="skeleton-card" {...props}>
      {children || (
        <>
          <SkeletonLine width="40%" className="skeleton-line--lg" />
          <SkeletonLine width="70%" />
          <SkeletonLine width="55%" />
        </>
      )}
    </div>
  );
}

interface SkeletonLineProps {
  width?: string;
  className?: string;
  'data-testid'?: string;
}

export function SkeletonLine({ width = '100%', className = '', ...props }: SkeletonLineProps) {
  return <div className={`skeleton-line ${className}`} style={{ width }} {...props} />;
}

export function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-tile" data-testid="skeleton-tile" />
      ))}
    </div>
  );
}
