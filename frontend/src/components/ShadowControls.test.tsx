import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ShadowControls from './ShadowControls';
import { setupTestI18n } from '../test/helpers';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

function renderControls(overrides = {}) {
  const props = {
    hour: 12,
    datePreset: 'summer',
    onHourChange: vi.fn(),
    onDatePresetChange: vi.fn(),
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18nInstance}>
      <ShadowControls {...props} />
    </I18nextProvider>,
  );
  return props;
}

describe('ShadowControls', () => {
  it('renders time display with current hour', () => {
    renderControls({ hour: 14 });
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('14');
  });

  it('renders 4 season buttons (winter, spring, summer, autumn)', () => {
    renderControls();
    expect(screen.getByText(/Winter/)).toBeInTheDocument();
    expect(screen.getByText(/Spring/)).toBeInTheDocument();
    expect(screen.getByText(/Summer/)).toBeInTheDocument();
    expect(screen.getByText(/Autumn/)).toBeInTheDocument();
  });

  it('calls onHourChange when slider moves', () => {
    const props = renderControls();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9' } });
    expect(props.onHourChange).toHaveBeenCalledWith(9);
  });

  it('calls onDatePresetChange when preset clicked', () => {
    const props = renderControls();
    fireEvent.click(screen.getByText(/Winter/));
    expect(props.onDatePresetChange).toHaveBeenCalledWith('winter');
  });

  it('highlights active preset', () => {
    renderControls({ datePreset: 'winter' });
    const winterBtn = screen.getByText(/Winter/).closest('button')!;
    expect(winterBtn.className).toContain('--active');
  });

  it('renders camera preset buttons when onCameraPreset provided', () => {
    renderControls({ onCameraPreset: vi.fn() });
    expect(screen.getByText('Camera')).toBeInTheDocument();
    expect(screen.getByText('Street level')).toBeInTheDocument();
    expect(screen.getByText('Balcony level')).toBeInTheDocument();
    expect(screen.getByText('Top-down')).toBeInTheDocument();
  });

  it('does not render camera presets when onCameraPreset not provided', () => {
    renderControls();
    expect(screen.queryByText('Camera')).not.toBeInTheDocument();
    expect(screen.queryByText('Street level')).not.toBeInTheDocument();
  });

  it('calls onCameraPreset when preset clicked', () => {
    const onCameraPreset = vi.fn();
    renderControls({ onCameraPreset });
    fireEvent.click(screen.getByText('Street level'));
    expect(onCameraPreset).toHaveBeenCalledWith('street');
    fireEvent.click(screen.getByText('Top-down'));
    expect(onCameraPreset).toHaveBeenCalledWith('topDown');
  });

  it('renders hour tick marks every 3 hours', () => {
    renderControls();
    expect(screen.getByText('06')).toBeInTheDocument();
    expect(screen.getByText('09')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
  });

  it('time slider has range 6-21', () => {
    renderControls();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '6');
    expect(slider).toHaveAttribute('max', '21');
    expect(slider).toHaveAttribute('step', '1');
  });
});
