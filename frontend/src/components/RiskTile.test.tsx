import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import RiskTile from './RiskTile';
import { setupTestI18n } from '../test/helpers';
import type { SeverityLevel } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderTile(props: {
  category?: string;
  labelKey?: string;
  score?: number;
  severity?: SeverityLevel;
  summary?: string;
  onTap?: () => void;
}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RiskTile
        category={props.category ?? 'noise'}
        labelKey={props.labelKey ?? 'risk.noise.title'}
        score={props.score}
        severity={props.severity ?? 'moderate'}
        summary={props.summary}
        onTap={props.onTap}
      />
    </I18nextProvider>,
  );
}

describe('RiskTile', () => {
  it('renders the translated label', () => {
    const { container } = renderTile({});
    const label = container.querySelector('.risk-tile__label');
    expect(label?.textContent).toBe('Road Traffic Noise (Lden)');
  });

  it('displays numeric score when provided', () => {
    const { container } = renderTile({ score: 72 });
    const score = container.querySelector('.risk-tile__score');
    expect(score?.textContent).toBe('72');
  });

  it('displays -- when score is undefined', () => {
    const { container } = renderTile({ score: undefined });
    const score = container.querySelector('.risk-tile__score--unavailable');
    expect(score?.textContent).toBe('--');
  });

  it('applies correct severity color class', () => {
    const { container } = renderTile({ score: 85, severity: 'good' });
    expect(container.querySelector('.risk-tile__score--good')).toBeInTheDocument();
  });

  it('renders severity badge', () => {
    const { container } = renderTile({ severity: 'poor' });
    expect(container.querySelector('.severity-badge')).toBeInTheDocument();
  });

  it('renders ScoreBar when score is provided', () => {
    const { container } = renderTile({ score: 60, severity: 'moderate' });
    expect(container.querySelector('.score-bar')).toBeInTheDocument();
  });

  it('does not render ScoreBar when score is undefined', () => {
    const { container } = renderTile({ score: undefined });
    expect(container.querySelector('.score-bar')).not.toBeInTheDocument();
  });

  it('renders summary text when provided', () => {
    const { container } = renderTile({ summary: 'Moderate noise levels' });
    const summary = container.querySelector('.risk-tile__summary');
    expect(summary?.textContent).toBe('Moderate noise levels');
  });

  it('does not render summary when not provided', () => {
    const { container } = renderTile({});
    expect(container.querySelector('.risk-tile__summary')).not.toBeInTheDocument();
  });

  it('renders chevron icon', () => {
    const { container } = renderTile({});
    expect(container.querySelector('.risk-tile__chevron')).toBeInTheDocument();
  });

  it('fires onTap callback when clicked', () => {
    const onTap = vi.fn();
    const { container } = renderTile({ onTap });
    const button = container.querySelector('.risk-tile');
    fireEvent.click(button!);
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('renders with correct test id', () => {
    const { getByTestId } = renderTile({ category: 'climate' });
    expect(getByTestId('risk-tile-climate')).toBeInTheDocument();
  });
});
