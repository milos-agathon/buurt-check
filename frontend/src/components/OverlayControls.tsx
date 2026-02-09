import { useEffect, useRef, useState } from 'react';
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
  opacity?: number;
  onOpacityChange?: (value: number) => void;
}

export default function OverlayControls({ activeOverlay, onOverlayChange, loading, opacity = 50, onOpacityChange }: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="overlay-controls" ref={popoverRef}>
      <button
        className={`overlay-controls__trigger${isOpen ? ' overlay-controls__trigger--active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t('overlays.layers')}
        title={t('overlays.layers')}
        type="button"
      >
        {'\u{1F5FA}'}
      </button>
      {isOpen && (
        <div className="overlay-controls__popover">
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
          <div className="overlay-controls__opacity">
            <label className="overlay-controls__opacity-label" htmlFor="overlay-opacity">
              {t('overlays.opacity')}: {opacity}%
            </label>
            <input
              id="overlay-opacity"
              type="range"
              min={25}
              max={75}
              step={5}
              value={opacity}
              onChange={(e) => onOpacityChange?.(Number(e.target.value))}
              className="overlay-controls__opacity-slider"
              aria-label={t('overlays.opacity')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
