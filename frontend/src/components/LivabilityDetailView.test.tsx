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
    { name: 'physical', raw_score: 5, normalized_score: 50, label_code: 'livability.dimension.physical' },
    { name: 'safety', raw_score: 3, normalized_score: 25, label_code: 'livability.dimension.safety' },
    { name: 'social', raw_score: 7, normalized_score: 75, label_code: 'livability.dimension.social' },
    { name: 'amenities', raw_score: 9, normalized_score: 100, label_code: 'livability.dimension.amenities' },
    { name: 'housing', raw_score: 5, normalized_score: 50, label_code: 'livability.dimension.housing' },
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
    dimensions: makeDimensions(),
    trend: [
      { year: '2020', overall_score: 6, overall_normalized: 63, dimensions: [] },
      { year: '2022', overall_score: 7, overall_normalized: 75, dimensions: [] },
      { year: '2024', overall_score: 8, overall_normalized: 88, dimensions: [] },
    ],
    comparison: [
      { level: 'wijk', name: 'Centrum-West', overall_score: 6, overall_normalized: 63, dimensions: [] },
      { level: 'gemeente', name: 'Amsterdam', overall_score: 5, overall_normalized: 50, dimensions: [] },
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
    renderDetail(makeData({ dimensions: [], trend: [{ year: '2024', overall_score: 7, overall_normalized: 75, dimensions: [] }], comparison: [] }));

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
        { year: '2020', overall_score: 6, overall_normalized: 63, dimensions: dims.map((dim) => ({ ...dim, normalized_score: dim.normalized_score - 10 })) },
        { year: '2024', overall_score: 8, overall_normalized: 88, dimensions: dims },
      ],
    }));

    expect(screen.getByTestId('livability-detail-dim-trends').querySelectorAll('.livability-detail__dim-trend-row')).toHaveLength(5);
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
