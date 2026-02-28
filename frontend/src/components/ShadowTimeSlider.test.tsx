import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import ShadowTimeSlider from './ShadowTimeSlider';
import { setupTestI18n } from '../test/helpers';
import { getDatePartsInTimeZone } from '../utils/sunPosition';

let i18nEn: Awaited<ReturnType<typeof setupTestI18n>>;
let i18nNl: Awaited<ReturnType<typeof setupTestI18n>>;
let rafId = 0;
let rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];

beforeAll(async () => {
  i18nEn = await setupTestI18n('en');
  i18nNl = await setupTestI18n('nl');
});

function renderSlider(onChange: (date: Date) => void, lang: 'en' | 'nl' = 'en') {
  const i18n = lang === 'en' ? i18nEn : i18nNl;
  return render(
    <I18nextProvider i18n={i18n}>
      <ShadowTimeSlider lat={52.37} lng={4.9} onChange={onChange} />
    </I18nextProvider>,
  );
}

function flushNextRaf(timestamp = 100): boolean {
  const next = rafQueue.shift();
  if (!next) return false;
  act(() => {
    next.cb(timestamp);
  });
  return true;
}

describe('ShadowTimeSlider', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 12, 0, 0));
    rafId = 0;
    rafQueue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafQueue.push({ id, cb });
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      rafQueue = rafQueue.filter((entry) => entry.id !== id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    const parts = getDatePartsInTimeZone(emittedDate);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(12);
  });

  it('emits the equinox preset date (Mar 21)', () => {
    renderSlider(onChange);
    fireEvent.click(screen.getByRole('button', { name: /spring/i }));

    const emittedDate = onChange.mock.calls[0][0] as Date;
    const parts = getDatePartsInTimeZone(emittedDate);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(21);
  });

  it('emits the current day for today preset', () => {
    renderSlider(onChange);
    fireEvent.click(screen.getByRole('button', { name: /today/i }));

    const emittedDate = onChange.mock.calls[0][0] as Date;
    const parts = getDatePartsInTimeZone(emittedDate);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(6);
    expect(parts.day).toBe(1);
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
    const parts = getDatePartsInTimeZone(emittedDate);
    expect(parts.hour).toBe(14);
    expect(parts.minute).toBe(30);
  });

  it('pauses playback and stops emitting new times', () => {
    renderSlider(onChange);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    flushNextRaf(100);
    const callsBeforePause = onChange.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    while (flushNextRaf(200)) {
      // Drain any queued frames after pause.
    }

    expect(onChange.mock.calls.length).toBe(callsBeforePause);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('stops at end-of-day bound without wrapping past slider max', () => {
    renderSlider(onChange);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    const max = Number(slider.max);
    fireEvent.change(slider, { target: { value: String(max - 5) } });
    onChange.mockReset();

    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    flushNextRaf(100);

    const lastEmitted = onChange.mock.calls.at(-1)?.[0] as Date;
    const parts = getDatePartsInTimeZone(lastEmitted);
    expect((parts.hour * 60) + parts.minute).toBe(max);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe(String(max));
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('renders Dutch preset and control labels', () => {
    renderSlider(onChange, 'nl');
    expect(screen.getByRole('button', { name: 'Lente (21 mrt)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vandaag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afspelen' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Schaduwtijd' })).toBeInTheDocument();
  });
});
