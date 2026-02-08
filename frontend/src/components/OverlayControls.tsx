import { useTranslation } from 'react-i18next';
import type { OverlayTileType } from '../services/api';
import './OverlayControls.css';

const OVERLAYS: { id: OverlayTileType; i18nKey: string }[] = [
  { id: 'noise', i18nKey: 'overlays.noise' },
  { id: 'air_quality', i18nKey: 'overlays.airQuality' },
  { id: 'climate', i18nKey: 'overlays.climateStress' },
];

interface Props {
  activeOverlay: OverlayTileType | null;
  onOverlayChange: (overlay: OverlayTileType | null) => void;
  loading?: boolean;
}

export default function OverlayControls({ activeOverlay, onOverlayChange, loading }: Props) {
  const { t } = useTranslation();

  return (
    <div className="overlay-controls">
      <span className="overlay-controls__label">{t('overlays.label')}</span>
      <div className="overlay-controls__buttons">
        {OVERLAYS.map(({ id, i18nKey }) => {
          const isActive = activeOverlay === id;
          return (
            <button
              key={id}
              type="button"
              className={`shadow-controls__preset ${isActive ? 'shadow-controls__preset--active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onOverlayChange(isActive ? null : id)}
            >
              {t(i18nKey)}
              {isActive && loading && <span className="overlay-controls__spinner" aria-label="loading" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
