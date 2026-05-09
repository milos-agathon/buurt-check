import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import RiskDetailView from './RiskDetailView';
import { setupTestI18n } from '../test/helpers';
import type { SeverityLevel } from '../types/api';

// Mock prefers-reduced-motion so AnimatedScore renders values immediately
// (skips IntersectionObserver + requestAnimationFrame animation)
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderDetail(props: Partial<Parameters<typeof RiskDetailView>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RiskDetailView
        category={props.category ?? 'noise'}
        titleKey={props.titleKey ?? 'risk.noise.title'}
        score={'score' in props ? props.score : 59}
        severity={props.severity ?? 'moderate'}
        onBack={props.onBack ?? vi.fn()}
        meaning={props.meaning}
        comparisons={props.comparisons}
        comparisonsError={props.comparisonsError}
        onRetryComparisons={props.onRetryComparisons}
        questions={props.questions}
        source={props.source}
        sourceDate={props.sourceDate}
        confidence={props.confidence}
        limitation={props.limitation}
        warnings={props.warnings}
      />
    </I18nextProvider>,
  );
}

describe('RiskDetailView', () => {
  it('renders the category title in nav', () => {
    const { container } = renderDetail({});
    const navTitle = container.querySelector('.risk-detail__nav-title');
    expect(navTitle?.textContent).toBe('Road Traffic Noise');
  });

  it('displays the numeric score', async () => {
    const { container } = renderDetail({ score: 72, severity: 'good' });
    await waitFor(() => {
      const score = container.querySelector('.risk-detail__score--good');
      expect(score?.textContent).toBe('72/100');
    });
  });

  it('displays -- when score is undefined', () => {
    const { container } = renderDetail({ score: undefined, severity: 'unavailable' as SeverityLevel });
    const score = container.querySelector('.risk-detail__score--unavailable');
    expect(score?.textContent).toBe('--');
  });

  it('fires onBack when back button is clicked', () => {
    const onBack = vi.fn();
    const { container } = renderDetail({ onBack });
    const backBtn = container.querySelector('.risk-detail__back');
    fireEvent.click(backBtn!);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders severity badge', () => {
    const { container } = renderDetail({ severity: 'poor' });
    expect(container.querySelector('.severity-badge')).toBeInTheDocument();
  });

  it('renders meaning section when provided', () => {
    const { container } = renderDetail({ meaning: 'Noise may affect sleep quality.' });
    const meaning = container.querySelector('.risk-detail__meaning');
    expect(meaning?.textContent).toBe('Noise may affect sleep quality.');
  });

  it('does not render meaning section when not provided', () => {
    const { container } = renderDetail({});
    expect(container.querySelector('.risk-detail__meaning')).not.toBeInTheDocument();
  });

  it('renders comparison bars with correct widths', () => {
    const { container } = renderDetail({
      comparisons: [
        { label: 'This address', value: 59, colorKey: 'address' },
        { label: 'Peer baseline (urbanization)', value: 45, colorKey: 'peer' },
        { label: 'WHO limit', value: 70, pattern: 'dashed', colorKey: 'who' },
      ],
    });
    const rows = container.querySelectorAll('.risk-detail__comparison-row');
    expect(rows.length).toBe(3);
    const fills = container.querySelectorAll('.risk-detail__comparison-bar-fill');
    expect((fills[0] as HTMLElement).style.width).toBe('59%');
    expect((fills[2] as HTMLElement).style.width).toBe('70%');
  });

  it('renders dashed pattern for WHO limit', () => {
    const { container } = renderDetail({
      comparisons: [{ label: 'WHO', value: 70, pattern: 'dashed', colorKey: 'who' }],
    });
    expect(container.querySelector('.risk-detail__comparison-bar-fill--dashed')).toBeInTheDocument();
  });

  it('applies color-key class to comparison bar fills', () => {
    const { container } = renderDetail({
      comparisons: [
        { label: 'This address', value: 59, colorKey: 'address' },
        { label: 'Peer baseline (urbanization)', value: 45, colorKey: 'peer' },
        { label: 'National baseline', value: 50, colorKey: 'national' },
        { label: 'WHO limit', value: 70, pattern: 'dashed', colorKey: 'who' },
      ],
    });
    expect(container.querySelector('.risk-detail__comparison-bar-fill--address')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__comparison-bar-fill--peer')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__comparison-bar-fill--national')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__comparison-bar-fill--who')).toBeInTheDocument();
  });

  it('renders legend with only present color keys', () => {
    renderDetail({
      comparisons: [
        { label: 'This address', value: 59, colorKey: 'address' },
        { label: 'Peer baseline (urbanization)', value: 45, colorKey: 'peer' },
      ],
    });
    const legend = screen.getByTestId('comparison-legend');
    expect(legend).toBeInTheDocument();
    expect(legend.querySelectorAll('.risk-detail__legend-item')).toHaveLength(2);
    expect(legend.querySelector('.risk-detail__legend-dot--address')).toBeInTheDocument();
    expect(legend.querySelector('.risk-detail__legend-dot--peer')).toBeInTheDocument();
    expect(legend.querySelector('.risk-detail__legend-dot--who')).not.toBeInTheDocument();
  });

  it('does not group climate and daylight targets under the WHO legend', () => {
    renderDetail({
      comparisons: [
        { label: 'Climate adaptation target', value: 70, pattern: 'dashed', colorKey: 'climate_target' },
        { label: 'Daylight target', value: 67, pattern: 'dashed', colorKey: 'daylight_target' },
      ],
    });
    const legend = screen.getByTestId('comparison-legend');
    expect(legend).toHaveTextContent('Climate adaptation target');
    expect(legend).toHaveTextContent('Daylight target');
    expect(legend).not.toHaveTextContent('WHO guideline');
  });

  it('renders warning limitations when warning codes are present', () => {
    renderDetail({ warnings: ['AIR_PARTIAL'] });
    expect(screen.getByTestId('risk-detail-warnings')).toHaveTextContent(
      'Only partial air quality data is available.',
    );
  });

  it('renders climate warning limitations when climate data is partial', () => {
    renderDetail({ warnings: ['CLIMATE_PARTIAL'] });
    expect(screen.getByTestId('risk-detail-warnings')).toHaveTextContent(
      'Only partial climate stress data is available.',
    );
  });

  it('renders directionality label', () => {
    renderDetail({
      comparisons: [
        { label: 'This address', value: 59, colorKey: 'address' },
      ],
    });
    expect(screen.getByTestId('comparison-directionality')).toBeInTheDocument();
  });

  it('renders comparisons unavailable fallback when rows are missing', () => {
    renderDetail({ comparisons: [] });
    expect(
      screen.getByText('Comparison benchmarks are temporarily unavailable for this address.'),
    ).toBeInTheDocument();
  });

  it('shows comparison retry button and triggers callback when comparisons fail', () => {
    const onRetryComparisons = vi.fn();
    renderDetail({
      comparisons: [],
      comparisonsError: 'Comparison endpoint timeout',
      onRetryComparisons,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Comparison endpoint timeout')).toBeInTheDocument();
    expect(onRetryComparisons).toHaveBeenCalledOnce();
  });

  it('renders the actual viewing questions in the evidence detail', () => {
    const { container } = renderDetail({
      questions: [
        { text_en: 'Can you hear traffic?', text_nl: 'Hoort u verkeer?' },
        { text_en: 'Check ventilation', text_nl: 'Controleer ventilatie' },
      ],
    });
    expect(container.querySelectorAll('.risk-detail__question-item').length).toBe(2);
    expect(screen.getByText('Can you hear traffic?')).toBeInTheDocument();
    expect(screen.getByText('Check ventilation')).toBeInTheDocument();
  });

  it('renders source and disclaimer', () => {
    const { container } = renderDetail({ source: 'RIVM', sourceDate: '2024' });
    expect(container.querySelector('.risk-detail__source')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__disclaimer')).toBeInTheDocument();
  });

  it('renders source date, confidence, and source-specific limitation', () => {
    renderDetail({
      source: 'RIVM geluidkaart',
      sourceDate: '2025-03',
      confidence: 'Indicative',
      limitation: 'Noise contours are modelled and should be checked during the viewing.',
    });

    expect(screen.getAllByText(/RIVM geluidkaart/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2025-03/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Indicative/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Noise contours are modelled/i)).toBeInTheDocument();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderDetail({ category: 'climate' });
    expect(getByTestId('risk-detail-climate')).toBeInTheDocument();
  });
});
