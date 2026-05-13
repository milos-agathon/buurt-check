import { useEffect, useState } from 'react';
import './HeroMapBackground.css';

type HeroMotionMode = 'standard' | 'reduced';

function readMotionMode(): HeroMotionMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'standard';
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'standard';
}

export default function HeroMapBackground() {
  const [imageStatus, setImageStatus] = useState<'ready' | 'fallback'>('ready');
  const [motionMode, setMotionMode] = useState<HeroMotionMode>(readMotionMode);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionMode = () => {
      setMotionMode(mediaQuery.matches ? 'reduced' : 'standard');
    };

    updateMotionMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMotionMode);
      return () => mediaQuery.removeEventListener('change', updateMotionMode);
    }
    mediaQuery.addListener(updateMotionMode);
    return () => mediaQuery.removeListener(updateMotionMode);
  }, []);

  return (
    <div
      className="hero-map-background"
      data-testid="hero-map-background"
      data-image-status={imageStatus}
      data-motion={motionMode}
      aria-hidden="true"
    >
      {imageStatus === 'ready' && (
        <img
          className="hero-map-background__image"
          src="/images/showcase-neighborhood.webp"
          alt=""
          loading="eager"
          draggable={false}
          onError={() => setImageStatus('fallback')}
        />
      )}
      <div className="hero-map-background__grid" />
    </div>
  );
}
