import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import OverlayControls from './OverlayControls';
import { setupTestI18n } from '../test/helpers';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderOverlays(lang: 'en' | 'nl' = 'en') {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <OverlayControls />
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

  it('toggle shows coming soon message when clicked', async () => {
    const user = userEvent.setup();
    renderOverlays();
    await user.click(screen.getByText('Noise'));
    expect(screen.getByText('Noise: Coming in a future update')).toBeInTheDocument();
  });

  it('removes coming soon message when toggled off', async () => {
    const user = userEvent.setup();
    renderOverlays();
    await user.click(screen.getByText('Noise'));
    expect(screen.getByText('Noise: Coming in a future update')).toBeInTheDocument();
    await user.click(screen.getByText('Noise'));
    expect(screen.queryByText('Noise: Coming in a future update')).not.toBeInTheDocument();
  });

  it('supports multiple active toggles', async () => {
    const user = userEvent.setup();
    renderOverlays();
    await user.click(screen.getByText('Noise'));
    await user.click(screen.getByText('Air quality'));
    expect(screen.getByText('Noise: Coming in a future update')).toBeInTheDocument();
    expect(screen.getByText('Air quality: Coming in a future update')).toBeInTheDocument();
  });

  it('sets aria-pressed correctly', async () => {
    const user = userEvent.setup();
    renderOverlays();
    const noiseBtn = screen.getByText('Noise');
    expect(noiseBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(noiseBtn);
    expect(noiseBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders in Dutch', () => {
    renderOverlays('nl');
    expect(screen.getByText('Data-overlays')).toBeInTheDocument();
    expect(screen.getByText('Geluid')).toBeInTheDocument();
    expect(screen.getByText('Luchtkwaliteit')).toBeInTheDocument();
    expect(screen.getByText('Klimaatstress')).toBeInTheDocument();
  });

  it('shows Dutch coming soon message', async () => {
    const user = userEvent.setup();
    renderOverlays('nl');
    await user.click(screen.getByText('Geluid'));
    expect(screen.getByText('Geluid: Beschikbaar in een toekomstige update')).toBeInTheDocument();
  });
});
