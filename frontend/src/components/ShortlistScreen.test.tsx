import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ShortlistScreen from './ShortlistScreen';
import { setupTestI18n } from '../test/helpers';
import type { ShortlistItem } from '../types/api';
import { vi } from 'vitest';

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

function renderScreen(items: ShortlistItem[] = []) {
  const onRemove = vi.fn();
  const onCompare = vi.fn();
  const onSelectAddress = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <ShortlistScreen items={items} onRemove={onRemove} onCompare={onCompare} onSelectAddress={onSelectAddress} />
    </I18nextProvider>,
  );
  return { onRemove, onCompare, onSelectAddress };
}

describe('ShortlistScreen', () => {
  it('renders empty state when no items', () => {
    renderScreen([]);
    expect(screen.getByText('No saved addresses yet')).toBeInTheDocument();
    expect(screen.getByText(/Bookmark addresses/)).toBeInTheDocument();
  });

  it('renders address cards when items exist', () => {
    renderScreen([makeItem(), makeItem({ vboId: 'vbo-002', address: 'Herengracht 50' })]);
    expect(screen.getByText('Keizersgracht 100')).toBeInTheDocument();
    expect(screen.getByText('Herengracht 50')).toBeInTheDocument();
  });

  it('shows mini risk dots', () => {
    renderScreen([makeItem()]);
    const dots = screen.getByTestId('shortlist-screen').querySelectorAll('.shortlist-screen__dot');
    expect(dots).toHaveLength(4);
  });

  it('compare button disabled with fewer than 2 items', () => {
    renderScreen([makeItem()]);
    expect(screen.getByText('Compare')).toBeDisabled();
  });

  it('compare button enabled with 2+ items', () => {
    renderScreen([makeItem({ vboId: 'a' }), makeItem({ vboId: 'b' })]);
    expect(screen.getByText('Compare')).not.toBeDisabled();
  });

  it('fires onRemove when remove button clicked', () => {
    const { onRemove } = renderScreen([makeItem()]);
    fireEvent.click(screen.getByLabelText('Remove'));
    expect(onRemove).toHaveBeenCalledWith('vbo-001');
  });

  it('fires onCompare when compare button clicked', () => {
    const { onCompare } = renderScreen([makeItem({ vboId: 'a' }), makeItem({ vboId: 'b' })]);
    fireEvent.click(screen.getByText('Compare'));
    expect(onCompare).toHaveBeenCalled();
  });

  it('fires onSelectAddress when card clicked', () => {
    const { onSelectAddress } = renderScreen([makeItem()]);
    fireEvent.click(screen.getByText('Keizersgracht 100'));
    expect(onSelectAddress).toHaveBeenCalledWith('vbo-001');
  });
});
