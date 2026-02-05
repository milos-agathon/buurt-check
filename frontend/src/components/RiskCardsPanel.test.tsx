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

  it('renders "Data unavailable" for unavailable level', () => {
    const risks = makeRiskCardsResponse({
      noise: {
        level: 'unavailable',
        source: 'RIVM / Atlas Leefomgeving WMS',
        source_date: '2019-11-12',
        sampled_at: '2026-02-05',
      },
    });
    renderPanel(risks);
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
  });

  it('renders warning message when present', () => {
    const risks = makeRiskCardsResponse({
      noise: {
        level: 'medium',
        lden_db: 60.5,
        source: 'RIVM / Atlas Leefomgeving WMS',
        source_date: '2019-11-12',
        sampled_at: '2026-02-05',
        message: 'Sampled pixel was outside mapped area',
      },
    });
    renderPanel(risks);
    expect(screen.getByText('Sampled pixel was outside mapped area')).toBeInTheDocument();
  });

  it('renders "Metric unavailable for this location" when lden_db is missing', () => {
    const risks = makeRiskCardsResponse({
      noise: {
        level: 'medium',
        source: 'RIVM / Atlas Leefomgeving WMS',
        source_date: '2019-11-12',
        sampled_at: '2026-02-05',
      },
    });
    renderPanel(risks);
    expect(screen.getByText('Metric unavailable for this location')).toBeInTheDocument();
  });

  it('shows fallback label when source_date is missing', () => {
    const risks = makeRiskCardsResponse({
      climate_stress: {
        level: 'low',
        heat_value: 0.64,
        heat_level: 'low',
        water_value: 1,
        water_level: 'low',
        source: 'Klimaateffectatlas WMS/WFS',
        sampled_at: '2026-02-05',
        // no source_date
      },
    });
    renderPanel(risks);
    expect(screen.getByText(/dataset date unknown/)).toBeInTheDocument();
    expect(screen.getByText(/sampled 2026-02-05/)).toBeInTheDocument();
  });

  it('renders Dutch card titles when language is nl', async () => {
    const i18nNl = await setupTestI18n('nl');
    const risks = makeRiskCardsResponse();
    render(
      <I18nextProvider i18n={i18nNl}>
        <RiskCardsPanel risks={risks} loading={false} />
      </I18nextProvider>,
    );
    expect(screen.getByText('Wegverkeersgeluid (Lden)')).toBeInTheDocument();
    expect(screen.getByText('Luchtkwaliteit (PM2.5 / NO2)')).toBeInTheDocument();
    expect(screen.getByText('Klimaatstress (Hitte / Water)')).toBeInTheDocument();
  });
});
