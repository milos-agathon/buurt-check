import { render, screen } from '@testing-library/react';
import DossierSkeleton from './DossierSkeleton';

describe('DossierSkeleton', () => {
  it('renders composed skeleton sections', () => {
    const { container } = render(<DossierSkeleton />);
    expect(screen.getByTestId('dossier-skeleton')).toBeInTheDocument();
    expect(container.querySelector('.risk-tile-skeleton-grid')).toBeInTheDocument();
    expect(container.querySelector('.stats-skeleton')).toBeInTheDocument();
  });
});
