import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LoadingScreen from './LoadingScreen';

describe('LoadingScreen', () => {
  it('renders the address text', () => {
    const { container } = render(<LoadingScreen address="Keizersgracht 100, Amsterdam" />);
    const addr = container.querySelector('.loading-screen__address');
    expect(addr?.textContent).toBe('Keizersgracht 100, Amsterdam');
  });

  it('renders the building animation', () => {
    const { getByTestId } = render(<LoadingScreen address="Test" />);
    expect(getByTestId('building-animation')).toBeInTheDocument();
  });

  it('renders progress text when provided', () => {
    const { container } = render(<LoadingScreen address="Test" progressText="Loading 3D..." />);
    const text = container.querySelector('.loading-screen__text');
    expect(text?.textContent).toBe('Loading 3D...');
  });

  it('renders default progress message when no progressText', () => {
    const { container } = render(<LoadingScreen address="Test" />);
    const text = container.querySelector('.loading-screen__text');
    expect(text?.textContent).toBe('Finding building...');
  });

  it('renders the pulsing dot', () => {
    const { container } = render(<LoadingScreen address="Test" />);
    expect(container.querySelector('.loading-screen__dot')).toBeInTheDocument();
  });

  it('renders the progress bar', () => {
    const { container } = render(<LoadingScreen address="Test" />);
    expect(container.querySelector('.loading-screen__bar-track')).toBeInTheDocument();
    expect(container.querySelector('.loading-screen__bar-fill')).toBeInTheDocument();
  });

  it('has correct test id', () => {
    const { getByTestId } = render(<LoadingScreen address="Test" />);
    expect(getByTestId('loading-screen')).toBeInTheDocument();
  });
});
