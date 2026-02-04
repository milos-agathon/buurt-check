import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './OverlayControls.css';

const OVERLAYS = ['noise', 'airQuality', 'climateStress'] as const;
type OverlayId = (typeof OVERLAYS)[number];

const OVERLAY_I18N: Record<OverlayId, string> = {
  noise: 'overlays.noise',
  airQuality: 'overlays.airQuality',
  climateStress: 'overlays.climateStress',
};

interface Props {
  availableOverlays?: Set<OverlayId>;
}

export default function OverlayControls({ availableOverlays }: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Set<OverlayId>>(new Set());

  const toggle = (id: OverlayId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="overlay-controls">
      <span className="overlay-controls__label">{t('overlays.label')}</span>
      <div className="overlay-controls__buttons">
        {OVERLAYS.map((id) => (
          <button
            key={id}
            type="button"
            className={`shadow-controls__preset ${active.has(id) ? 'shadow-controls__preset--active' : ''}`}
            aria-pressed={active.has(id)}
            onClick={() => toggle(id)}
          >
            {t(OVERLAY_I18N[id])}
          </button>
        ))}
      </div>
      {OVERLAYS.filter((id) => active.has(id) && !availableOverlays?.has(id)).map((id) => (
        <p key={id} className="overlay-controls__placeholder">
          {t('overlays.comingSoon', { layer: t(OVERLAY_I18N[id]) })}
        </p>
      ))}
    </div>
  );
}
