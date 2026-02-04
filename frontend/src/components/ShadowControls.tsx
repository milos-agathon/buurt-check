import { useTranslation } from 'react-i18next';
import './ShadowControls.css';

interface Props {
  hour: number;
  datePreset: string;
  onHourChange: (hour: number) => void;
  onDatePresetChange: (preset: string) => void;
  onCameraPreset?: (preset: string) => void;
}

const DATE_PRESETS = ['winter', 'summer', 'equinox', 'today'] as const;
const CAMERA_PRESETS = ['street', 'balcony', 'topDown'] as const;

export default function ShadowControls({ hour, datePreset, onHourChange, onDatePresetChange, onCameraPreset }: Props) {
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
            {t(`viewer3d.${preset === 'winter' ? 'winterSolstice' : preset === 'summer' ? 'summerSolstice' : preset}`)}
          </button>
        ))}
      </div>
      <div className="shadow-controls__slider">
        <label className="shadow-controls__label" htmlFor="hour-slider">
          {t('viewer3d.time')}: {hour}:00
        </label>
        <input
          id="hour-slider"
          type="range"
          min={5}
          max={22}
          step={1}
          value={hour}
          onChange={(e) => onHourChange(Number(e.target.value))}
          className="shadow-controls__input"
        />
      </div>
      {onCameraPreset && (
        <div className="shadow-controls__section">
          <span className="shadow-controls__label">{t('viewer3d.cameraLabel')}</span>
          <div className="shadow-controls__presets">
            {CAMERA_PRESETS.map((p) => (
              <button key={p} className="shadow-controls__preset" onClick={() => onCameraPreset(p)} type="button">
                {t(`viewer3d.camera.${p}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
