import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SummaryStrip from './SummaryStrip';
import type { SeverityLevel } from '../types/api';

interface SummaryPill {
  category: string;
  labelKey: string;
  score?: number;
  severity: SeverityLevel;
}

const mockPills: SummaryPill[] = [
  { category: 'noise', labelKey: 'risk.noise.title', score: 59, severity: 'moderate' },
  { category: 'air', labelKey: 'risk.air.title', score: 55, severity: 'moderate' },
  { category: 'climate', labelKey: 'risk.climate.title', score: 85, severity: 'good' },
  { category: 'sunlight', labelKey: 'sunlight.title', score: 50, severity: 'moderate' },
];

describe('SummaryStrip', () => {
  it('renders correct number of pills', () => {
    const { container } = render(<SummaryStrip pills={mockPills} />);
    const pills = container.querySelectorAll('.summary-strip__pill');
    expect(pills.length).toBe(4);
  });

  it('renders score values in pills', () => {
    const { container } = render(<SummaryStrip pills={mockPills} />);
    const scores = container.querySelectorAll('.summary-strip__score');
    expect(scores[0].textContent).toBe('59');
    expect(scores[2].textContent).toBe('85');
  });

  it('renders -- for unavailable scores', () => {
    const pills = [{ category: 'noise', labelKey: 'test', severity: 'unavailable' as SeverityLevel }];
    const { container } = render(<SummaryStrip pills={pills} />);
    const score = container.querySelector('.summary-strip__score');
    expect(score?.textContent).toBe('--');
  });

  it('renders SVG icons for categories', () => {
    const { container } = render(<SummaryStrip pills={mockPills} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4);
  });

  it('calls onPillTap with correct category', () => {
    const onTap = vi.fn();
    const { container } = render(<SummaryStrip pills={mockPills} onPillTap={onTap} />);
    const pills = container.querySelectorAll('.summary-strip__pill');
    fireEvent.click(pills[1]);
    expect(onTap).toHaveBeenCalledWith('air');
  });

  it('renders as a list with role attributes', () => {
    const { container } = render(<SummaryStrip pills={mockPills} />);
    expect(container.querySelector('[role="list"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(4);
  });

  it('renders empty when no pills', () => {
    const { container } = render(<SummaryStrip pills={[]} />);
    expect(container.querySelectorAll('.summary-strip__pill').length).toBe(0);
  });
});
