import { render, screen } from '@testing-library/react';
import SectionSkeleton, { type SectionSkeletonVariant } from './SectionSkeleton';

describe('SectionSkeleton', () => {
  const variants: SectionSkeletonVariant[] = [
    'building-facts',
    'property-warnings',
    'livability',
    'neighborhood-stats',
  ];

  it.each(variants)('renders %s variant', (variant) => {
    render(<SectionSkeleton variant={variant} />);
    expect(screen.getByTestId(`section-skeleton-${variant}`)).toBeInTheDocument();
  });
});
