import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HeroMapBackground from './HeroMapBackground';

it('switches to the static fallback state when the hero image fails', () => {
  const { container } = render(<HeroMapBackground />);
  const background = screen.getByTestId('hero-map-background');
  const image = container.querySelector('.hero-map-background__image');

  expect(background).toHaveAttribute('data-image-status', 'ready');
  expect(image).toBeInstanceOf(HTMLImageElement);

  fireEvent.error(image as HTMLImageElement);

  expect(background).toHaveAttribute('data-image-status', 'fallback');
});

it('defines standard-motion drift and disables it for reduced motion', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/match-first/HeroMapBackground.css'), 'utf8');

  expect(css).toContain('@keyframes hero-map-image-drift');
  expect(css).toMatch(/\.hero-map-background\[data-motion="standard"\]\s+\.hero-map-background__image\s*{[^}]*animation:/s);
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.hero-map-background__image[^}]*animation:\s*none/s);
});

it('uses the reduced-motion state when the media query matches', async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  try {
    render(<HeroMapBackground />);

    await waitFor(() => {
      expect(screen.getByTestId('hero-map-background')).toHaveAttribute('data-motion', 'reduced');
    });
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});

it('does not import or request live 3D building data for the landing hero', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/match-first/HeroMapBackground.tsx'), 'utf8');

  expect(source).not.toMatch(/from ['"]three['"]/);
  expect(source).not.toMatch(/fetch\s*\(/);
  expect(source).not.toContain('building3d');
  expect(source).not.toContain('neighborhood3d');
});
