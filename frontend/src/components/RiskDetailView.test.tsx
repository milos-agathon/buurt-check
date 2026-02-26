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
        { label: 'This address', value: 59 },
        { label: 'City avg', value: 45 },
        { label: 'WHO limit', value: 70, pattern: 'dashed' },
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
      comparisons: [{ label: 'WHO', value: 70, pattern: 'dashed' }],
    });
    expect(container.querySelector('.risk-detail__comparison-bar-fill--dashed')).toBeInTheDocument();
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

  it('renders checklist callout instead of inline questions', () => {
    const { container } = renderDetail({
      questions: [
        { text_en: 'Can you hear traffic?', text_nl: 'Hoort u verkeer?' },
        { text_en: 'Check ventilation', text_nl: 'Controleer ventilatie' },
      ],
    });
    const callout = container.querySelector('.risk-detail__checklist-callout');
    expect(callout).toBeInTheDocument();
    expect(container.querySelectorAll('.risk-detail__question-item').length).toBe(0);
  });

  it('renders source and disclaimer', () => {
    const { container } = renderDetail({ source: 'RIVM', sourceDate: '2024' });
    expect(container.querySelector('.risk-detail__source')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__disclaimer')).toBeInTheDocument();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderDetail({ category: 'climate' });
    expect(getByTestId('risk-detail-climate')).toBeInTheDocument();
  });
});
