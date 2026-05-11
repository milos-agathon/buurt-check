import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
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
  warnings?: string[];
  unavailable?: boolean;
  source?: string;
  sourceDate?: string;
  confidence?: string;
  questionCount?: number;
  firstQuestion?: string;
  limitation?: string;
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
        warnings={props.warnings}
        unavailable={props.unavailable}
        source={props.source}
        sourceDate={props.sourceDate}
        confidence={props.confidence}
        questionCount={props.questionCount}
        firstQuestion={props.firstQuestion}
        limitation={props.limitation}
        onTap={props.onTap}
      />
    </I18nextProvider>,
  );
}

describe('RiskTile', () => {
  it('renders the translated label', () => {
    const { container } = renderTile({});
    const label = container.querySelector('.risk-tile__label');
    expect(label?.textContent).toBe('Road Traffic Noise');
  });

  it('displays numeric score when provided', async () => {
    const { container } = renderTile({ score: 72 });
    await waitFor(() => {
      const score = container.querySelector('.risk-tile__score');
      expect(score?.textContent).toBe('72/100');
    });
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

  it('renders score text when score is provided', async () => {
    const { container } = renderTile({ score: 60, severity: 'moderate' });
    await waitFor(() => {
      expect(container.querySelector('.risk-tile__score')?.textContent).toBe('60/100');
    });
  });

  it('renders unavailable score when score is undefined', () => {
    const { container } = renderTile({ score: undefined });
    expect(container.querySelector('.risk-tile__score--unavailable')?.textContent).toBe('--');
  });

  it('renders summary text when provided', () => {
    const { container } = renderTile({ summary: 'Moderate noise levels' });
    expect(container.querySelector('.risk-tile__summary')).toHaveTextContent('Moderate noise levels');
  });

  it('does not render summary when not provided', () => {
    const { container } = renderTile({});
    expect(container.querySelector('.risk-tile__summary')).not.toBeInTheDocument();
  });

  it('renders first warning code as limitation copy', () => {
    const { getByTestId } = renderTile({ category: 'air', warnings: ['AIR_PARTIAL'] });
    expect(getByTestId('risk-tile-warning-air')).toHaveTextContent(
      'Only partial air quality data is available.',
    );
  });

  it('renders climate limitation copy when climate data is partial', () => {
    const { getByTestId } = renderTile({ category: 'climate', warnings: ['CLIMATE_PARTIAL'] });
    expect(getByTestId('risk-tile-warning-climate')).toHaveTextContent(
      'Only partial climate stress data is available.',
    );
  });

  it('renders chevron icon', () => {
    const { container } = renderTile({ onTap: vi.fn() });
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

  it('renders a complete risk tile evidence contract', async () => {
    renderTile({
      category: 'noise',
      labelKey: 'risk.noise.tileLabel',
      score: 72,
      severity: 'moderate',
      summary: 'Some road noise noticeable, especially with windows open.',
      source: 'RIVM geluidkaart',
      sourceDate: '2025-03',
      confidence: 'Indicative',
      questionCount: 2,
      limitation: 'Indicative open-data signal. Verify during viewing.',
    });

    expect(screen.getByText('Noise')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('72')).toBeInTheDocument();
    });
    expect(screen.getByText(/Moderate/i)).toBeInTheDocument();
    expect(screen.getByText(/Some road noise/i)).toBeInTheDocument();
    expect(screen.getByText(/2 viewing questions/i)).toBeInTheDocument();
    expect(screen.getByText(/RIVM geluidkaart/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-03/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Indicative/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders unavailable risk data as a local degraded state', () => {
    renderTile({
      category: 'air',
      labelKey: 'risk.air.tileLabel',
      severity: 'unavailable',
      unavailable: true,
      source: 'RIVM luchtkwaliteit',
      sourceDate: undefined,
      confidence: 'Unavailable',
      limitation: 'Air quality data is temporarily unavailable for this location.',
    });

    expect(screen.getByText('Air')).toBeInTheDocument();
    expect(screen.getByText(/Data temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/date unknown/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Unavailable/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('/100')).not.toBeInTheDocument();
  });
});
