import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { setupTestI18n } from '../test/helpers';
import SearchEvidencePreview from './SearchEvidencePreview';

describe('SearchEvidencePreview', () => {
  it('renders concise source-bound desktop preview copy without banned assurance language', async () => {
    const i18n = await setupTestI18n('en');
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <SearchEvidencePreview />
      </I18nextProvider>,
    );

    expect(screen.getByRole('complementary', { name: 'What you get' })).toBeInTheDocument();
    expect(screen.getByText('What you can verify')).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Source checks become questions',
    })).toBeInTheDocument();
    expect(screen.getByText('Checked sources')).toBeInTheDocument();
    expect(screen.getByText('Questions and requests')).toBeInTheDocument();
    expect(screen.getByText('Confidence and limits')).toBeInTheDocument();
    expect(screen.getByText('After address confirmation')).toBeInTheDocument();
    expect(screen.getByText('We show checked, failed, unavailable, and review states before you open the pack.')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\bproof\b|\bguarantee\b|safe to buy|legal advice|bid advice/i);
  });
});
