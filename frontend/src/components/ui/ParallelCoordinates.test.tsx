import { render, screen } from '@testing-library/react';
import ParallelCoordinates from './ParallelCoordinates';

describe('ParallelCoordinates', () => {
  it('renders axes, polylines, and legend entries', () => {
    render(
      <ParallelCoordinates
        axes={[
          { key: 'noise', label: 'Noise' },
          { key: 'air', label: 'Air' },
          { key: 'climate', label: 'Climate' },
        ]}
        series={[
          {
            id: 'a',
            label: 'Address A',
            values: { noise: 72, air: 65, climate: 55 },
          },
          {
            id: 'b',
            label: 'Address B',
            values: { noise: 50, air: 60, climate: 80 },
          },
        ]}
      />,
    );

    expect(screen.getByTestId('parallel-coordinates')).toBeInTheDocument();
    expect(screen.getByText('Noise')).toBeInTheDocument();
    expect(screen.getByText('Air')).toBeInTheDocument();
    expect(screen.getByText('Climate')).toBeInTheDocument();
    expect(screen.getByText('Address A')).toBeInTheDocument();
    expect(screen.getByText('Address B')).toBeInTheDocument();
    expect(document.querySelectorAll('.parallel-coordinates__line')).toHaveLength(2);
  });

  it('renders nothing when fewer than two axes are provided', () => {
    const { container } = render(
      <ParallelCoordinates
        axes={[{ key: 'noise', label: 'Noise' }]}
        series={[{ id: 'a', label: 'Address A', values: { noise: 60 } }]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
