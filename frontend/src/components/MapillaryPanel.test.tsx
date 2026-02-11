import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import MapillaryPanel from './MapillaryPanel';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderPanel(props: Parameters<typeof MapillaryPanel>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MapillaryPanel {...props} />
    </I18nextProvider>,
  );
}

describe('MapillaryPanel', () => {
  it('renders loading state', () => {
    renderPanel({ loading: true });
    expect(screen.getByText('Street View (Mapillary)')).toBeInTheDocument();
    expect(screen.getByText('Loading street view...')).toBeInTheDocument();
  });

  it('renders iframe and attribution when image data is available', () => {
    renderPanel({
      data: {
        address_id: 'vbo-1',
        source: 'Mapillary Graph API',
        source_date: '2025-12-01',
        license: 'CC BY-SA 4.0',
        attribution: '(c) Mapillary contributors',
        image: {
          id: '374806936301199',
          captured_at: '2025-12-01T10:11:12Z',
          is_pano: true,
          distance_m: 11.6,
          viewer_url: 'https://www.mapillary.com/app/?pKey=374806936301199&focus=photo',
          embed_url: 'https://www.mapillary.com/embed?image_key=374806936301199&style=photo',
        },
      },
    });

    const iframe = screen.getByTitle('Mapillary street-level panorama');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.mapillary.com/embed?image_key=374806936301199&style=photo',
    );
    expect(screen.getByText('Open in Mapillary')).toHaveAttribute(
      'href',
      'https://www.mapillary.com/app/?pKey=374806936301199&focus=photo',
    );
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument();
  });

  it('renders translated fallback message when no image is available', () => {
    renderPanel({
      data: {
        address_id: 'vbo-1',
        source: 'Mapillary Graph API',
        license: 'CC BY-SA 4.0',
        attribution: '(c) Mapillary contributors',
        message: 'MAPILLARY_NO_IMAGE',
      },
    });

    expect(screen.getByText('No nearby Mapillary panorama was found for this address.')).toBeInTheDocument();
  });
});
