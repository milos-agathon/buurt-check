import { render, screen, fireEvent } from '@testing-library/react';
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
  snapshots = makeShadowSnapshots(),
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
    const { container } = render(
      <I18nextProvider i18n={i18nEn}>
        <ShadowSnapshots loading={false} />
      </I18nextProvider>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders summer-solstice morning, noon, and afternoon snapshots', () => {
    renderSnapshots();
    expect(screen.getByText('Top view (09:00)')).toBeInTheDocument();
    expect(screen.getByText('Top view (12:00)')).toBeInTheDocument();
    expect(screen.getByText('Top view (15:00)')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText(/Summer solstice/)).toBeInTheDocument();
  });

  it('sets correct alt text on images', () => {
    renderSnapshots();
    expect(screen.getByAltText('Top view (09:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Top view (12:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Top view (15:00)')).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderSnapshots(makeShadowSnapshots(), false, 'nl');
    expect(screen.getByText('Schaduwbeelden')).toBeInTheDocument();
    expect(screen.getByText(/Zomerzonnewende/)).toBeInTheDocument();
    expect(screen.getByText('Bovenaanzicht (12:00)')).toBeInTheDocument();
  });

  it('opens and closes the lightbox', () => {
    renderSnapshots();
    fireEvent.click(screen.getAllByRole('button', { name: 'View full size' })[1]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Top view (12:00)').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close full size view' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the lightbox on Escape', () => {
    renderSnapshots();
    fireEvent.click(screen.getAllByRole('button', { name: 'View full size' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
