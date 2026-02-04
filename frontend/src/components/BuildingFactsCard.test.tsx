import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import BuildingFactsCard from './BuildingFactsCard';
import { setupTestI18n, makeBuildingFacts } from '../test/helpers';
import type { BuildingFacts } from '../types/api';

let enI18n: Awaited<ReturnType<typeof setupTestI18n>>;
let nlI18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  [enI18n, nlI18n] = await Promise.all([setupTestI18n('en'), setupTestI18n('nl')]);
});

function renderCard(
  building: BuildingFacts | undefined,
  loading: boolean,
  lang: 'en' | 'nl' = 'en',
) {
  const i18n = lang === 'en' ? enI18n : nlI18n;
  return render(
    <I18nextProvider i18n={i18n}>
      <BuildingFactsCard building={building} loading={loading} />
    </I18nextProvider>,
  );
}

describe('loading state', () => {
  it('shows "Loading building facts..." when loading=true', () => {
    renderCard(undefined, true, 'en');
    expect(screen.getByText('Loading building facts...')).toBeInTheDocument();
  });

  it('shows Dutch loading message when lang=nl', () => {
    renderCard(undefined, true, 'nl');
    expect(screen.getByText('Gebouwgegevens laden...')).toBeInTheDocument();
  });
});

describe('empty state', () => {
  it('shows "no building" message when building=undefined, loading=false', () => {
    renderCard(undefined, false, 'en');
    expect(screen.getByText('No building data found for this address.')).toBeInTheDocument();
  });
});

describe('data rendering', () => {
  it('renders all facts when all fields present', () => {
    const building = makeBuildingFacts();
    renderCard(building, false);

    expect(screen.getByText('1875')).toBeInTheDocument();
    expect(screen.getByText('Building in use')).toBeInTheDocument();
    expect(screen.getByText('residential')).toBeInTheDocument();
    expect(screen.getByText('120 m²')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('0363100012345678')).toBeInTheDocument();
  });

  it('omits construction year when undefined', () => {
    renderCard(makeBuildingFacts({ construction_year: undefined }), false);
    expect(screen.queryByText('Construction year')).not.toBeInTheDocument();
  });

  it('omits floor area when null', () => {
    renderCard(makeBuildingFacts({ floor_area_m2: undefined }), false);
    expect(screen.queryByText('Floor area')).not.toBeInTheDocument();
  });

  it('omits units when null', () => {
    renderCard(makeBuildingFacts({ num_units: undefined }), false);
    expect(screen.queryByText('Units in building')).not.toBeInTheDocument();
  });

  it('always shows pand_id', () => {
    renderCard(makeBuildingFacts({ construction_year: undefined, floor_area_m2: undefined, num_units: undefined }), false);
    expect(screen.getByText('Pand ID')).toBeInTheDocument();
    expect(screen.getByText('0363100012345678')).toBeInTheDocument();
  });

  it('shows floor area with m² suffix', () => {
    renderCard(makeBuildingFacts({ floor_area_m2: 85 }), false);
    expect(screen.getByText('85 m²')).toBeInTheDocument();
  });
});

describe('bilingual rendering', () => {
  it('shows status_en in English mode', () => {
    renderCard(makeBuildingFacts({ status: 'Pand in gebruik', status_en: 'Building in use' }), false, 'en');
    expect(screen.getByText('Building in use')).toBeInTheDocument();
  });

  it('shows status (NL) in Dutch mode', () => {
    renderCard(makeBuildingFacts({ status: 'Pand in gebruik', status_en: 'Building in use' }), false, 'nl');
    expect(screen.getByText('Pand in gebruik')).toBeInTheDocument();
  });

  it('falls back to NL status when status_en is undefined', () => {
    renderCard(makeBuildingFacts({ status: 'Pand in gebruik', status_en: undefined }), false, 'en');
    expect(screen.getByText('Pand in gebruik')).toBeInTheDocument();
  });

  it('shows intended_use_en vs intended_use by language', () => {
    const building = makeBuildingFacts({
      intended_use: ['woonfunctie'],
      intended_use_en: ['residential'],
    });

    const { unmount } = renderCard(building, false, 'en');
    expect(screen.getByText('residential')).toBeInTheDocument();
    unmount();

    renderCard(building, false, 'nl');
    expect(screen.getByText('woonfunctie')).toBeInTheDocument();
  });

  it('shows source attribution text', () => {
    renderCard(makeBuildingFacts(), false, 'en');
    expect(screen.getByText('Source: BAG (Kadaster)')).toBeInTheDocument();
  });
});
