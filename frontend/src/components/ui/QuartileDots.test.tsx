import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuartileDots from './QuartileDots';

describe('QuartileDots', () => {
  it('renders 4 dots', () => {
    render(<QuartileDots quartile={2} />);
    const container = screen.getByLabelText('Quartile 2 of 4');
    const dots = container.querySelectorAll('.quartile-dots__dot');
    expect(dots).toHaveLength(4);
  });

  it('fills correct number of dots for quartile 1', () => {
    render(<QuartileDots quartile={1} />);
    const container = screen.getByLabelText('Quartile 1 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(1);
  });

  it('fills correct number of dots for quartile 3', () => {
    render(<QuartileDots quartile={3} />);
    const container = screen.getByLabelText('Quartile 3 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(3);
  });

  it('fills all dots for quartile 4', () => {
    render(<QuartileDots quartile={4} />);
    const container = screen.getByLabelText('Quartile 4 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(4);
  });
});
