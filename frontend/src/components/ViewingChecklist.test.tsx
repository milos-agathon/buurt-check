import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

const poorCategory: QuestionCategory = {
  name: 'Air Quality',
  name_nl: 'Luchtkwaliteit',
  severity: 'poor',
  questions: [
    { text_en: 'Check air filters', text_nl: 'Controleer luchtfilters' },
  ],
};

function renderChecklist(
  categories: QuestionCategory[] = [moderateCategory, goodCategory, poorCategory],
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
  it('only renders moderate or worse categories', () => {
    const { container } = renderChecklist();
    const groups = container.querySelectorAll('.viewing-checklist__group');
    expect(groups.length).toBe(2); // moderate + poor, not good
  });

  it('renders category name', () => {
    const { container } = renderChecklist([moderateCategory]);
    const name = container.querySelector('.viewing-checklist__group-name');
    expect(name?.textContent).toBe('Noise');
  });

  it('renders questions with checkboxes', () => {
    const { container } = renderChecklist([moderateCategory]);
    const items = container.querySelectorAll('.viewing-checklist__item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Can you hear traffic with windows closed?');
  });

  it('fires onToggleQuestion when checkbox clicked', () => {
    const onToggle = vi.fn();
    const { container } = renderChecklist([moderateCategory], new Set(), onToggle);
    const checkboxes = container.querySelectorAll('.viewing-checklist__checkbox');
    fireEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith('noise-q-0');
  });

  it('shows checked state from checkedQuestions set', () => {
    const checked = new Set(['noise-q-1']);
    const { container } = renderChecklist([moderateCategory], checked);
    const checkboxes = container.querySelectorAll('.viewing-checklist__checkbox') as NodeListOf<HTMLInputElement>;
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('renders nothing when all categories are good', () => {
    const { container } = renderChecklist([goodCategory]);
    expect(container.querySelector('.viewing-checklist')).not.toBeInTheDocument();
  });

  it('renders severity badge per group', () => {
    const { container } = renderChecklist([moderateCategory]);
    expect(container.querySelector('.severity-badge')).toBeInTheDocument();
  });

  it('has correct test id', () => {
    const { getByTestId } = renderChecklist([moderateCategory]);
    expect(getByTestId('viewing-checklist')).toBeInTheDocument();
  });
});
