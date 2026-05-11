import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import SourceCoveragePanel from './SourceCoveragePanel';
import { coverageRows } from './testFixtures';

describe('SourceCoveragePanel', () => {
  it('renders source method, status, dates, errors, and limitations', async () => {
    const i18n = await setupTestI18n('en');
    const onClose = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <SourceCoveragePanel rows={coverageRows} onClose={onClose} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: /What was checked/i })).toBeInTheDocument();
    expect(screen.getByText(/RIVM noise contours/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-03/i)).toBeInTheDocument();
    expect(screen.getByText(/Modelled outdoor contours/i)).toBeInTheDocument();
    expect(screen.getByText(/Klimaateffectatlas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
