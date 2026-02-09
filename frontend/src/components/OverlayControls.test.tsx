import { render, screen, fireEvent } from '@testing-library/react';
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
    opacity?: number;
    onOpacityChange?: (value: number) => void;
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

async function openPopover() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /layers/i });
  await user.click(trigger);
}

describe('OverlayControls', () => {
  it('renders layer toggle button', () => {
    renderOverlays();
    expect(screen.getByRole('button', { name: /layers/i })).toBeInTheDocument();
  });

  it('popover opens when trigger clicked and shows overlays', async () => {
    renderOverlays();
    // Overlays not visible initially
    expect(screen.queryByText('Noise')).not.toBeInTheDocument();
    await openPopover();
    expect(screen.getByText('Noise')).toBeInTheDocument();
    expect(screen.getByText('Air quality')).toBeInTheDocument();
    expect(screen.getByText('Climate stress')).toBeInTheDocument();
  });

  it('clicking overlay calls onOverlayChange with type', async () => {
    const onChange = vi.fn();
    renderOverlays({ onOverlayChange: onChange });
    await openPopover();
    const user = userEvent.setup();
    await user.click(screen.getByText('Noise'));
    expect(onChange).toHaveBeenCalledWith('noise');
  });

  it('clicking active overlay calls onOverlayChange(null)', async () => {
    const onChange = vi.fn();
    renderOverlays({ activeOverlay: 'noise', onOverlayChange: onChange });
    await openPopover();
    const user = userEvent.setup();
    await user.click(screen.getByText('Noise'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('active overlay has active styling', async () => {
    renderOverlays({ activeOverlay: 'noise' });
    await openPopover();
    const noiseBtn = screen.getByText('Noise');
    expect(noiseBtn).toHaveAttribute('aria-pressed', 'true');
    const airBtn = screen.getByText('Air quality');
    expect(airBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('loading state shows indicator', async () => {
    renderOverlays({ loading: true, activeOverlay: 'noise' });
    await openPopover();
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('renders opacity slider in popover', async () => {
    renderOverlays();
    await openPopover();
    const slider = screen.getByRole('slider', { name: /opacity/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '25');
    expect(slider).toHaveAttribute('max', '75');
  });

  it('calls onOpacityChange when opacity slider moves', async () => {
    const onOpacity = vi.fn();
    renderOverlays({ onOpacityChange: onOpacity });
    await openPopover();
    const slider = screen.getByRole('slider', { name: /opacity/i });
    fireEvent.change(slider, { target: { value: '60' } });
    expect(onOpacity).toHaveBeenCalledWith(60);
  });

  it('renders in Dutch', async () => {
    renderOverlays({}, 'nl');
    const trigger = screen.getByRole('button', { name: /lagen/i });
    const user = userEvent.setup();
    await user.click(trigger);
    expect(screen.getByText('Geluid')).toBeInTheDocument();
    expect(screen.getByText('Luchtkwaliteit')).toBeInTheDocument();
    expect(screen.getByText('Klimaatstress')).toBeInTheDocument();
  });
});
