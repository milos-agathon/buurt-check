import { render, screen } from '@testing-library/react';
import StatsSkeleton from './StatsSkeleton';

describe('StatsSkeleton', () => {
  it('renders stats placeholder rows', () => {
    const { container } = render(<StatsSkeleton />);
    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
    expect(container.querySelectorAll('.stats-skeleton__row')).toHaveLength(4);
  });
});
