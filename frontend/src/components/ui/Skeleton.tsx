import type { CSSProperties, HTMLAttributes } from 'react';
import './Skeleton.css';

interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  width?: string;
  height?: string;
}

export default function Skeleton({
  width = '100%',
  height = '14px',
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const skeletonStyle: CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <div
      className={`ui-skeleton ${className}`.trim()}
      style={skeletonStyle}
      aria-hidden="true"
      {...props}
    />
  );
}
