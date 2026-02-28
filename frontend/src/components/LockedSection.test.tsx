import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { setupTestI18n } from '../test/helpers';
import LockedSection from './LockedSection';

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeEach(async () => {
  i18n = await setupTestI18n('en');
});

function renderLockedSection(props?: Partial<ComponentProps<typeof LockedSection>>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LockedSection
        sectionName="property warnings"
        {...props}
      />
    </I18nextProvider>,
  );
}

describe('LockedSection', () => {
  it('renders lock message with section name', () => {
    renderLockedSection();
    expect(screen.getByText(/property warnings/i)).toBeInTheDocument();
  });

  it('does not render an inline purchase button', () => {
    renderLockedSection();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has an accessible region label', () => {
    renderLockedSection();
    expect(screen.getByRole('region')).toHaveAttribute('aria-label');
  });
});
