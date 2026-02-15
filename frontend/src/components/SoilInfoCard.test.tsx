import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SoilInfoCard from './SoilInfoCard';
import { setupTestI18n, makePropertyWarningsResponse } from '../test/helpers';
import type { PropertyWarningsResponse } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(warnings?: PropertyWarningsResponse) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SoilInfoCard warnings={warnings} />
    </I18nextProvider>,
  );
}

describe('SoilInfoCard', () => {
  it('renders card with soil contamination section', () => {
    renderCard(makePropertyWarningsResponse());
    expect(screen.getByTestId('soil-info-card')).toBeInTheDocument();
    expect(screen.getByText('Soil Contamination')).toBeInTheDocument();
  });

  it('renders Bodemloket link', () => {
    renderCard(makePropertyWarningsResponse());
    const link = screen.getByRole('link', { name: /bodemloket/i });
    expect(link).toHaveAttribute('href', 'https://www.bodemloket.nl');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows lead pipe warning for pre-1960 building', () => {
    const data = makePropertyWarningsResponse({
      lead_pipe: { flagged: true, construction_year: 1955, messages: ['LEAD_PIPE_PRE_1960'] },
    });
    renderCard(data);
    expect(screen.getByTestId('lead-pipe-warning')).toBeInTheDocument();
    expect(screen.getByText(/1955/)).toBeInTheDocument();
  });

  it('does not show lead pipe warning for post-1960 building', () => {
    const data = makePropertyWarningsResponse({
      lead_pipe: { flagged: false, messages: [] },
    });
    renderCard(data);
    expect(screen.queryByTestId('lead-pipe-warning')).not.toBeInTheDocument();
  });

  it('renders without warnings prop', () => {
    renderCard();
    expect(screen.getByTestId('soil-info-card')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-pipe-warning')).not.toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <SoilInfoCard warnings={makePropertyWarningsResponse({
          lead_pipe: { flagged: true, construction_year: 1950, messages: ['LEAD_PIPE_PRE_1960'] },
        })} />
      </I18nextProvider>,
    );
    expect(screen.getByText('Loden Leidingen Risico')).toBeInTheDocument();
  });
});
