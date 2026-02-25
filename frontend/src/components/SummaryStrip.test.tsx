import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SummaryStrip from './SummaryStrip';
import type { SeverityLevel } from '../types/api';
import { setupTestI18n } from '../test/helpers';

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

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderSummaryStrip(props: Partial<Parameters<typeof SummaryStrip>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SummaryStrip pills={props.pills ?? mockPills} onPillTap={props.onPillTap} />
    </I18nextProvider>,
  );
}

describe('SummaryStrip', () => {
  it('renders correct number of pills', () => {
    const { container } = renderSummaryStrip();
    const pills = container.querySelectorAll('.summary-strip__pill');
    expect(pills.length).toBe(4);
  });

  it('renders score values in pills', async () => {
    const { container } = renderSummaryStrip();
    await waitFor(() => {
      const scores = container.querySelectorAll('.summary-strip__score');
      expect(scores[0].textContent).toBe('59/100');
      expect(scores[2].textContent).toBe('85/100');
    });
  });

  it('renders -- for unavailable scores', () => {
    const pills = [{ category: 'noise', labelKey: 'test', severity: 'unavailable' as SeverityLevel }];
    const { container } = renderSummaryStrip({ pills });
    const score = container.querySelector('.summary-strip__score');
    expect(score?.textContent).toBe('--');
  });

  it('renders SVG icons for categories', () => {
    const { container } = renderSummaryStrip();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4);
  });

  it('calls onPillTap with correct category', () => {
    const onTap = vi.fn();
    const { container } = renderSummaryStrip({ onPillTap: onTap });
    const pills = container.querySelectorAll('.summary-strip__pill');
    fireEvent.click(pills[1]);
    expect(onTap).toHaveBeenCalledWith('air');
  });

  it('renders as a list with role attributes', () => {
    const { container } = renderSummaryStrip();
    expect(container.querySelector('[role="list"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(4);
  });

  it('renders empty when no pills', () => {
    const { container } = renderSummaryStrip({ pills: [] });
    expect(container.querySelectorAll('.summary-strip__pill').length).toBe(0);
  });
});
