import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import RiskCardsPanel from './RiskCardsPanel';
import { makeRiskCardsResponse, setupTestI18n } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
});

function renderPanel(risks = makeRiskCardsResponse(), loading = false) {
  return render(
    <I18nextProvider i18n={i18nEn}>
      <RiskCardsPanel risks={risks} loading={loading} />
    </I18nextProvider>,
  );
}

describe('RiskCardsPanel', () => {
  it('renders loading state', () => {
    render(
      <I18nextProvider i18n={i18nEn}>
        <RiskCardsPanel loading />
      </I18nextProvider>,
    );
    expect(screen.getByText('Loading risk cards...')).toBeInTheDocument();
  });

  it('renders all F3 cards', () => {
    renderPanel();
    expect(screen.getByText('Road Traffic Noise (Lden)')).toBeInTheDocument();
    expect(screen.getByText('Air Quality (PM2.5 / NO2)')).toBeInTheDocument();
    expect(screen.getByText('Climate Stress (Heat / Water)')).toBeInTheDocument();
  });

  it('renders score, meaning, viewing question, and source+date', () => {
    renderPanel();
    expect(screen.getAllByText(/risk/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Road-traffic noise may be noticeable/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ask\/check at viewing/)).toHaveLength(3);
    expect(screen.getByText(/Source \+ date: RIVM \/ Atlas Leefomgeving WMS/)).toBeInTheDocument();
  });
});
