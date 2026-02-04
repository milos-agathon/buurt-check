import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SunlightRiskCard from './SunlightRiskCard';
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
) {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <SunlightRiskCard sunlight={sunlight} loading={loading} />
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
});
