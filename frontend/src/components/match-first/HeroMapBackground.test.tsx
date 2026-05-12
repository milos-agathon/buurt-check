import { render, screen } from '@testing-library/react';
import HeroMapBackground from './HeroMapBackground';

it('renders a lightweight map atmosphere without requesting national 3D building data', () => {
  const fetchSpy = vi.spyOn(window, 'fetch');

  render(<HeroMapBackground />);

  expect(screen.getByTestId('hero-map-background')).toBeInTheDocument();
  expect(screen.getByTestId('hero-map-background')).toHaveAttribute('aria-hidden', 'true');
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

it('exposes a reduced-motion static state for the hero shell', () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'true');

  render(<HeroMapBackground />);

  expect(screen.getByTestId('hero-map-background')).toHaveAttribute('data-reduced-motion', 'true');
});
