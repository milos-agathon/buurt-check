import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import CompareScreen from './CompareScreen';
import { setupTestI18n } from '../test/helpers';
import type { ShortlistItem } from '../types/api';
import { vi } from 'vitest';

vi.mock('./ui/SeverityBadge', () => ({
  default: ({ severity }: { severity: string }) => <span data-testid="severity-badge">{severity}</span>,
}));

vi.mock('./ui/ScoreBar', () => ({
  default: ({ score }: { score: number }) => <div data-testid="score-bar" data-score={score} />,
}));

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function makeItem(overrides: Partial<ShortlistItem> = {}): ShortlistItem {
  return {
    vboId: 'vbo-001',
    address: 'Keizersgracht 100',
    postcode: '1015AA',
    city: 'Amsterdam',
    buildingYear: 1895,
    riskScores: { noise: 72, air: 65, climate: 80, sunlight: 55 },
    savedAt: Date.now(),
    ...overrides,
  };
}

function renderCompare(items: ShortlistItem[] = []) {
  const onBack = vi.fn();
  const onSearchAddress = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <CompareScreen items={items} onBack={onBack} onSearchAddress={onSearchAddress} />
    </I18nextProvider>,
  );
  return { onBack, onSearchAddress };
}

describe('CompareScreen', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        writable: true,
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('shows no-data message with fewer than 2 items', () => {
    renderCompare([makeItem()]);
    expect(screen.getByText(/Select 2-3 saved properties/)).toBeInTheDocument();
  });

  it('renders 2 columns for 2 items', () => {
    renderCompare([
      makeItem({ vboId: 'a', address: 'Address A' }),
      makeItem({ vboId: 'b', address: 'Address B' }),
    ]);
    expect(screen.getAllByText('Address A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Address B').length).toBeGreaterThan(0);
  });

  it('renders 3 columns for 3 items', () => {
    renderCompare([
      makeItem({ vboId: 'a', address: 'A' }),
      makeItem({ vboId: 'b', address: 'B' }),
      makeItem({ vboId: 'c', address: 'C' }),
    ]);
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C').length).toBeGreaterThan(0);
  });

  it('renders 4 metric rows', () => {
    renderCompare([
      makeItem({ vboId: 'a' }),
      makeItem({ vboId: 'b' }),
    ]);
    expect(screen.getAllByText('Noise').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Air').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Climate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sun').length).toBeGreaterThan(0);
  });

  it('renders parallel coordinates chart when at least 2 metrics are shown', () => {
    renderCompare([
      makeItem({ vboId: 'a', address: 'Address A' }),
      makeItem({ vboId: 'b', address: 'Address B' }),
    ]);
    expect(screen.getByTestId('parallel-coordinates')).toBeInTheDocument();
  });

  it('highlights best/worst when spread > 15', () => {
    renderCompare([
      makeItem({ vboId: 'a', riskScores: { noise: 80, air: 60, climate: 50, sunlight: 70 } }),
      makeItem({ vboId: 'b', riskScores: { noise: 40, air: 55, climate: 50, sunlight: 70 } }),
    ]);
    const cells = screen.getByTestId('compare-screen').querySelectorAll('.compare-screen__cell');
    expect(Array.from(cells).some((cell) => cell.classList.contains('compare-screen__cell--best'))).toBe(true);
    expect(Array.from(cells).some((cell) => cell.classList.contains('compare-screen__cell--worst'))).toBe(true);
  });

  it('renders horizontal snap columns container', () => {
    renderCompare([
      makeItem({ vboId: 'a' }),
      makeItem({ vboId: 'b' }),
      makeItem({ vboId: 'c' }),
    ]);
    expect(screen.getByTestId('compare-screen').querySelector('.compare-screen__snap-columns')).toBeInTheDocument();
  });

  it('adds keyboard-accessible semantics to snap columns region', () => {
    renderCompare([
      makeItem({ vboId: 'a' }),
      makeItem({ vboId: 'b' }),
    ]);

    const region = screen.getByRole('region', { name: 'Comparison columns' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('supports Arrow/Home/End keyboard navigation with current-column announcement', () => {
    renderCompare([
      makeItem({ vboId: 'a', address: 'Address A' }),
      makeItem({ vboId: 'b', address: 'Address B' }),
      makeItem({ vboId: 'c', address: 'Address C' }),
    ]);

    const region = screen.getByRole('region', { name: 'Comparison columns' });
    expect(screen.getByText('Current column: Address A')).toBeInTheDocument();

    fireEvent.keyDown(region, { key: 'End' });
    expect(screen.getByText('Current column: Address C')).toBeInTheDocument();

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByText('Current column: Address B')).toBeInTheDocument();

    fireEvent.keyDown(region, { key: 'Home' });
    expect(screen.getByText('Current column: Address A')).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('differences-only filter hides equal rows', () => {
    renderCompare([
      makeItem({ vboId: 'a', riskScores: { noise: 50, air: 50, climate: 50, sunlight: 50 } }),
      makeItem({ vboId: 'b', riskScores: { noise: 50, air: 50, climate: 80, sunlight: 50 } }),
    ]);
    fireEvent.click(screen.getByText('Differences only'));
    // Climate has 30-point spread (visible), others are 0 (hidden)
    expect(screen.getAllByText('Climate').length).toBeGreaterThan(0);
    // Noise, Air, Sun should be filtered out
    expect(screen.queryByText('Noise')).not.toBeInTheDocument();
  });

  it('shows filter hint when differences-only is active', () => {
    renderCompare([
      makeItem({ vboId: 'a', riskScores: { noise: 80, air: 60, climate: 50, sunlight: 70 } }),
      makeItem({ vboId: 'b', riskScores: { noise: 40, air: 55, climate: 50, sunlight: 70 } }),
    ]);
    // Hint should not be visible initially
    expect(screen.queryByText(/differ by more than 15 points/)).not.toBeInTheDocument();
    // Activate filter
    fireEvent.click(screen.getByText('Differences only'));
    // Hint should now be visible
    expect(screen.getByText(/differ by more than 15 points/)).toBeInTheDocument();
  });

  it('hides filter hint when differences-only is deactivated', () => {
    renderCompare([
      makeItem({ vboId: 'a', riskScores: { noise: 80, air: 60, climate: 50, sunlight: 70 } }),
      makeItem({ vboId: 'b', riskScores: { noise: 40, air: 55, climate: 50, sunlight: 70 } }),
    ]);
    // Activate then deactivate
    fireEvent.click(screen.getByText('Differences only'));
    expect(screen.getByText(/differ by more than 15 points/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Differences only'));
    expect(screen.queryByText(/differ by more than 15 points/)).not.toBeInTheDocument();
  });

  it('back button fires onBack callback', () => {
    const { onBack } = renderCompare([
      makeItem({ vboId: 'a' }),
      makeItem({ vboId: 'b' }),
    ]);
    fireEvent.click(screen.getByText(/Saved/));
    expect(onBack).toHaveBeenCalled();
  });

  describe('winner summary', () => {
    it('renders summary section with title and caveat', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 80, air: 60, climate: 70, sunlight: 50 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 40, air: 90, climate: 50, sunlight: 60 } }),
      ]);
      expect(screen.getByTestId('compare-summary')).toBeInTheDocument();
      expect(screen.getByText('Overall comparison')).toBeInTheDocument();
      expect(screen.getByText(/Your personal priorities may differ/)).toBeInTheDocument();
    });

    it('shows win counts when one address leads', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 80, air: 70, climate: 90, sunlight: 50 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 40, air: 60, climate: 50, sunlight: 60 } }),
      ]);
      // Address A wins noise, air, climate (3). Address B wins sunlight (1).
      expect(screen.getByText('3 category wins')).toBeInTheDocument();
      expect(screen.getByText('1 category win')).toBeInTheDocument();
    });

    it('highlights the leader row with leader class', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 80, air: 70, climate: 90, sunlight: 50 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 40, air: 60, climate: 50, sunlight: 60 } }),
      ]);
      const rows = screen.getByTestId('compare-summary').querySelectorAll('.compare-screen__summary-row');
      expect(rows).toHaveLength(2);
      // Address A (index 0) is leader
      expect(rows[0].classList.contains('compare-screen__summary-row--leader')).toBe(true);
      // Address B (index 1) is not
      expect(rows[1].classList.contains('compare-screen__summary-row--leader')).toBe(false);
    });

    it('shows tie message when all metrics are equal', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 50, air: 50, climate: 50, sunlight: 50 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 50, air: 50, climate: 50, sunlight: 50 } }),
      ]);
      expect(screen.getByText('Tied overall')).toBeInTheDocument();
      // Should not show individual rows in tie
      expect(screen.getByTestId('compare-summary').querySelectorAll('.compare-screen__summary-row')).toHaveLength(0);
    });

    it('shows tie message when win counts are equal', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 80, air: 40, climate: 70, sunlight: 30 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 40, air: 80, climate: 30, sunlight: 70 } }),
      ]);
      // Each address wins 2 categories — tied overall
      expect(screen.getByText('Tied overall')).toBeInTheDocument();
    });

    it('handles 3 items correctly', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 90, air: 30, climate: 30, sunlight: 30 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 30, air: 90, climate: 30, sunlight: 30 } }),
        makeItem({ vboId: 'c', address: 'Address C', riskScores: { noise: 30, air: 30, climate: 90, sunlight: 90 } }),
      ]);
      // A wins noise (1), B wins air (1), C wins climate + sunlight (2). C leads.
      const rows = screen.getByTestId('compare-summary').querySelectorAll('.compare-screen__summary-row');
      expect(rows).toHaveLength(3);
      // C (index 2) should be the leader
      expect(rows[2].classList.contains('compare-screen__summary-row--leader')).toBe(true);
      expect(rows[0].classList.contains('compare-screen__summary-row--leader')).toBe(false);
      expect(rows[1].classList.contains('compare-screen__summary-row--leader')).toBe(false);
    });

    it('does not count a metric win if scores are tied on that metric', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A', riskScores: { noise: 80, air: 80, climate: 50, sunlight: 50 } }),
        makeItem({ vboId: 'b', address: 'Address B', riskScores: { noise: 80, air: 80, climate: 50, sunlight: 50 } }),
      ]);
      // All metrics tied — no wins for anyone
      expect(screen.getByText('Tied overall')).toBeInTheDocument();
    });

    it('summary appears before the chart in DOM order', () => {
      renderCompare([
        makeItem({ vboId: 'a', address: 'Address A' }),
        makeItem({ vboId: 'b', address: 'Address B' }),
      ]);
      const summary = screen.getByTestId('compare-summary');
      const chart = screen.getByTestId('parallel-coordinates');
      // summary should precede chart in document order
      const position = summary.compareDocumentPosition(chart);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
