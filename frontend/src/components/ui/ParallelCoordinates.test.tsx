import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import ParallelCoordinates from './ParallelCoordinates';
import { setupTestI18n } from '../../test/helpers';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

function renderChart(ui: ReactNode) {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      {ui}
    </I18nextProvider>,
  );
}

describe('ParallelCoordinates', () => {
  it('renders axes, polylines, and legend entries', () => {
    renderChart(
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
    const { container } = renderChart(
      <ParallelCoordinates
        axes={[{ key: 'noise', label: 'Noise' }]}
        series={[{ id: 'a', label: 'Address A', values: { noise: 60 } }]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('uses translated aria-label and descriptive <desc> with addresses and categories', () => {
    renderChart(
      <ParallelCoordinates
        axes={[
          { key: 'noise', label: 'Noise' },
          { key: 'air', label: 'Air' },
        ]}
        series={[
          { id: 'a', label: 'Address A', values: { noise: 55, air: 61 } },
          { id: 'b', label: 'Address B', values: { noise: 72, air: 48 } },
        ]}
      />,
    );

    const svg = screen.getByRole('img');
    const ariaLabel = svg.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toContain('Address A');
    expect(ariaLabel).toContain('Address B');
    expect(ariaLabel).toContain('Noise');
    expect(ariaLabel).toContain('Air');

    const description = svg.querySelector('desc');
    expect(description).toBeInTheDocument();
    expect(description?.textContent).toContain('Address A');
    expect(description?.textContent).toContain('Address B');
  });
});
