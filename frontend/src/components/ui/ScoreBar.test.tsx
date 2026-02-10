import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ScoreBar from './ScoreBar';

describe('ScoreBar', () => {
  it('renders fill at correct width for score 50', () => {
    const { container } = render(<ScoreBar score={50} severity="moderate" />);
    const fill = container.querySelector('.score-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('renders fill at 0% for score 0', () => {
    const { container } = render(<ScoreBar score={0} severity="critical" />);
    const fill = container.querySelector('.score-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('renders fill at 100% for score 100', () => {
    const { container } = render(<ScoreBar score={100} severity="good" />);
    const fill = container.querySelector('.score-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('clamps score above 100', () => {
    const { container } = render(<ScoreBar score={150} severity="good" />);
    const fill = container.querySelector('.score-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('clamps negative score to 0', () => {
    const { container } = render(<ScoreBar score={-10} severity="critical" />);
    const fill = container.querySelector('.score-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('positions dot at score percentage', () => {
    const { container } = render(<ScoreBar score={75} severity="good" />);
    const dot = container.querySelector('.score-bar__dot') as HTMLElement;
    expect(dot.style.left).toBe('75%');
  });

  it('applies severity class to fill', () => {
    const { container } = render(<ScoreBar score={50} severity="moderate" />);
    expect(container.querySelector('.score-bar__fill--moderate')).toBeInTheDocument();
  });

  it('applies severity class to dot', () => {
    const { container } = render(<ScoreBar score={50} severity="poor" />);
    expect(container.querySelector('.score-bar__dot--poor')).toBeInTheDocument();
  });

  it('has meter role with aria values', () => {
    const { container } = render(<ScoreBar score={65} severity="moderate" />);
    const meter = container.querySelector('[role="meter"]');
    expect(meter).toBeInTheDocument();
    expect(meter?.getAttribute('aria-valuenow')).toBe('65');
  });
});
