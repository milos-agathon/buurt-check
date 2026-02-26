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
  it('renders all 5 dimension bars', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-detail-dimensions')).toBeInTheDocument();
    expect(screen.getByText(/physical environment/i)).toBeInTheDocument();
    expect(screen.getByText(/safety/i)).toBeInTheDocument();
    expect(screen.getByText(/social cohesion/i)).toBeInTheDocument();
    expect(screen.getByText(/amenities/i)).toBeInTheDocument();
    expect(screen.getByText(/housing quality/i)).toBeInTheDocument();
  });

  it('renders trend chart', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-detail-trend')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('renders comparison bars', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-detail-comparison')).toBeInTheDocument();
    expect(screen.getByText('Centrum-West')).toBeInTheDocument();
    expect(screen.getByText('Amsterdam')).toBeInTheDocument();
  });

  it('renders comparison legend with color-coded entries', () => {
    renderDetail(makeData());
    const legend = screen.getByTestId('livability-comparison-legend');
    expect(legend).toBeInTheDocument();
    // wijk -> city, gemeente -> nl
    expect(legend.querySelector('.livability-detail__legend-dot--city')).toBeInTheDocument();
    expect(legend.querySelector('.livability-detail__legend-dot--nl')).toBeInTheDocument();
  });

  it('applies color-key class to comparison fills', () => {
    const { container } = renderDetail(makeData());
    expect(container.querySelector('.livability-detail__cmp-fill--city')).toBeInTheDocument();
    expect(container.querySelector('.livability-detail__cmp-fill--nl')).toBeInTheDocument();
  });

  it('renders directionality label in comparison section', () => {
    renderDetail(makeData());
    expect(screen.getByTestId('livability-comparison-directionality')).toBeInTheDocument();
  });

  it('renders source and year', () => {
    renderDetail(makeData());
    expect(screen.getByText(/Leefbaarometer/)).toBeInTheDocument();
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

  it('renders per-dimension trend section when trend points have dimensions', () => {
    const dims = makeDimensions();
    const data = makeData({
      trend: [
        { year: '2020', overall_score: 6, overall_normalized: 63, dimensions: dims.map(d => ({ ...d, normalized_score: d.normalized_score - 10 })) },
        { year: '2022', overall_score: 7, overall_normalized: 75, dimensions: dims },
        { year: '2024', overall_score: 8, overall_normalized: 88, dimensions: dims.map(d => ({ ...d, normalized_score: d.normalized_score + 5 })) },
      ],
    });
    renderDetail(data);
    expect(screen.getByTestId('livability-detail-dim-trends')).toBeInTheDocument();
  });

  it('does not render per-dimension trend section when trend dimensions are empty', () => {
    renderDetail(makeData()); // Default makeData has dimensions: [] in trend points
    expect(screen.queryByTestId('livability-detail-dim-trends')).not.toBeInTheDocument();
  });

  it('renders all 5 dimension labels in per-dimension trend section', () => {
    const dims = makeDimensions();
    const data = makeData({
      trend: [
        { year: '2020', overall_score: 6, overall_normalized: 63, dimensions: dims },
        { year: '2024', overall_score: 8, overall_normalized: 88, dimensions: dims },
      ],
    });
    renderDetail(data);
    const section = screen.getByTestId('livability-detail-dim-trends');
    expect(section).toBeInTheDocument();
    // All 5 dimension names should appear within the section
    expect(section.querySelectorAll('.livability-detail__dim-trend-row')).toHaveLength(5);
  });
});
