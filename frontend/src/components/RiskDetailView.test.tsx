import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import RiskDetailView from './RiskDetailView';
import { setupTestI18n } from '../test/helpers';
import type { SeverityLevel } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderDetail(props: Partial<Parameters<typeof RiskDetailView>[0]> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <RiskDetailView
        category={props.category ?? 'noise'}
        titleKey={props.titleKey ?? 'risk.noise.title'}
        score={'score' in props ? props.score : 59}
        severity={props.severity ?? 'moderate'}
        onBack={props.onBack ?? vi.fn()}
        meaning={props.meaning}
        comparisons={props.comparisons}
        questions={props.questions}
        checkedQuestions={props.checkedQuestions}
        onToggleQuestion={props.onToggleQuestion}
        source={props.source}
        sourceDate={props.sourceDate}
      />
    </I18nextProvider>,
  );
}

describe('RiskDetailView', () => {
  it('renders the category title in nav', () => {
    const { container } = renderDetail({});
    const navTitle = container.querySelector('.risk-detail__nav-title');
    expect(navTitle?.textContent).toBe('Road Traffic Noise');
  });

  it('displays the numeric score', () => {
    const { container } = renderDetail({ score: 72, severity: 'good' });
    const score = container.querySelector('.risk-detail__score--good');
    expect(score?.textContent).toBe('72/100');
  });

  it('displays -- when score is undefined', () => {
    const { container } = renderDetail({ score: undefined, severity: 'unavailable' as SeverityLevel });
    const score = container.querySelector('.risk-detail__score--unavailable');
    expect(score?.textContent).toBe('--');
  });

  it('fires onBack when back button is clicked', () => {
    const onBack = vi.fn();
    const { container } = renderDetail({ onBack });
    const backBtn = container.querySelector('.risk-detail__back');
    fireEvent.click(backBtn!);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders severity badge', () => {
    const { container } = renderDetail({ severity: 'poor' });
    expect(container.querySelector('.severity-badge')).toBeInTheDocument();
  });

  it('renders meaning section when provided', () => {
    const { container } = renderDetail({ meaning: 'Noise may affect sleep quality.' });
    const meaning = container.querySelector('.risk-detail__meaning');
    expect(meaning?.textContent).toBe('Noise may affect sleep quality.');
  });

  it('does not render meaning section when not provided', () => {
    const { container } = renderDetail({});
    expect(container.querySelector('.risk-detail__meaning')).not.toBeInTheDocument();
  });

  it('renders comparison bars with correct widths', () => {
    const { container } = renderDetail({
      comparisons: [
        { label: 'This address', value: 59 },
        { label: 'City avg', value: 45 },
        { label: 'WHO limit', value: 70, pattern: 'dashed' },
      ],
    });
    const rows = container.querySelectorAll('.risk-detail__comparison-row');
    expect(rows.length).toBe(3);
    const fills = container.querySelectorAll('.risk-detail__comparison-bar-fill');
    expect((fills[0] as HTMLElement).style.width).toBe('59%');
    expect((fills[2] as HTMLElement).style.width).toBe('70%');
  });

  it('renders dashed pattern for WHO limit', () => {
    const { container } = renderDetail({
      comparisons: [{ label: 'WHO', value: 70, pattern: 'dashed' }],
    });
    expect(container.querySelector('.risk-detail__comparison-bar-fill--dashed')).toBeInTheDocument();
  });

  it('renders viewing questions with checkboxes', () => {
    const { container } = renderDetail({
      questions: [
        { text_en: 'Can you hear traffic?', text_nl: 'Hoort u verkeer?' },
        { text_en: 'Check ventilation', text_nl: 'Controleer ventilatie' },
      ],
    });
    const items = container.querySelectorAll('.risk-detail__question-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Can you hear traffic?');
  });

  it('fires onToggleQuestion when checkbox clicked', () => {
    const onToggle = vi.fn();
    const { container } = renderDetail({
      questions: [{ text_en: 'Q1', text_nl: 'V1' }],
      onToggleQuestion: onToggle,
    });
    const checkbox = container.querySelector('.risk-detail__checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('noise-q-0');
  });

  it('shows checked state from checkedQuestions set', () => {
    const checked = new Set(['noise-q-0']);
    const { container } = renderDetail({
      questions: [{ text_en: 'Q1', text_nl: 'V1' }],
      checkedQuestions: checked,
    });
    const checkbox = container.querySelector('.risk-detail__checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders source and disclaimer', () => {
    const { container } = renderDetail({ source: 'RIVM', sourceDate: '2024' });
    expect(container.querySelector('.risk-detail__source')).toBeInTheDocument();
    expect(container.querySelector('.risk-detail__disclaimer')).toBeInTheDocument();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderDetail({ category: 'climate' });
    expect(getByTestId('risk-detail-climate')).toBeInTheDocument();
  });
});
