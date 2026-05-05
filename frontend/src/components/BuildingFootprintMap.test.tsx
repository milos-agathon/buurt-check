import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import BuildingFootprintMap from './BuildingFootprintMap';
import { setupTestI18n } from '../test/helpers';
import { resetPrimaryApiBaseTestState, setPrimaryApiBaseTestRuntime } from '../config/apiBase';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(() => {
  vi.unstubAllEnvs();
  resetPrimaryApiBaseTestState();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetPrimaryApiBaseTestState();
});

describe('BuildingFootprintMap', () => {
  it('routes hosted-web aerial tiles through same-origin /api when VITE_API_BASE is cross-origin', () => {
    vi.stubEnv('VITE_API_BASE', 'https://buurt-check.onrender.com/api');
    setPrimaryApiBaseTestRuntime({
      protocol: 'https:',
      hostname: 'app.buurt-check.nl',
      origin: 'https://app.buurt-check.nl',
    });

    render(
      <I18nextProvider i18n={i18nInstance}>
        <BuildingFootprintMap
          lat={52.3676}
          lng={4.8846}
          rdX={121000}
          rdY={487000}
          reportId="report-123"
          footprint={{
            type: 'Polygon',
            coordinates: [[
              [4.8845, 52.3675],
              [4.8847, 52.3675],
              [4.8847, 52.3677],
              [4.8845, 52.3677],
              [4.8845, 52.3675],
            ]],
          }}
        />
      </I18nextProvider>,
    );

    const aerialImage = screen.getByAltText('Aerial photo');
    expect(aerialImage.getAttribute('src')).toContain('/api/address/wms-tile?');
    expect(aerialImage.getAttribute('src')).not.toContain('buurt-check.onrender.com');
  });

  it('labels the overlay as a BAG building footprint, not a selected-unit outline', () => {
    render(
      <I18nextProvider i18n={i18nInstance}>
        <BuildingFootprintMap
          lat={52.3676}
          lng={4.8846}
          rdX={121000}
          rdY={487000}
          footprint={{
            type: 'Polygon',
            coordinates: [[
              [4.8845, 52.3675],
              [4.8847, 52.3675],
              [4.8847, 52.3677],
              [4.8845, 52.3677],
              [4.8845, 52.3675],
            ]],
          }}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText(/Footprint: BAG building outline/)).toBeInTheDocument();
  });
});
