import { useEffect, useState } from 'react';
import './HeroMapBackground.css';

function readReducedMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function HeroMapBackground() {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener?.('change', updatePreference);
    return () => query.removeEventListener?.('change', updatePreference);
  }, []);

  return (
    <div
      className="hero-map-background"
      data-testid="hero-map-background"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden="true"
    >
      <img
        className="hero-map-background__image"
        src="/images/showcase-neighborhood.webp"
        alt=""
        loading="eager"
        draggable={false}
      />
      <div className="hero-map-background__grid" />
      <div className="hero-map-background__route hero-map-background__route--primary" />
      <div className="hero-map-background__route hero-map-background__route--secondary" />
      <div className="hero-map-background__marker hero-map-background__marker--one" />
      <div className="hero-map-background__marker hero-map-background__marker--two" />
      <div className="hero-map-background__marker hero-map-background__marker--three" />
    </div>
  );
}
