import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ViewingChecklist from './ViewingChecklist';
import { setupTestI18n } from '../test/helpers';
import type { QuestionCategory } from '../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

const moderateCategory: QuestionCategory = {
  name: 'Noise',
  name_nl: 'Geluid',
  severity: 'moderate',
  questions: [
    { text_en: 'Can you hear traffic with windows closed?', text_nl: 'Hoort u verkeer met gesloten ramen?' },
    { text_en: 'Check ventilation system', text_nl: 'Controleer ventilatiesysteem' },
  ],
};

const goodCategory: QuestionCategory = {
  name: 'Climate',
  name_nl: 'Klimaat',
  severity: 'good',
  questions: [
    { text_en: 'Any heat issues?', text_nl: 'Warmteproblemen?' },
  ],
};

function renderChecklist(
  categories: QuestionCategory[] = [goodCategory, moderateCategory],
  checked: Set<string> = new Set(),
  onToggle = vi.fn(),
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ViewingChecklist
        categories={categories}
        checkedQuestions={checked}
        onToggleQuestion={onToggle}
      />
    </I18nextProvider>,
  );
}

describe('ViewingChecklist', () => {
  it('renders flagged categories before good categories', () => {
    const { container } = renderChecklist();
    const groups = Array.from(container.querySelectorAll('.viewing-checklist__group-name')).map(
      (node) => node.textContent,
    );
    expect(groups).toEqual(['Noise', 'Climate']);
  });

  it('renders good-category confirmation questions', () => {
    renderChecklist([goodCategory]);
    expect(screen.getByText('Climate')).toBeInTheDocument();
    expect(screen.getByText('Any heat issues?')).toBeInTheDocument();
  });

  it('fires onToggleQuestion when checkbox clicked', () => {
    const onToggle = vi.fn();
    const { container } = renderChecklist([moderateCategory], new Set(), onToggle);
    const checkbox = container.querySelector('.viewing-checklist__checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('noise-q-0');
  });

  it('shows checked state from checkedQuestions set', () => {
    const checked = new Set(['noise-q-1']);
    const { container } = renderChecklist([moderateCategory], checked);
    const checkboxes = container.querySelectorAll('.viewing-checklist__checkbox') as NodeListOf<HTMLInputElement>;
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('renders an empty state when there are no categories', () => {
    renderChecklist([]);
    expect(screen.getByText('No viewing questions are available yet for this address.')).toBeInTheDocument();
  });

  it('renders an error state with retry when provided', () => {
    const onRetry = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ViewingChecklist
          checkedQuestions={new Set()}
          onToggleQuestion={vi.fn()}
          error="Checklist unavailable"
          onRetry={onRetry}
        />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
