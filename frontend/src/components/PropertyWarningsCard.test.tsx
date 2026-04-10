import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import PropertyWarningsCard from './PropertyWarningsCard';
import { setupTestI18n, makePropertyWarningsResponse } from '../test/helpers';
import type { PropertyWarningsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(data?: PropertyWarningsResponse, loading = false, error: string | null = null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PropertyWarningsCard data={data} loading={loading} error={error} />
    </I18nextProvider>,
  );
}

describe('PropertyWarningsCard', () => {
  it('renders nothing when no data and not loading', () => {
    const { container } = renderCard();
    expect(container.querySelector('.property-warnings')).not.toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    renderCard(undefined, true);
    expect(screen.getByTestId('property-warnings')).toBeInTheDocument();
    expect(screen.getByTestId('section-skeleton-property-warnings')).toBeInTheDocument();
  });

  it('shows error state', () => {
    const { container } = renderCard(undefined, false, 'Test error message');
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(container.querySelector('.property-warnings')).toHaveAttribute('data-state', 'error');
  });

  it('renders foundation risk card with high level', () => {
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'high',
        construction_year: 1952,
        soil_type: 'klei',
        subsidence_rate_mm_per_year: 3.2,
        messages: [],
      },
    });
    renderCard(data);
    expect(screen.getByRole('heading', { name: /foundation risk/i })).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.queryByText(/\bhigh\b/i)).not.toBeInTheDocument();
  });

  it('renders a foundation fallback caveat when only municipality fallback data is available', () => {
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'medium',
        construction_year: 1952,
        messages: ['FOUNDATION_NO_SOIL_DATA', 'FOUNDATION_SOFT_SOIL_CITY'],
      },
    });
    renderCard(data);

    expect(screen.getByText(/assessment basis/i)).toBeInTheDocument();
    expect(screen.getByText(/municipality fallback using a documented soft-soil municipality list/i)).toBeInTheDocument();
  });

  it('renders a low year-only fallback instead of hiding the foundation card', () => {
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'low',
        construction_year: 2002,
        messages: ['FOUNDATION_NO_SOIL_DATA', 'FOUNDATION_YEAR_ONLY'],
      },
    });
    renderCard(data);

    expect(screen.getByRole('heading', { name: /foundation risk/i })).toBeInTheDocument();
    expect(screen.getByText(/this low-risk result is based on construction year only/i)).toBeInTheDocument();
  });

  it('renders erfpacht card when detected', () => {
    const data = makePropertyWarningsResponse({
      erfpacht: {
        detected: true,
        confidence: 'municipality_based',
        municipality: 'Amsterdam',
        messages: [],
      },
    });
    renderCard(data);
    expect(screen.getByRole('heading', { name: /erfpacht/i })).toBeInTheDocument();
  });

  it('renders erfpacht municipality-only confidence note when backend provides note code', () => {
    const data = makePropertyWarningsResponse({
      erfpacht: {
        detected: true,
        confidence: 'municipality_based',
        municipality: 'Amsterdam',
        messages: ['ERFPACHT_NOTE_MUNICIPALITY_ONLY'],
      },
    });
    renderCard(data);
    expect(screen.getByText(/data confidence note/i)).toBeInTheDocument();
    expect(screen.getByText(/not confirmed via kadaster for this specific property/i)).toBeInTheDocument();
  });

  it('does not render erfpacht card when not detected', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByRole('heading', { name: /erfpacht/i })).not.toBeInTheDocument();
  });

  it('renders VvE card for apartments', () => {
    const data = makePropertyWarningsResponse({
      vve: { is_apartment: true, num_units: 12, messages: [] },
    });
    renderCard(data);
    expect(screen.getByRole('heading', { name: /VvE/ })).toBeInTheDocument();
  });

  it('does not render VvE card for houses', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByRole('heading', { name: /VvE/ })).not.toBeInTheDocument();
  });

  it('renders asbestos card for pre-1994 buildings', () => {
    const data = makePropertyWarningsResponse({
      asbestos: { flagged: true, construction_year: 1965, messages: [] },
    });
    renderCard(data);
    expect(screen.getByRole('heading', { name: /asbestos/i })).toBeInTheDocument();
  });

  it('does not render asbestos card for post-1993 buildings', () => {
    const data = makePropertyWarningsResponse();
    renderCard(data);
    expect(screen.queryByRole('heading', { name: /asbestos/i })).not.toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    const data = makePropertyWarningsResponse({
      foundation_risk: {
        level: 'high',
        construction_year: 1952,
        soil_type: 'klei',
        messages: [],
      },
    });
    render(
      <I18nextProvider i18n={nlI18n}>
        <PropertyWarningsCard data={data} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('heading', { name: /funderingsrisico/i })).toBeInTheDocument();
    expect(screen.getByText('Slecht')).toBeInTheDocument();
  });
});
