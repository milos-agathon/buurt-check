import { useEffect, useRef } from 'react';

interface BuildingAnimationProps {
  animate?: boolean;
}

const PATHS = [
  // Foundation
  { d: 'M30 130 L150 130', delay: 0, duration: 400 },
  // Left wall
  { d: 'M30 130 L30 50', delay: 400, duration: 300 },
  // Right wall
  { d: 'M150 130 L150 50', delay: 400, duration: 300 },
  // Roof left
  { d: 'M30 50 L90 15', delay: 1000, duration: 200 },
  // Roof right
  { d: 'M150 50 L90 15', delay: 1000, duration: 200 },
  // Window left
  { d: 'M50 70 L50 90 L70 90 L70 70 Z', delay: 1400, duration: 200 },
  // Window right
  { d: 'M110 70 L110 90 L130 90 L130 70 Z', delay: 1400, duration: 200 },
  // Door
  { d: 'M80 130 L80 100 L100 100 L100 130', delay: 1800, duration: 200 },
];

export default function BuildingAnimation({ animate = true }: BuildingAnimationProps) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const prefersReducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!animate || prefersReducedMotion) return;

    pathRefs.current.forEach((path, i) => {
      if (!path || typeof path.getTotalLength !== 'function') return;
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;

      if (typeof path.animate !== 'function') return;

      path.animate(
        [
          { strokeDashoffset: `${len}` },
          { strokeDashoffset: '0' },
        ],
        {
          delay: PATHS[i].delay,
          duration: PATHS[i].duration,
          fill: 'forwards',
          easing: 'ease-out',
        },
      );
    });
  }, [animate, prefersReducedMotion]);

  return (
    <svg
      width="180"
      height="160"
      viewBox="0 0 180 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="building-animation"
    >
      {PATHS.map((p, i) => (
        <path
          key={i}
          ref={(el) => { pathRefs.current[i] = el; }}
          d={p.d}
          stroke="var(--color-text, #1A1A2E)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            prefersReducedMotion || !animate
              ? {}
              : { strokeDasharray: '1000', strokeDashoffset: '1000' }
          }
        />
      ))}
    </svg>
  );
}
