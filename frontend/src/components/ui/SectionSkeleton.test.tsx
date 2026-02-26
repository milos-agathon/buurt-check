import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionSkeleton from './SectionSkeleton';

describe('SectionSkeleton', () => {
  it('renders building-facts variant with shimmer elements', () => {
    const { container } = render(<SectionSkeleton variant="building-facts" />);
    expect(screen.getByTestId('section-skeleton-building-facts')).toBeInTheDocument();
    expect(container.querySelector('.section-skeleton--building-facts')).toBeInTheDocument();
    // Should have shimmer rectangles (ui-skeleton elements)
    expect(container.querySelectorAll('.ui-skeleton').length).toBeGreaterThan(0);
  });

  it('renders property-warnings variant with warning cards', () => {
    const { container } = render(<SectionSkeleton variant="property-warnings" />);
    expect(screen.getByTestId('section-skeleton-property-warnings')).toBeInTheDocument();
    expect(container.querySelectorAll('.section-skeleton__warning-card')).toHaveLength(2);
  });

  it('renders livability variant with score box and dimensions', () => {
    const { container } = render(<SectionSkeleton variant="livability" />);
    expect(screen.getByTestId('section-skeleton-livability')).toBeInTheDocument();
    expect(container.querySelector('.section-skeleton__score-box')).toBeInTheDocument();
    expect(container.querySelectorAll('.section-skeleton__dimension-row')).toHaveLength(5);
  });

  it('renders neighborhood-stats variant with groups and indicators', () => {
    const { container } = render(<SectionSkeleton variant="neighborhood-stats" />);
    expect(screen.getByTestId('section-skeleton-neighborhood-stats')).toBeInTheDocument();
    expect(container.querySelectorAll('.section-skeleton__ns-group')).toHaveLength(2);
    expect(container.querySelectorAll('.section-skeleton__ns-indicator')).toHaveLength(5);
  });

  it('uses aria-hidden on skeleton content', () => {
    const { container } = render(<SectionSkeleton variant="building-facts" />);
    expect(container.querySelector('.section-skeleton')).toHaveAttribute('aria-hidden', 'true');
  });

  it('supports custom data-testid', () => {
    render(<SectionSkeleton variant="livability" data-testid="custom-skeleton" />);
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
  });
});
