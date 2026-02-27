import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import QuartileDots from './QuartileDots';
import { setupTestI18n } from '../../test/helpers';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

function renderDots(quartile: number) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QuartileDots quartile={quartile} />
    </I18nextProvider>,
  );
}

describe('QuartileDots', () => {
  it('renders 4 dots', () => {
    renderDots(2);
    const container = screen.getByLabelText('Quartile 2 of 4');
    const dots = container.querySelectorAll('.quartile-dots__dot');
    expect(dots).toHaveLength(4);
  });

  it('fills correct number of dots for quartile 1', () => {
    renderDots(1);
    const container = screen.getByLabelText('Quartile 1 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(1);
  });

  it('fills correct number of dots for quartile 3', () => {
    renderDots(3);
    const container = screen.getByLabelText('Quartile 3 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(3);
  });

  it('fills all dots for quartile 4', () => {
    renderDots(4);
    const container = screen.getByLabelText('Quartile 4 of 4');
    const filled = container.querySelectorAll('.quartile-dots__dot--filled');
    expect(filled).toHaveLength(4);
  });
});
