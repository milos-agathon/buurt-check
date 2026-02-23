import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import ShadowTimeSlider from './ShadowTimeSlider';
import { setupTestI18n } from '../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderSlider(onChange: (date: Date) => void) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ShadowTimeSlider lat={52.37} lng={4.9} onChange={onChange} />
    </I18nextProvider>,
  );
}

describe('ShadowTimeSlider', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders date preset buttons', () => {
    renderSlider(onChange);
    expect(screen.getByRole('button', { name: /winter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /summer/i })).toBeInTheDocument();
  });

  it('renders time slider', () => {
    renderSlider(onChange);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('calls onChange with Date when slider moves', () => {
    renderSlider(onChange);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '725' } });
    expect(onChange).toHaveBeenCalledWith(expect.any(Date));
  });

  it('calls onChange with correct date on preset change (C3 fix)', () => {
    renderSlider(onChange);
    fireEvent.click(screen.getByRole('button', { name: /winter/i }));

    const emittedDate = onChange.mock.calls[0][0] as Date;
    expect(emittedDate.getFullYear()).toBe(2026);
    expect(emittedDate.getMonth()).toBe(11);
  });

  it('renders play/pause button', () => {
    renderSlider(onChange);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('starts playback from current slider position', () => {
    renderSlider(onChange);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '870' } }); // 14:30
    onChange.mockReset();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /play/i }));
      vi.advanceTimersByTime(1);
    });

    expect(onChange).toHaveBeenCalled();
    const emittedDate = onChange.mock.calls[0][0] as Date;
    expect(emittedDate.getHours()).toBe(14);
    expect(emittedDate.getMinutes()).toBe(30);
  });
});
