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
    expect(screen.getByText('Top view (12:00)')).toBeInTheDocument();
    expect(screen.getByText('Front facade (12:00)')).toBeInTheDocument();
    expect(screen.getByText('Rear facade (12:00)')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('sets correct alt text on images', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByAltText('Top view (12:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Front facade (12:00)')).toBeInTheDocument();
    expect(screen.getByAltText('Rear facade (12:00)')).toBeInTheDocument();
  });

  it('shows source attribution', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByText(/3DBAG.*SunCalc/)).toBeInTheDocument();
  });

  it('shows subtitle about summer solstice', () => {
    renderSnapshots(makeShadowSnapshots());
    expect(screen.getByText(/Summer solstice/)).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderSnapshots(makeShadowSnapshots(), false, 'nl');
    expect(screen.getByText('Schaduwbeelden')).toBeInTheDocument();
    expect(screen.getByText(/Zomerzonnewende/)).toBeInTheDocument();
    expect(screen.getByText('Bovenaanzicht (12:00)')).toBeInTheDocument();
  });

  it('uses viewpoint labels and actual hours for six-panel snapshots', () => {
    renderSnapshots([
      { label: 'top_morning', hour: 9, dataUrl: 'data:image/png;base64,top', viewpoint: 'top' },
      { label: 'front_morning', hour: 9, dataUrl: 'data:image/png;base64,front', viewpoint: 'front' },
      { label: 'rear_afternoon', hour: 15, dataUrl: 'data:image/png;base64,rear', viewpoint: 'rear' },
    ]);

    expect(screen.getByText('Top view (09:00)')).toBeInTheDocument();
    expect(screen.getByText('Front facade (09:00)')).toBeInTheDocument();
    expect(screen.getByText('Rear facade (15:00)')).toBeInTheDocument();
  });

  it('thumbnail buttons have accessible label', () => {
    renderSnapshots(makeShadowSnapshots());
    const buttons = screen.getAllByRole('button', { name: 'View full size' });
    expect(buttons).toHaveLength(3);
  });

  describe('Lightbox', () => {
    it('opens lightbox when thumbnail is clicked', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });
      fireEvent.click(buttons[0]);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      const lightboxLabels = screen.getAllByText('Top view (12:00)');
      // One in the grid, one in the lightbox
      expect(lightboxLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('shows correct image in lightbox for each snapshot', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });

      // Click the front facade thumbnail (index 1)
      fireEvent.click(buttons[1]);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const lightboxLabels = screen.getAllByText('Front facade (12:00)');
      expect(lightboxLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('close button dismisses lightbox', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });
      fireEvent.click(buttons[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: 'Close full size view' });
      fireEvent.click(closeButton);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Escape key dismisses lightbox', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });
      fireEvent.click(buttons[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('backdrop click dismisses lightbox', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });
      fireEvent.click(buttons[0]);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Click the backdrop (the dialog overlay itself)
      fireEvent.click(dialog);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clicking lightbox content does not dismiss', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });
      fireEvent.click(buttons[0]);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Click the image inside the lightbox
      const lightboxImg = dialog.querySelector('.shadow-snapshots__lightbox-img');
      expect(lightboxImg).not.toBeNull();
      fireEvent.click(lightboxImg!);

      // Dialog should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('lightbox shows correct label for rear snapshot', () => {
      renderSnapshots(makeShadowSnapshots());
      const buttons = screen.getAllByRole('button', { name: 'View full size' });

      // Click the rear thumbnail (index 2)
      fireEvent.click(buttons[2]);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const lightboxLabels = screen.getAllByText('Rear facade (12:00)');
      expect(lightboxLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('lightbox works in Dutch', () => {
      renderSnapshots(makeShadowSnapshots(), false, 'nl');
      const buttons = screen.getAllByRole('button', { name: 'Bekijk op volledig formaat' });
      fireEvent.click(buttons[0]);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      const lightboxLabels = screen.getAllByText('Bovenaanzicht (12:00)');
      expect(lightboxLabels.length).toBeGreaterThanOrEqual(2);

      // Close button should be in Dutch
      const closeButton = screen.getByRole('button', { name: 'Sluit volledige weergave' });
      expect(closeButton).toBeInTheDocument();
    });
  });
});
