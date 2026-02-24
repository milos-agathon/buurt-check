import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';

const CSS_FILES = [
  'src/components/NeighborhoodViewer3D.css',
  'src/components/RiskTile.css',
  'src/components/LivabilityCard.css',
  'src/components/LivabilityDetailView.css',
  'src/components/RiskDetailView.css',
  'src/components/ui/Toast.css',
  'src/components/ui/BottomSheet.css',
];

function ReducedMotionProbe() {
  const reduced = useReducedMotion();
  return <span data-testid="reduced-motion-value">{String(reduced)}</span>;
}

describe('Reduced motion compliance', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-test-reduced-motion');
  });

  it('includes prefers-reduced-motion overrides in all Epic 1 target CSS files', () => {
    for (const cssFile of CSS_FILES) {
      const css = readFileSync(cssFile, 'utf-8');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toMatch(/animation:\s*none|transition:\s*none/);
    }
  });

  it('framer-motion reduced-motion preference follows matchMedia mock state', () => {
    document.documentElement.setAttribute('data-test-reduced-motion', 'true');
    const { rerender } = render(<ReducedMotionProbe />);
    expect(screen.getByTestId('reduced-motion-value')).toHaveTextContent('true');

    document.documentElement.setAttribute('data-test-reduced-motion', 'false');
    rerender(<ReducedMotionProbe />);
    expect(screen.getByTestId('reduced-motion-value')).toHaveTextContent('false');
  });
});

