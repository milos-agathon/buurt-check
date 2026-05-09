import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { setupTestI18n } from '../../test/helpers';
import PackView from './PackView';
import { pack } from './testFixtures';

describe('PackView', () => {
  it('renders buyer-bound pack without generic full-dossier copy', async () => {
    const i18n = await setupTestI18n('en');
    const onShare = vi.fn();
    const onDelete = vi.fn();

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <PackView
          pack={pack}
          onBackToBriefing={() => undefined}
          onShare={onShare}
          onDownload={() => undefined}
          onDelete={onDelete}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: /Pre-Bid Evidence & Questions Pack/i })).toBeInTheDocument();
    expect(screen.getByText(/Bilingual questions/i)).toBeInTheDocument();
    expect(screen.getAllByText(pack.question_groups[0].questions[0].en).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(pack.question_groups[0].questions[0].nl!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share pack/i })).toBeEnabled();
    expect(container).not.toHaveTextContent(/Full Dossier|Volledig dossier|10\+ pages/i);
    fireEvent.click(screen.getByRole('button', { name: /Share pack/i }));
    expect(onShare).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Delete or revoke/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('shows queued review state without implying final content is ready', async () => {
    const i18n = await setupTestI18n('en');

    render(
      <I18nextProvider i18n={i18n}>
        <PackView
          pack={{ ...pack, status: 'queued_for_review' }}
          onBackToBriefing={() => undefined}
          onShare={() => undefined}
          onDelete={() => undefined}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Review pending/i);
    expect(screen.getByRole('button', { name: /Download/i })).toBeDisabled();
  });
});
