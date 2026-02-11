import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
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
) {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <SunlightRiskCard
        sunlight={sunlight}
        loading={loading}
        unavailable={unavailable}
        orientationDeg={orientationDeg}
      />
    </I18nextProvider>,
  );
}

describe('SunlightRiskCard', () => {
  it('shows loading state', () => {
    renderCard(undefined, true);
    expect(screen.getByText('Sunlight Analysis')).toBeInTheDocument();
    expect(screen.getByText('Analyzing sunlight...')).toBeInTheDocument();
  });

  it('renders nothing when no sunlight and not loading', () => {
    const { container } = renderCard(undefined, false);
    expect(container.innerHTML).toBe('');
  });

  it('shows low risk for good winter sunlight', () => {
    renderCard(makeSunlightResult({ winter: 6, equinox: 10, summer: 14 }));
    expect(screen.getByText('Low risk')).toBeInTheDocument();
    expect(screen.getByText(/good direct sunlight/)).toBeInTheDocument();
  });

  it('shows medium risk for moderate winter sunlight', () => {
    renderCard(makeSunlightResult({ winter: 3, equinox: 7, summer: 11 }));
    expect(screen.getByText('Medium risk')).toBeInTheDocument();
    expect(screen.getByText(/moderate direct sunlight/)).toBeInTheDocument();
  });

  it('shows high risk for poor winter sunlight', () => {
    renderCard(makeSunlightResult({ winter: 1, equinox: 5, summer: 9 }));
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(screen.getByText(/very little direct sunlight/)).toBeInTheDocument();
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

  it('shows source', () => {
    renderCard(makeSunlightResult());
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderCard(makeSunlightResult({ winter: 1 }), false, 'nl');
    expect(screen.getByText('Zonlichtanalyse')).toBeInTheDocument();
    expect(screen.getByText('Hoog risico')).toBeInTheDocument();
    expect(screen.getByText(/Vraag de verkoper/)).toBeInTheDocument();
  });

  it('displays annual average', () => {
    renderCard(makeSunlightResult({ annualAverage: 7.5 }));
    expect(screen.getByText('Annual average (daily)')).toBeInTheDocument();
    expect(screen.getByText('7.5 hrs')).toBeInTheDocument();
  });

  it('still uses winter hours for risk classification', () => {
    renderCard(makeSunlightResult({ winter: 1, annualAverage: 8.0 }));
    expect(screen.getByText('High risk')).toBeInTheDocument();
  });

  it('shows full unavailable card structure when no 3D context', () => {
    renderCard(undefined, false, 'en', true);
    expect(screen.getByText('Sunlight Analysis')).toBeInTheDocument();
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
    expect(screen.getByText(/No 3D building context available/)).toBeInTheDocument();
    expect(screen.getByText(/Ask the seller/)).toBeInTheDocument();
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
  });

  it('shows full unavailable card structure in Dutch', () => {
    renderCard(undefined, false, 'nl', true);
    expect(screen.getByText('Zonlichtanalyse')).toBeInTheDocument();
    expect(screen.getByText('Data niet beschikbaar')).toBeInTheDocument();
    expect(screen.getByText(/Geen 3D-gebouwcontext beschikbaar/)).toBeInTheDocument();
    expect(screen.getByText(/Vraag de verkoper/)).toBeInTheDocument();
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
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
