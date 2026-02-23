import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import HeatmapLegend from './HeatmapLegend';
import { setupTestI18n } from '../test/helpers';
import { getSunHoursGradientCss } from '../utils/heatmapColors';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderLegend(
  visible = true,
  minHours = 1.2,
  maxHours = 8.4,
  language: 'en' | 'nl' = 'en',
) {
  const i18n = language === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <HeatmapLegend visible={visible} minHours={minHours} maxHours={maxHours} />
    </I18nextProvider>,
  );
}

describe('HeatmapLegend', () => {
  it('renders nothing when hidden', () => {
    const { container } = renderLegend(false);
    expect(container.innerHTML).toBe('');
  });

  it('renders title and min/max labels when visible', () => {
    renderLegend(true, 2, 12);
    expect(screen.getByText('Roof sun-hours heatmap')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('12h')).toBeInTheDocument();
    const gradient = document.querySelector('.heatmap-legend__gradient') as HTMLDivElement | null;
    expect(gradient).not.toBeNull();
    expect(gradient!.style.getPropertyValue('--sun-hours-gradient')).toBe(getSunHoursGradientCss());
  });

  it('renders Dutch translation', () => {
    renderLegend(true, 2, 12, 'nl');
    expect(screen.getByText('Warmtekaart zonuren dak')).toBeInTheDocument();
  });
});
