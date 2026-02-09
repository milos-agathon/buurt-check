import { useTranslation } from 'react-i18next';
import './ShadowControls.css';

interface Props {
  hour: number;
  datePreset: string;
  onHourChange: (hour: number) => void;
  onDatePresetChange: (preset: string) => void;
}

const DATE_PRESETS = ['winter', 'spring', 'summer', 'autumn'] as const;
const SEASON_EMOJI: Record<string, string> = {
  winter: '\u2744\uFE0F',
  spring: '\uD83C\uDF38',
  summer: '\u2600\uFE0F',
  autumn: '\uD83C\uDF42',
};
const TICK_HOURS = [6, 9, 12, 15, 18, 21];

export default function ShadowControls({ hour, datePreset, onHourChange, onDatePresetChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="shadow-controls">
      <div className="shadow-controls__presets">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`shadow-controls__preset ${datePreset === preset ? 'shadow-controls__preset--active' : ''}`}
            onClick={() => onDatePresetChange(preset)}
            type="button"
          >
            <span className="shadow-controls__emoji">{SEASON_EMOJI[preset]}</span>
            {' '}{t(`viewer3d.${preset}`)}
          </button>
        ))}
      </div>
      <div className="shadow-controls__slider">
        <div className="shadow-controls__time-display">
          {String(hour).padStart(2, '0')}:00
        </div>
        <input
          id="hour-slider"
          type="range"
          min={6}
          max={21}
          step={1}
          value={hour}
          onChange={(e) => onHourChange(Number(e.target.value))}
          className="shadow-controls__input"
          aria-label={t('viewer3d.time')}
        />
        <div className="shadow-controls__ticks">
          {TICK_HOURS.map((h) => (
            <span key={h} className="shadow-controls__tick">
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
