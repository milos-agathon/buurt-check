import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SoilInfoCard from './SoilInfoCard';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderCard(props: { leadPipeFlagged?: boolean; constructionYear?: number } = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SoilInfoCard {...props} />
    </I18nextProvider>,
  );
}

describe('SoilInfoCard', () => {
  it('renders card with soil contamination section', () => {
    renderCard();
    expect(screen.getByTestId('soil-info-card')).toBeInTheDocument();
    expect(screen.getByText('Soil Contamination Check')).toBeInTheDocument();
  });

  it('renders Bodemloket link', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /bodemloket/i });
    expect(link).toHaveAttribute('href', 'https://www.bodemloket.nl');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders viewing questions in a collapsible details element', () => {
    renderCard();
    const details = screen.getByTestId('soil-questions');
    expect(details).toBeInTheDocument();
    expect(details.tagName).toBe('DETAILS');
    // Questions are present inside the details
    expect(screen.getByText(/soil investigation/i)).toBeInTheDocument();
    expect(screen.getByText(/underground storage tanks/i)).toBeInTheDocument();
    expect(screen.getByText(/contaminated soil layers/i)).toBeInTheDocument();
  });

  it('renders disclaimer', () => {
    renderCard();
    expect(screen.getByText(/absence of a record/i)).toBeInTheDocument();
  });

  it('shows lead pipe warning when leadPipeFlagged is true', () => {
    renderCard({ leadPipeFlagged: true, constructionYear: 1955 });
    expect(screen.getByTestId('lead-pipe-warning')).toBeInTheDocument();
    expect(screen.getByText(/1955/)).toBeInTheDocument();
  });

  it('does not show lead pipe warning when leadPipeFlagged is false', () => {
    renderCard({ leadPipeFlagged: false });
    expect(screen.queryByTestId('lead-pipe-warning')).not.toBeInTheDocument();
  });

  it('renders without any props', () => {
    renderCard();
    expect(screen.getByTestId('soil-info-card')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-pipe-warning')).not.toBeInTheDocument();
  });

  it('renders in Dutch', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <SoilInfoCard leadPipeFlagged={true} constructionYear={1950} />
      </I18nextProvider>,
    );
    expect(screen.getByText('Loden Leidingen Risico')).toBeInTheDocument();
  });
});
