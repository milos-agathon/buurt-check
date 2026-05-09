import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import RiskTilesGrid from './RiskTilesGrid';
import { makeRiskCardsResponse, setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderGrid() {
  const base = makeRiskCardsResponse();
  return render(
    <I18nextProvider i18n={i18n}>
      <RiskTilesGrid
        risks={makeRiskCardsResponse({
          noise: {
            ...base.noise,
            score: 46,
            summary: 'Moderate traffic noise',
          },
          air_quality: {
            ...base.air_quality,
            score: 84,
            level: 'low',
            summary: 'Good air quality',
          },
          climate_stress: {
            ...base.climate_stress,
            score: 15,
            level: 'high',
            summary: 'Critical climate exposure',
          },
          sunlight: {
            score: 100,
            severity: 'good',
            summary: 'Good direct sunlight',
          },
        })}
      />
    </I18nextProvider>,
  );
}

describe('RiskTilesGrid', () => {
  it('renders only the free frontend risk cards and omits sunlight', () => {
    renderGrid();

    expect(screen.getByTestId('risk-tile-noise')).toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-air')).toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-climate')).toBeInTheDocument();
    expect(screen.queryByTestId('risk-tile-sunlight')).not.toBeInTheDocument();
  });

  it('shows consequence summaries inside the tiles', () => {
    renderGrid();

    expect(screen.getByText('Moderate traffic noise')).toBeInTheDocument();
    expect(screen.getByText('Good air quality')).toBeInTheDocument();
    expect(screen.getByText('Critical climate exposure')).toBeInTheDocument();
  });

  it('surfaces partial-data warnings on affected tiles', () => {
    const base = makeRiskCardsResponse();
    render(
      <I18nextProvider i18n={i18n}>
        <RiskTilesGrid
          risks={makeRiskCardsResponse({
            air_quality: {
              ...base.air_quality,
              score: 84,
              level: 'low',
              warnings: ['AIR_PARTIAL'],
            },
          })}
        />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('risk-tile-warning-air')).toHaveTextContent(
      'Only partial air quality data is available.',
    );
  });

  it('does not render a sunlight placeholder when sunlight data is unavailable', () => {
    const base = makeRiskCardsResponse();
    render(
      <I18nextProvider i18n={i18n}>
        <RiskTilesGrid
          risks={makeRiskCardsResponse({
            noise: base.noise,
            air_quality: base.air_quality,
            climate_stress: base.climate_stress,
            sunlight: undefined,
          })}
        />
      </I18nextProvider>,
    );

    expect(screen.queryByTestId('risk-tile-sunlight')).not.toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-noise')).toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-air')).toBeInTheDocument();
    expect(screen.getByTestId('risk-tile-climate')).toBeInTheDocument();
  });
});
