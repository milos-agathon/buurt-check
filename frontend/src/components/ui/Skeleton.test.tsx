import { render, screen } from '@testing-library/react';
import Skeleton from './Skeleton';

describe('ui Skeleton', () => {
  it('renders with provided width and height', () => {
    render(<Skeleton width="60%" height="18px" data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ width: '60%' });
    expect(el).toHaveStyle({ height: '18px' });
  });

  it('is aria-hidden by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
  });
});
