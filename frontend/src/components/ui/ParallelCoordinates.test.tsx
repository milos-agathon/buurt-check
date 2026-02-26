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

  it('uses CSS class-based series colors instead of inline styles', () => {
    renderChart(
      <ParallelCoordinates
        axes={[
          { key: 'noise', label: 'Noise' },
          { key: 'air', label: 'Air' },
        ]}
        series={[
          { id: 'a', label: 'Address A', values: { noise: 72, air: 65 } },
          { id: 'b', label: 'Address B', values: { noise: 50, air: 60 } },
          { id: 'c', label: 'Address C', values: { noise: 40, air: 70 } },
          { id: 'd', label: 'Address D', values: { noise: 80, air: 55 } },
        ]}
      />,
    );

    // SVG series groups use class-based --series-color, not inline style
    const seriesGroups = document.querySelectorAll('[class*="parallel-coordinates__series--"]');
    expect(seriesGroups).toHaveLength(4);
    expect(seriesGroups[0]).toHaveClass('parallel-coordinates__series--address');
    expect(seriesGroups[1]).toHaveClass('parallel-coordinates__series--city');
    expect(seriesGroups[2]).toHaveClass('parallel-coordinates__series--nl');
    expect(seriesGroups[3]).toHaveClass('parallel-coordinates__series--who');

    // Legend swatches use class-based background, not inline style
    const swatches = document.querySelectorAll('.parallel-coordinates__legend-swatch');
    expect(swatches).toHaveLength(4);
    swatches.forEach((swatch) => {
      expect(swatch).not.toHaveAttribute('style');
    });
    expect(swatches[0]).toHaveClass('parallel-coordinates__legend-swatch--address');
    expect(swatches[1]).toHaveClass('parallel-coordinates__legend-swatch--city');
    expect(swatches[2]).toHaveClass('parallel-coordinates__legend-swatch--nl');
    expect(swatches[3]).toHaveClass('parallel-coordinates__legend-swatch--who');
  });

  it('applies textLength constraint only to labels that exceed available slot width', () => {
    renderChart(
      <ParallelCoordinates
        axes={[
          { key: 'a', label: 'Luchtkwaliteit' },    // 14 chars * 6.5 = 91 > slot width
          { key: 'b', label: 'Air' },                 // 3 chars * 6.5 = 19.5 < slot width
          { key: 'c', label: 'Wegverkeersgeluid' },   // 17 chars * 6.5 = 110.5 > slot width
        ]}
        series={[
          { id: 's1', label: 'Addr', values: { a: 50, b: 60, c: 70 } },
        ]}
      />,
    );

    const labels = document.querySelectorAll('.parallel-coordinates__axis-label');
    expect(labels).toHaveLength(3);

    // Long labels should have textLength attribute
    expect(labels[0]).toHaveAttribute('textLength');
    expect(labels[0]).toHaveAttribute('lengthAdjust', 'spacingAndGlyphs');

    // Short label should NOT have textLength (avoids stretching)
    expect(labels[1]).not.toHaveAttribute('textLength');

    // Long label should have textLength
    expect(labels[2]).toHaveAttribute('textLength');
    expect(labels[2]).toHaveAttribute('lengthAdjust', 'spacingAndGlyphs');
  });

  it('does not apply textLength to short labels', () => {
    renderChart(
      <ParallelCoordinates
        axes={[
          { key: 'noise', label: 'Noise' },
          { key: 'air', label: 'Air' },
        ]}
        series={[
          { id: 's1', label: 'Addr', values: { noise: 50, air: 60 } },
        ]}
      />,
    );

    const labels = document.querySelectorAll('.parallel-coordinates__axis-label');
    expect(labels).toHaveLength(2);
    // Both labels are short — neither should have textLength
    expect(labels[0]).not.toHaveAttribute('textLength');
    expect(labels[1]).not.toHaveAttribute('textLength');
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
