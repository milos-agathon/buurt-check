import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import LivabilityDetailView from './LivabilityDetailView';
import { setupTestI18n } from '../test/helpers';
import type { LivabilityAvailableResponse, LivabilityDimension } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function makeDimensions(): LivabilityDimension[] {
  return [
    { name: 'physical', raw_score: 5, normalized_score: 50, class_label: 'around average', deviation: 0.0, label_code: 'livability.dimension.physical' },
    { name: 'safety', raw_score: 3, normalized_score: 25, class_label: 'fairly low', deviation: -1.1, label_code: 'livability.dimension.safety' },
    { name: 'social', raw_score: 7, normalized_score: 75, class_label: 'good', deviation: 0.8, label_code: 'livability.dimension.social' },
    { name: 'amenities', raw_score: 9, normalized_score: 100, class_label: 'excellent', deviation: 2.1, label_code: 'livability.dimension.amenities' },
    { name: 'housing', raw_score: 5, normalized_score: 50, class_label: 'around average', deviation: 0.1, label_code: 'livability.dimension.housing' },
  ];
}

function makeData(overrides: Partial<LivabilityAvailableResponse> = {}): LivabilityAvailableResponse {
  return {
    available: true,
    buurt_code: 'BU0363AB10',
    buurt_name: 'Elandsgrachtbuurt',
    gemeente: 'Amsterdam',
    year: '2024',
    overall_score: 7,
    overall_normalized: 75,
    overall_class: 7,
    overall_class_label: 'good',
    overall_deviation: 0.8,
    dimensions: makeDimensions(),
    trend: [
      { year: '2020', overall_score: 6, overall_normalized: 63, overall_class: 6, overall_class_label: 'above average', overall_deviation: 0.4, dimensions: [] },
      { year: '2022', overall_score: 7, overall_normalized: 75, overall_class: 7, overall_class_label: 'good', overall_deviation: 0.7, dimensions: [] },
      { year: '2024', overall_score: 8, overall_normalized: 88, overall_class: 8, overall_class_label: 'very good', overall_deviation: 1.3, dimensions: [] },
    ],
    comparison: [
      { level: 'wijk', name: 'Centrum-West', overall_score: 6, overall_normalized: 63, overall_class: 6, overall_class_label: 'above average', overall_deviation: 0.2, dimensions: [] },
      { level: 'gemeente', name: 'Amsterdam', overall_score: 5, overall_normalized: 50, overall_class: 5, overall_class_label: 'around average', overall_deviation: 0.0, dimensions: [] },
    ],
    source: 'Leefbaarometer 3.0, Ministerie van BZK',
    messages: [],
    ...overrides,
  };
}

function renderDetail(data: LivabilityAvailableResponse, onClose = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LivabilityDetailView data={data} onClose={onClose} />
    </I18nextProvider>,
  );
}

describe('LivabilityDetailView', () => {
  it('renders the main detail sections', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-detail-dimensions')).toBeInTheDocument();
    expect(screen.getByTestId('livability-detail-trend')).toBeInTheDocument();
    expect(screen.getByTestId('livability-detail-comparison')).toBeInTheDocument();
  });

  it('shows unavailable copy for missing subsection data instead of hiding the section', () => {
    renderDetail(makeData({ dimensions: [], trend: [{ year: '2024', overall_score: 7, overall_normalized: 75, overall_class: 7, dimensions: [] }], comparison: [] }));

    expect(screen.getByText('Dimension scores are unavailable for this location.')).toBeInTheDocument();
    expect(screen.getByText('Trend data is unavailable for this location.')).toBeInTheDocument();
    expect(screen.getByText('Comparison data is unavailable for this location.')).toBeInTheDocument();
  });

  it('renders per-dimension trend section with unavailable copy when dimension trends are missing', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-detail-dim-trends')).toBeInTheDocument();
    expect(screen.getByText('Per-dimension trend data is unavailable for this location.')).toBeInTheDocument();
  });

  it('renders all dimension trend rows when trend dimensions exist', () => {
    const dims = makeDimensions();
    renderDetail(makeData({
      trend: [
        { year: '2020', overall_score: 6, overall_normalized: 63, overall_class: 6, dimensions: dims.map((dim) => ({ ...dim, normalized_score: dim.normalized_score - 10 })) },
        { year: '2024', overall_score: 8, overall_normalized: 88, overall_class: 8, dimensions: dims },
      ],
    }));

    expect(screen.getByTestId('livability-detail-dim-trends').querySelectorAll('.livability-detail__dim-trend-row')).toHaveLength(5);
  });

  it('renders municipality legend for gemeente rows instead of NL average', () => {
    renderDetail(makeData());

    const legend = screen.getByTestId('livability-comparison-legend');
    expect(legend).toHaveTextContent('District');
    expect(legend).toHaveTextContent('Municipality');
    expect(legend).not.toHaveTextContent('NL avg.');
  });

  it('describes class 5 dimensions as around average instead of 50/100', () => {
    renderDetail(makeData());

    expect(screen.getByText('Around national average (+0.0)')).toBeInTheDocument();
    expect(screen.queryByText('50/100')).not.toBeInTheDocument();
  });

  it('calls onClose when back button pressed', () => {
    const onClose = vi.fn();
    renderDetail(makeData(), onClose);
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <LivabilityDetailView data={makeData()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/Fysieke omgeving/i)).toBeInTheDocument();
  });
});
