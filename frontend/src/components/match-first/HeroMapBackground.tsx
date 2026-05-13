import { useState } from 'react';
import './HeroMapBackground.css';

export default function HeroMapBackground() {
  const [imageStatus, setImageStatus] = useState<'ready' | 'fallback'>('ready');

  return (
    <div
      className="hero-map-background"
      data-testid="hero-map-background"
      data-image-status={imageStatus}
      data-motion="standard"
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
