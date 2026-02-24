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
  render(
    <I18nextProvider i18n={i18n}>
      <CompareScreen items={items} onBack={onBack} />
    </I18nextProvider>,
  );
  return { onBack };
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
    expect(screen.getByText(/Select 2-3 saved addresses/)).toBeInTheDocument();
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

  it('back button fires onBack callback', () => {
    const { onBack } = renderCompare([
      makeItem({ vboId: 'a' }),
      makeItem({ vboId: 'b' }),
    ]);
    fireEvent.click(screen.getByText(/Saved/));
    expect(onBack).toHaveBeenCalled();
  });
});
