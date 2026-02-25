import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ExportBottomSheet from './ExportBottomSheet';
import { setupTestI18n } from '../test/helpers';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  exportBriefing: vi.fn(),
  downloadPdfBlob: vi.fn(),
}));

describe('ExportBottomSheet', () => {
  let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;
  const mockClose = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockClose,
    vboId: '0363010012345678',
    rdX: 121000,
    rdY: 487000,
    lat: 52.37,
    lng: 4.89,
    address: 'Keizersgracht 100, Amsterdam',
  };

  beforeEach(async () => {
    vi.mocked(api.exportBriefing).mockReset();
    mockClose.mockReset();
    i18nInstance = await setupTestI18n('en');
  });

  function renderSheet(props = {}) {
    return render(
      <I18nextProvider i18n={i18nInstance}>
        <ExportBottomSheet {...defaultProps} {...props} />
      </I18nextProvider>,
    );
  }

  it('renders when open', () => {
    renderSheet();
    expect(screen.getByTestId('export-sheet')).toBeInTheDocument();
    expect(screen.getByText('Download viewing checklist')).toBeInTheDocument();
    expect(screen.getByText('Quick checklist')).toBeInTheDocument();
  });

  it('shows updated Full Dossier page metadata', () => {
    renderSheet();
    expect(screen.getByText('5+ pages')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('export-sheet')).not.toBeInTheDocument();
  });

  it('calls exportBriefing and closes on generate', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet();
    fireEvent.click(screen.getByRole('radio', { name: /Full Dossier/i }));

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          vboId: '0363010012345678',
          address: 'Keizersgracht 100, Amsterdam',
          template: 'full_dossier',
          language: 'en',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('uses segmented language control independent from app language', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet();

    fireEvent.click(screen.getByRole('radio', { name: 'NL' }));
    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'nl' }),
      );
    });
  });

  it('shows error when export fails', async () => {
    vi.mocked(api.exportBriefing).mockRejectedValue(new Error('fail'));
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByText("We couldn't generate the PDF. Try again — your dossier data is still available.")).toBeInTheDocument();
    });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('shows progress stage text while exporting', async () => {
    let resolver: (() => void) | undefined;
    vi.mocked(api.exportBriefing).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolver = () => resolve(new Blob(['pdf'])); }),
    );
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('export-progress')).toBeInTheDocument();
      expect(screen.getByText('Rendering PDF...')).toBeInTheDocument();
    });

    await act(async () => {
      resolver?.();
      await Promise.resolve();
    });
  });

  it('adds progressbar ARIA semantics with current progress values', async () => {
    let resolver: (() => void) | undefined;
    vi.mocked(api.exportBriefing).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolver = () => resolve(new Blob(['pdf'])); }),
    );
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    const progressBar = await screen.findByRole('progressbar', { name: 'Generating...' });
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-valuenow', '65');

    await act(async () => {
      resolver?.();
      await Promise.resolve();
    });
  });
});
