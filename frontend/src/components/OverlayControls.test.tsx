import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import OverlayControls from './OverlayControls';
import { setupTestI18n } from '../test/helpers';
import type { OverlayTileType } from '../services/api';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderOverlays(
  props: {
    activeOverlay?: OverlayTileType | null;
    onOverlayChange?: (overlay: OverlayTileType | null) => void;
    loading?: boolean;
  } = {},
  lang: 'en' | 'nl' = 'en',
) {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  const defaultProps = {
    activeOverlay: null as OverlayTileType | null,
    onOverlayChange: vi.fn(),
    loading: false,
    ...props,
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <OverlayControls {...defaultProps} />
    </I18nextProvider>,
  );
}

describe('OverlayControls', () => {
  it('renders overlay label', () => {
    renderOverlays();
    expect(screen.getByText('Data overlays')).toBeInTheDocument();
  });

  it('renders all 3 toggle buttons', () => {
    renderOverlays();
    expect(screen.getByText('Noise')).toBeInTheDocument();
    expect(screen.getByText('Air quality')).toBeInTheDocument();
    expect(screen.getByText('Climate stress')).toBeInTheDocument();
  });

  it('clicking overlay calls onOverlayChange with type', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderOverlays({ onOverlayChange: onChange });
    await user.click(screen.getByText('Noise'));
    expect(onChange).toHaveBeenCalledWith('noise');
  });

  it('clicking active overlay calls onOverlayChange(null)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderOverlays({ activeOverlay: 'noise', onOverlayChange: onChange });
    await user.click(screen.getByText('Noise'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('active overlay has active styling', () => {
    renderOverlays({ activeOverlay: 'noise' });
    const noiseBtn = screen.getByText('Noise');
    expect(noiseBtn).toHaveAttribute('aria-pressed', 'true');
    const airBtn = screen.getByText('Air quality');
    expect(airBtn).toHaveAttribute('aria-pressed', 'false');
    const climateBtn = screen.getByText('Climate stress');
    expect(climateBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('no active overlay has all aria-pressed false', () => {
    renderOverlays({ activeOverlay: null });
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('loading state shows indicator', () => {
    renderOverlays({ loading: true, activeOverlay: 'noise' });
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('renders in Dutch', () => {
    renderOverlays({}, 'nl');
    expect(screen.getByText('Data-overlays')).toBeInTheDocument();
    expect(screen.getByText('Geluid')).toBeInTheDocument();
    expect(screen.getByText('Luchtkwaliteit')).toBeInTheDocument();
    expect(screen.getByText('Klimaatstress')).toBeInTheDocument();
  });
});
