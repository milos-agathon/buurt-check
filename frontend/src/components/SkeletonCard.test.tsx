import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonCard, SkeletonLine, SkeletonGrid } from './SkeletonCard';

describe('SkeletonCard', () => {
  it('renders with skeleton-card class', () => {
    render(<SkeletonCard data-testid="skel" />);
    expect(screen.getByTestId('skel')).toHaveClass('skeleton-card');
  });

  it('renders children inside', () => {
    render(<SkeletonCard><span data-testid="child">hi</span></SkeletonCard>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('SkeletonLine', () => {
  it('renders with width prop', () => {
    render(<SkeletonLine width="60%" data-testid="line" />);
    const el = screen.getByTestId('line');
    expect(el).toHaveStyle({ width: '60%' });
  });

  it('defaults to 100% width', () => {
    render(<SkeletonLine data-testid="line" />);
    const el = screen.getByTestId('line');
    expect(el).toHaveStyle({ width: '100%' });
  });
});

describe('SkeletonGrid', () => {
  it('renders 4 skeleton tiles', () => {
    render(<SkeletonGrid />);
    const tiles = screen.getAllByTestId('skeleton-tile');
    expect(tiles).toHaveLength(4);
  });
});
