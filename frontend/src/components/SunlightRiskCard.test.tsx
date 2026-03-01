import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import SunlightRiskCard, { getAxisLabel } from './SunlightRiskCard';
import { setupTestI18n, makeSunlightResult } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderCard(
  sunlight?: ReturnType<typeof makeSunlightResult>,
  loading = false,
  lang: 'en' | 'nl' = 'en',
  unavailable = false,
  orientationDeg?: number,
  showHeatmap = false,
  onToggleHeatmap?: (show: boolean) => void,
  error?: string | null,
  onRetry?: () => void,
) {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <SunlightRiskCard
        sunlight={sunlight}
        loading={loading}
        unavailable={unavailable}
        orientationDeg={orientationDeg}
        showHeatmap={showHeatmap}
        onToggleHeatmap={onToggleHeatmap}
        error={error}
        onRetry={onRetry}
      />
    </I18nextProvider>,
  );
}

describe('SunlightRiskCard', () => {
  it('shows loading state', () => {
    renderCard(undefined, true);
    expect(screen.getByText('Direct sun (clear-sky visibility)')).toBeInTheDocument();
    expect(screen.getByText(/Counts time when the sun is above the horizon/i)).toBeInTheDocument();
    expect(screen.getByText('Analyzing sunlight...')).toBeInTheDocument();
  });

  it('renders nothing when no sunlight and not loading', () => {
    const { container } = renderCard(undefined, false);
    expect(container.innerHTML).toBe('');
  });

  it('shows good severity for score >= 70 (>= 4.2h winter sunlight)', () => {
    renderCard(makeSunlightResult({ winter: 6, equinox: 10, summer: 14 }));
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText(/Adequate direct sunlight year-round/i)).toBeInTheDocument();
  });

  it('shows moderate severity for score 40-69 (~2.4-4.1h winter sunlight)', () => {
    renderCard(makeSunlightResult({ winter: 3, equinox: 7, summer: 11 }));
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText(/Some shadow in winter months/i)).toBeInTheDocument();
  });

  it('shows poor severity for score 20-39 (~1.2-2.3h winter sunlight)', () => {
    renderCard(makeSunlightResult({ winter: 1.5, equinox: 5, summer: 9 }));
    expect(screen.getByText('Poor')).toBeInTheDocument();
    expect(screen.getByText(/Significant shadow from surrounding buildings/i)).toBeInTheDocument();
  });

  it('shows critical severity for score < 20 (< 1.2h winter sunlight)', () => {
    renderCard(makeSunlightResult({ winter: 0.5, equinox: 3, summer: 7 }));
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText(/Heavily shadowed location/i)).toBeInTheDocument();
  });

  it('displays seasonal breakdown', () => {
    renderCard(makeSunlightResult({ winter: 3, equinox: 8, summer: 11, annualAverage: 6.5 }));
    expect(screen.getByText('3 hrs')).toBeInTheDocument();
    expect(screen.getByText('8 hrs')).toBeInTheDocument();
    expect(screen.getByText('11 hrs')).toBeInTheDocument();
    expect(screen.getByText('6.5 hrs')).toBeInTheDocument();
  });

  it('shows viewing tip', () => {
    renderCard(makeSunlightResult());
    expect(screen.getByText(/Ask the seller/)).toBeInTheDocument();
  });

  it('renders all three PRD-mandated disclaimers', () => {
    renderCard(makeSunlightResult());
    expect(screen.getByText(/EN 17037/i)).toBeInTheDocument();
    expect(screen.getByText(/geometry-based estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/interior layout/i)).toBeInTheDocument();
    expect(screen.getByText(/inferred facade and ground proxy points/i)).toBeInTheDocument();
  });

  it('shows source', () => {
    renderCard(makeSunlightResult());
    expect(screen.getByText(/3DBAG.*SunCalc/)).toBeInTheDocument();
  });

  it('renders facade sunlight rows by orientation when available', () => {
    renderCard(makeSunlightResult({
      facadeResults: [
        {
          orientation: 'south',
          heightLabel: '1.5m',
          winterHours: 3.2,
          summerHours: 10.1,
          annualAverage: 6.5,
        },
        {
          orientation: 'north',
          heightLabel: '1.5m',
          winterHours: 0.5,
          summerHours: 4.2,
          annualAverage: 2.1,
        },
      ],
    }));

    expect(screen.getByText(/Window-level sunlight/i)).toBeInTheDocument();
    expect(screen.getByText(/South \(1.5m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/North \(1.5m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/3.2 hrs/)).toBeInTheDocument();
    expect(screen.getByText(/4.2 hrs/)).toBeInTheDocument();
  });

  it('renders ground sunlight aggregate when available', () => {
    renderCard(makeSunlightResult({ groundAnnualAverage: 5.4 }));

    expect(screen.getByText(/Garden\/yard sunlight/i)).toBeInTheDocument();
    expect(screen.getByText('5.4 hrs')).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderCard(makeSunlightResult({ winter: 1 }), false, 'nl');
    expect(screen.getByText('Directe zon (helder weer)')).toBeInTheDocument();
    expect(screen.getByText('Kritiek')).toBeInTheDocument();
    expect(screen.getByText(/Vraag de verkoper/)).toBeInTheDocument();
  });

  it('displays annual average', () => {
    renderCard(makeSunlightResult({ annualAverage: 7.5 }));
    expect(screen.getByText('Annual average (daily)')).toBeInTheDocument();
    expect(screen.getByText('7.5 hrs')).toBeInTheDocument();
  });

  it('renders SVF as open at threshold (>= 0.6)', () => {
    renderCard(makeSunlightResult({ svf: 0.6 }));
    expect(screen.getByText(/Diffuse light/i)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText(/Good sky access/i)).toBeInTheDocument();
  });

  it('renders SVF as moderate at threshold (>= 0.3 and < 0.6)', () => {
    renderCard(makeSunlightResult({ svf: 0.3 }));
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText(/Moderate sky access/i)).toBeInTheDocument();
  });

  it('renders SVF as enclosed below threshold (< 0.3)', () => {
    renderCard(makeSunlightResult({ svf: 0.29 }));
    expect(screen.getByText('29%')).toBeInTheDocument();
    expect(screen.getByText(/Limited sky access/i)).toBeInTheDocument();
  });

  it('renders anisotropic SVF when available', () => {
    renderCard(makeSunlightResult({ svf: 0.6, svfAnisotropic: 0.55 }));
    expect(screen.getByText(/Weighted sky openness/i)).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText(/Accounts for sun position/i)).toBeInTheDocument();
  });

  it('hides anisotropic SVF when not available', () => {
    renderCard(makeSunlightResult({ svf: 0.6 }));
    expect(screen.queryByText(/Weighted sky openness/i)).not.toBeInTheDocument();
  });

  it('shows EN 17037 and TNO benchmarks when equinox data is available', () => {
    renderCard(makeSunlightResult({ equinox: 3.5, winter: 6.2 }));

    expect(screen.getByText(/How does this compare\?/i)).toBeInTheDocument();
    expect(screen.getByText(/EN 17037 "medium"/i)).toBeInTheDocument();
    expect(screen.getByText(/TNO bezonningsnorm "strict \(streng\)"/i)).toBeInTheDocument();
  });

  it('includes benchmark non-compliance disclaimer', () => {
    renderCard(makeSunlightResult({ equinox: 3.5 }));

    expect(
      screen.getByText(/informational comparisons to recognized standards, not compliance claims/i),
    ).toBeInTheDocument();
  });

  it('hides benchmark section when equinox hours are unavailable', () => {
    renderCard(makeSunlightResult({ equinox: Number.NaN as unknown as number }));

    expect(screen.queryByText(/How does this compare\?/i)).not.toBeInTheDocument();
  });

  it('renders irradiance metrics when available', () => {
    renderCard(makeSunlightResult({
      irradianceKwhM2: 948.4,
      irradianceDirectKwhM2: 612.1,
      irradianceDiffuseKwhM2: 336.3,
    }));

    expect(screen.getByText(/Estimated solar irradiance/i)).toBeInTheDocument();
    expect(screen.getByText(/948 kWh\/m²\/yr/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct: 612 kWh\/m²\/yr/i)).toBeInTheDocument();
    expect(screen.getByText(/Diffuse: 336 kWh\/m²\/yr/i)).toBeInTheDocument();
  });

  it('switches geometry disclaimer copy when irradiance is available', () => {
    renderCard(makeSunlightResult({
      irradianceKwhM2: 948.4,
      irradianceDirectKwhM2: 612.1,
      irradianceDiffuseKwhM2: 336.3,
    }));

    expect(screen.getByText(/Irradiance additionally uses PVGIS typical-weather data/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not include clouds, haze, or weather/i)).not.toBeInTheDocument();
  });

  it('hides irradiance section when unavailable', () => {
    renderCard(makeSunlightResult());
    expect(screen.queryByText(/Estimated solar irradiance/i)).not.toBeInTheDocument();
  });

  it('shows heatmap toggle when per-point roof data is available and toggles state', () => {
    const onToggleHeatmap = vi.fn();
    renderCard(
      makeSunlightResult({
        perPointAnnual: [5.1, 7.4],
        roofGridPoints: [[0, 10, 0], [2, 10, -2]],
      }),
      false,
      'en',
      false,
      undefined,
      true,
      onToggleHeatmap,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onToggleHeatmap).toHaveBeenCalledWith(false);
  });

  it('hides heatmap toggle when per-point and roof arrays do not match', () => {
    renderCard(
      makeSunlightResult({
        perPointAnnual: [5.1],
        roofGridPoints: [[0, 10, 0], [2, 10, -2]],
      }),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('still uses winter hours for risk classification', () => {
    renderCard(makeSunlightResult({ winter: 1, annualAverage: 8.0 }));
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('shows full unavailable card structure when no 3D context', () => {
    const { container } = renderCard(undefined, false, 'en', true);
    expect(screen.getByText('Direct sun (clear-sky visibility)')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No 3D building context available/)).toBeInTheDocument();
    expect(screen.getByText(/Ask the seller/)).toBeInTheDocument();
    expect(screen.getByText(/3DBAG.*SunCalc/)).toBeInTheDocument();
    expect(container.querySelector('.sunlight-card')).toHaveAttribute('data-state', 'unavailable');
  });

  it('renders optional error text and retry action in unavailable state', () => {
    const onRetry = vi.fn();
    renderCard(undefined, false, 'en', true, undefined, false, undefined, 'Computation failed', onRetry);
    expect(screen.getByText('Computation failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows full unavailable card structure in Dutch', () => {
    renderCard(undefined, false, 'nl', true);
    expect(screen.getByText('Directe zon (helder weer)')).toBeInTheDocument();
    expect(screen.getByText('Niet beschikbaar')).toBeInTheDocument();
    expect(screen.getByText(/Geen 3D-gebouwcontext beschikbaar/)).toBeInTheDocument();
    expect(screen.getByText(/Vraag de verkoper/)).toBeInTheDocument();
    expect(screen.getByText(/3DBAG.*SunCalc/)).toBeInTheDocument();
  });
});

describe('getAxisLabel', () => {
  it('returns ns for 0 degrees', () => {
    expect(getAxisLabel(0)).toBe('ns');
  });

  it('returns nesw for 45 degrees', () => {
    expect(getAxisLabel(45)).toBe('nesw');
  });

  it('returns ew for 90 degrees', () => {
    expect(getAxisLabel(90)).toBe('ew');
  });

  it('returns senw for 135 degrees', () => {
    expect(getAxisLabel(135)).toBe('senw');
  });

  it('treats 180 as equivalent to 0 (N-S axis)', () => {
    expect(getAxisLabel(180)).toBe('ns');
  });

  it('handles values near boundary (22 degrees = ns)', () => {
    expect(getAxisLabel(22)).toBe('ns');
  });

  it('handles values near boundary (23 degrees = nesw)', () => {
    expect(getAxisLabel(23)).toBe('nesw');
  });
});

describe('SunlightRiskCard orientation', () => {
  it('does not show orientation when orientationDeg is undefined', () => {
    renderCard(makeSunlightResult());
    expect(screen.queryByText(/Estimated building axis/)).not.toBeInTheDocument();
  });

  it('shows orientation when orientationDeg is provided', () => {
    renderCard(makeSunlightResult(), false, 'en', false, 45);
    expect(screen.getByText(/Estimated building axis/)).toBeInTheDocument();
    expect(screen.getByText(/NE — SW/)).toBeInTheDocument();
    expect(screen.getByText(/45°/)).toBeInTheDocument();
  });

  it('shows orientation note when orientation is present', () => {
    renderCard(makeSunlightResult(), false, 'en', false, 90);
    expect(screen.getByText(/Based on building footprint/)).toBeInTheDocument();
  });

  it('renders orientation in Dutch', () => {
    renderCard(makeSunlightResult({ winter: 3 }), false, 'nl', false, 45);
    expect(screen.getByText(/Geschatte gebouwas/)).toBeInTheDocument();
    expect(screen.getByText(/NO — ZW/)).toBeInTheDocument();
  });

  it('does not show orientation in loading state', () => {
    renderCard(undefined, true, 'en', false, 45);
    expect(screen.queryByText(/Estimated building axis/)).not.toBeInTheDocument();
  });
});
