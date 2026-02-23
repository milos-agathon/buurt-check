import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDaylightRange } from '../utils/sunPosition';
import './ShadowTimeSlider.css';

interface Props {
  lat: number;
  lng: number;
  onChange: (date: Date) => void;
}

type DatePreset = 'winter' | 'equinox' | 'summer' | 'today';

const PRESETS: DatePreset[] = ['winter', 'equinox', 'summer', 'today'];
const PLAYBACK_STEP_MINUTES = 5;
const PLAYBACK_UI_SYNC_MINUTES = 15;

function getPresetDate(preset: DatePreset, year: number): Date {
  switch (preset) {
    case 'winter':
      return new Date(year, 11, 21);
    case 'equinox':
      return new Date(year, 2, 21);
    case 'summer':
      return new Date(year, 5, 21);
    case 'today':
      return new Date();
  }
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function ShadowTimeSlider({ lat, lng, onChange }: Props) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<DatePreset>('summer');
  const [minutes, setMinutes] = useState(720); // noon
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number | null>(null);
  const sessionYearRef = useRef(new Date().getFullYear());
  const minutesRef = useRef(minutes);

  const baseDate = useMemo(
    () => getPresetDate(preset, sessionYearRef.current),
    [preset],
  );
  const daylight = useMemo(
    () => getDaylightRange(baseDate, lat, lng),
    [baseDate, lat, lng],
  );
  const minMinutes = Math.floor(daylight.sunrise * 60);
  const maxMinutes = Math.ceil(daylight.sunset * 60);

  const emitChange = useCallback(
    (mins: number, date: Date, min: number, max: number) => {
      const clamped = clampMinutes(mins, min, max);
      const d = new Date(date);
      d.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
      onChange(d);
    },
    [onChange],
  );

  useEffect(() => {
    minutesRef.current = minutes;
  }, [minutes]);

  useEffect(() => {
    setMinutes((current) => clampMinutes(current, minMinutes, maxMinutes));
  }, [minMinutes, maxMinutes]);

  // C3 fix: derive the date from the next preset directly (no stale memoized date).
  const handlePreset = useCallback((nextPreset: DatePreset) => {
    const nextDate = getPresetDate(nextPreset, sessionYearRef.current);
    const nextDaylight = getDaylightRange(nextDate, lat, lng);
    const nextMinMinutes = Math.floor(nextDaylight.sunrise * 60);
    const nextMaxMinutes = Math.ceil(nextDaylight.sunset * 60);
    const noon = clampMinutes(720, nextMinMinutes, nextMaxMinutes);

    setPreset(nextPreset);
    setPlaying(false);
    setMinutes(noon);
    minutesRef.current = noon;
    emitChange(noon, nextDate, nextMinMinutes, nextMaxMinutes);
  }, [emitChange, lat, lng]);

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMinutes = Number(event.target.value);
    setPlaying(false);
    setMinutes(nextMinutes);
    minutesRef.current = nextMinutes;
    emitChange(nextMinutes, baseDate, minMinutes, maxMinutes);
  }, [baseDate, emitChange, maxMinutes, minMinutes]);

  const togglePlayback = useCallback(() => {
    if (playing) {
      // Keep UI state aligned to the last ref-based playback minute on pause.
      setMinutes(minutesRef.current);
    }
    setPlaying((value) => !value);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;

    let current = clampMinutes(minutesRef.current, minMinutes, maxMinutes);
    let lastFrame = 0;
    const FRAME_INTERVAL_MS = 83; // ~12 FPS

    setMinutes(current);
    minutesRef.current = current;
    emitChange(current, baseDate, minMinutes, maxMinutes);

    const step = (timestamp: number) => {
      if (timestamp - lastFrame < FRAME_INTERVAL_MS) {
        animRef.current = requestAnimationFrame(step);
        return;
      }
      lastFrame = timestamp;

      current += PLAYBACK_STEP_MINUTES;
      if (current >= maxMinutes) {
        current = maxMinutes;
        minutesRef.current = current;
        setMinutes(current);
        emitChange(current, baseDate, minMinutes, maxMinutes);
        setPlaying(false);
        animRef.current = null;
        return;
      }

      minutesRef.current = current;
      emitChange(current, baseDate, minMinutes, maxMinutes);
      if (current % PLAYBACK_UI_SYNC_MINUTES === 0) {
        // Keep slider/time text responsive without a render on every animation frame.
        setMinutes(current);
      }
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [playing, minMinutes, maxMinutes, emitChange, baseDate]);

  const timeLabel = useMemo(() => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }, [minutes]);

  return (
    <div className="shadow-slider" data-testid="shadow-time-slider">
      <div className="shadow-slider__presets">
        {PRESETS.map((option) => (
          <button
            key={option}
            type="button"
            className={`shadow-slider__preset ${preset === option ? 'shadow-slider__preset--active' : ''}`}
            onClick={() => handlePreset(option)}
          >
            {t(`shadow_slider.${option}`)}
          </button>
        ))}
      </div>

      <div className="shadow-slider__controls">
        <button
          type="button"
          className="shadow-slider__play"
          onClick={togglePlayback}
          aria-label={playing ? t('shadow_slider.pause') : t('shadow_slider.play')}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          className="shadow-slider__range"
          min={minMinutes}
          max={maxMinutes}
          value={minutes}
          onChange={handleSliderChange}
          aria-label={t('shadow_slider.time')}
        />
        <span className="shadow-slider__time">{timeLabel}</span>
      </div>
    </div>
  );
}
