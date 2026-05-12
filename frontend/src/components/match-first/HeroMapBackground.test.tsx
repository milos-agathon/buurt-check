import { fireEvent, render, screen } from '@testing-library/react';
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
