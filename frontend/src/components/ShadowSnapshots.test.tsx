import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ShadowSnapshots from './ShadowSnapshots';
import { setupTestI18n, makeShadowSnapshots } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderSnapshots(
  snapshots?: ReturnType<typeof makeShadowSnapshots>,
  loading = false,
  lang: 'en' | 'nl' = 'en',
) {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <ShadowSnapshots snapshots={snapshots} loading={loading} />
    </I18nextProvider>,
  );
}

describe('ShadowSnapshots', () => {
  it('shows loading state', () => {
    renderSnapshots(undefined, true);
    expect(screen.getByText('Shadow Snapshots')).toBeInTheDocument();
    expect(screen.getByText('Capturing shadow views...')).toBeInTheDocument();
  });

  it('renders nothing when no snapshots and not loading', () => {
    const { container } = renderSnapshots(undefined, false);
    expect(container.innerHTML).toBe('');
  });

  it('renders 3 snapshot images with labels', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByText('Morning (9:00)')).toBeInTheDocument();
    expect(screen.getByText('Noon (12:00)')).toBeInTheDocument();
    expect(screen.getByText('Evening (17:00)')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('sets correct alt text on images', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByAltText('Morning (9:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Noon (12:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Evening (17:00)')).toBeInTheDocument();
  });

  it('shows source attribution', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
  });

  it('shows subtitle about winter solstice', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByText(/Winter solstice/)).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderSnapshots(makeShadowSnapshots(), false, 'nl');
    expect(screen.getByText('Schaduwbeelden')).toBeInTheDocument();
    expect(screen.getByText(/Winterzonnewende/)).toBeInTheDocument();
    expect(screen.getByText('Ochtend (9:00)')).toBeInTheDocument();
  });
});
