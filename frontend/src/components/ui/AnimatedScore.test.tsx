import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnimatedScore from './AnimatedScore';

describe('AnimatedScore', () => {
  it('renders the final value', () => {
    render(<AnimatedScore value={75} />);
    // aria-label should have final value for accessibility
    const el = screen.getByLabelText('75');
    expect(el).toBeInTheDocument();
  });

  it('respects prefers-reduced-motion by showing value instantly', () => {
    // Mock matchMedia to return reduced motion
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    render(<AnimatedScore value={42} />);
    expect(screen.getByLabelText('42')).toHaveTextContent('42');

    // Restore
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('applies custom className', () => {
    render(<AnimatedScore value={80} className="my-score" />);
    const el = screen.getByLabelText('80');
    expect(el).toHaveClass('my-score');
  });
});
