import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import SeverityBadge from './SeverityBadge';
import { setupTestI18n } from '../../test/helpers';
import type { SeverityLevel } from '../../types/api';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderBadge(severity: SeverityLevel, size?: 'sm' | 'md') {
  return render(
    <I18nextProvider i18n={i18n}>
      <SeverityBadge severity={severity} size={size} />
    </I18nextProvider>,
  );
}

describe('SeverityBadge', () => {
  it('renders good severity with correct class', () => {
    const { container } = renderBadge('good');
    const badge = container.querySelector('.severity-badge--good');
    expect(badge).toBeInTheDocument();
  });

  it('renders moderate severity with correct class', () => {
    const { container } = renderBadge('moderate');
    expect(container.querySelector('.severity-badge--moderate')).toBeInTheDocument();
  });

  it('renders poor severity with correct class', () => {
    const { container } = renderBadge('poor');
    expect(container.querySelector('.severity-badge--poor')).toBeInTheDocument();
  });

  it('renders critical severity with correct class', () => {
    const { container } = renderBadge('critical');
    expect(container.querySelector('.severity-badge--critical')).toBeInTheDocument();
  });

  it('renders unavailable severity with correct class', () => {
    const { container } = renderBadge('unavailable');
    expect(container.querySelector('.severity-badge--unavailable')).toBeInTheDocument();
  });

  it('renders SVG icon', () => {
    const { container } = renderBadge('good');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('supports sm size', () => {
    const { container } = renderBadge('good', 'sm');
    expect(container.querySelector('.severity-badge--sm')).toBeInTheDocument();
  });

  it('defaults to md size', () => {
    const { container } = renderBadge('good');
    expect(container.querySelector('.severity-badge--md')).toBeInTheDocument();
  });
});
