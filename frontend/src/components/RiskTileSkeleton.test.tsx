import { render, screen } from '@testing-library/react';
import RiskTileSkeleton from './RiskTileSkeleton';

describe('RiskTileSkeleton', () => {
  it('renders three placeholder tiles', () => {
    const { container } = render(<RiskTileSkeleton />);
    expect(screen.getByTestId('risk-tile-skeleton')).toBeInTheDocument();
    expect(container.querySelectorAll('.risk-tile-skeleton-card')).toHaveLength(3);
  });
});
