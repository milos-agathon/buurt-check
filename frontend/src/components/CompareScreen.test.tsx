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
    // Noise spread is 40 → best/worst highlighting
    const noiseCells = Array.from(cells).slice(0, 2);
    expect(noiseCells[0].classList.contains('compare-screen__cell--best')).toBe(true);
    expect(noiseCells[1].classList.contains('compare-screen__cell--worst')).toBe(true);
  });

  it('differences-only filter hides equal rows', () => {
    renderCompare([
      makeItem({ vboId: 'a', riskScores: { noise: 50, air: 50, climate: 50, sunlight: 50 } }),
      makeItem({ vboId: 'b', riskScores: { noise: 50, air: 50, climate: 80, sunlight: 50 } }),
    ]);
    fireEvent.click(screen.getByText('Differences only'));
    // Climate has 30-point spread (visible), others are 0 (hidden)
    expect(screen.getByText('Climate')).toBeInTheDocument();
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
