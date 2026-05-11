import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ExportBottomSheet from './ExportBottomSheet';
import { setupTestI18n } from '../test/helpers';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  exportBriefing: vi.fn(),
  downloadPdfBlob: vi.fn(),
  sharePdfBlob: vi.fn(),
}));

vi.mock('../services/clientEvents', () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from '../services/clientEvents';
const mockTrackEvent = vi.mocked(trackEvent);

describe('ExportBottomSheet', () => {
  const fullDossierRadio = /Full dossier/i;
  const fullDossierRadioNl = /Volledig dossier/i;
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
    isEntitled: true,
    shadowSnapshotsReady: true,
  };

  beforeEach(async () => {
    vi.mocked(api.exportBriefing).mockReset();
    vi.mocked(api.downloadPdfBlob).mockReset();
    vi.mocked(api.sharePdfBlob).mockReset();
    mockTrackEvent.mockReset();
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
    expect(screen.getByText('Download evidence')).toBeInTheDocument();
    expect(screen.getByText(
      'Choose format and language. Quick checklist is free; full dossier is paid per address.',
      { selector: '.export-sheet__intro' },
    )).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Quick checklist/i })).toBeInTheDocument();
  });

  it('shows updated full dossier metadata', () => {
    renderSheet();
    expect(screen.getByText('Questions, requests, sources')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('export-sheet')).not.toBeInTheDocument();
  });

  it('calls exportBriefing and closes on generate', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet();
    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

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
    expect(mockTrackEvent).toHaveBeenCalledWith('pdf_export_clicked', {
      template: 'full_dossier',
      report_id: 'none',
      vbo_id: '0363010012345678',
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith('pdf_export_completed', {
      template: 'full_dossier',
      report_id: 'none',
      vbo_id: '0363010012345678',
    });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('auto-generates after purchase continuation and still requires manual dossier download', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    let resolveExport!: (value: Blob) => void;
    vi.mocked(api.exportBriefing).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolveExport = resolve; }),
    );
    renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-123',
    });

    expect(screen.queryByTestId('export-generate-btn')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'full_dossier',
          language: 'en',
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'generating');
    });
    expect(screen.getByText('Building Full dossier')).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'post_checkout_export_checkpoint',
      expect.objectContaining({
        checkpoint: 'auto_generate_started',
        template: 'full_dossier',
        trigger: 'automatic',
      }),
    );
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'post_checkout_export_checkpoint',
      expect.objectContaining({ checkpoint: 'download_attempt_started' }),
    );
    expect(api.downloadPdfBlob).not.toHaveBeenCalled();

    await act(async () => {
      resolveExport(blob);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(screen.getByText('Full dossier ready')).toBeInTheDocument();
    expect(screen.getByTestId('export-post-checkout-ready')).toHaveTextContent(
      'Your Full dossier is ready. Tap Download to save it.',
    );
    expect(screen.queryByRole('button', { name: /Generate Full dossier/i })).not.toBeInTheDocument();
    expect(api.downloadPdfBlob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Download Full dossier/i }));

    await waitFor(() => {
      expect(api.downloadPdfBlob).toHaveBeenCalledWith(
        blob,
        'buurt-check-full-dossier-0363010012345678.pdf',
      );
    });
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'post_checkout_export_checkpoint',
      expect.objectContaining({
        checkpoint: 'download_attempt_started',
        template: 'full_dossier',
        trigger: 'manual_button',
      }),
    );
  });

  it('waits for prerequisites and hides export controls in post-checkout recovery', async () => {
    const view = renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-123',
      sunlightReady: false,
      sunlightFailed: false,
      shadowSnapshots: [
        { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'waiting_prerequisites');
    });
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('export-post-checkout-waiting')).toHaveTextContent(
      'Your Full dossier is unlocked. We will prepare it automatically. This can take a moment.',
    );
    expect(screen.queryByText(
      'Choose format and language. Quick checklist is free; full dossier is paid per address.',
      { selector: '.export-sheet__intro' },
    )).not.toBeInTheDocument();
    expect(screen.getByTestId('export-progress')).toBeInTheDocument();
    expect(screen.getByText('Preparing Full dossier...')).toBeInTheDocument();
    expect(api.exportBriefing).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio', { name: /Quick checklist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'EN' })).not.toBeInTheDocument();
    expect(screen.queryByText('Include shadow snapshot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-generate-btn')).not.toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'post_checkout_export_checkpoint',
      expect.objectContaining({
        checkpoint: 'waiting_prerequisites',
        template: 'full_dossier',
      }),
    );

    view.rerender(
      <I18nextProvider i18n={i18nInstance}>
        <ExportBottomSheet
          {...defaultProps}
          initialTemplate="full_dossier"
          autoGenerateToken="paid-report-123"
          sunlightReady={true}
          sunlightFailed={false}
          shadowSnapshots={[
            { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
          ]}
        />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledTimes(1);
    });
  });

  it('waits for shadow snapshots before auto-generating in post-checkout recovery', async () => {
    const view = renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-456',
      sunlightReady: true,
      sunlightFailed: false,
      shadowSnapshotsReady: false,
      shadowSnapshotsFailed: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'waiting_prerequisites');
    });
    expect(api.exportBriefing).not.toHaveBeenCalled();
    expect(screen.getByTestId('export-post-checkout-waiting')).toHaveTextContent(
      'Your Full dossier is unlocked. We will prepare it automatically. This can take a moment.',
    );

    view.rerender(
      <I18nextProvider i18n={i18nInstance}>
        <ExportBottomSheet
          {...defaultProps}
          initialTemplate="full_dossier"
          autoGenerateToken="paid-report-456"
          sunlightReady={true}
          sunlightFailed={false}
          shadowSnapshotsReady={true}
          shadowSnapshotsFailed={false}
          shadowSnapshots={[
            { label: 'winter', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
            { label: 'equinox', hour: 12, dataUrl: 'data:image/png;base64,BBB', viewpoint: 'top' },
            { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,CCC', viewpoint: 'top' },
          ]}
        />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps waiting when post-checkout prerequisites never resolve', async () => {
    vi.useFakeTimers();
    try {
      renderSheet({
        initialTemplate: 'full_dossier',
        autoGenerateToken: 'paid-report-123',
        sunlightReady: false,
        sunlightFailed: false,
      });

      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'waiting_prerequisites');
      expect(screen.getByText('Preparing Full dossier...')).toBeInTheDocument();
      expect(api.exportBriefing).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(api.exportBriefing).not.toHaveBeenCalled();
      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'waiting_prerequisites');
      expect(screen.getByText('Preparing Full dossier...')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks close requests during waiting and generating, then allows close after dossier is ready', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    let resolveExport!: (value: Blob) => void;
    const view = renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-123',
      sunlightReady: false,
      sunlightFailed: false,
    });

    fireEvent.pointerDown(screen.getByTestId('bottom-sheet-overlay'));
    fireEvent.click(screen.getByTestId('bottom-sheet-overlay'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).not.toHaveBeenCalled();

    vi.mocked(api.exportBriefing).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolveExport = resolve; }),
    );

    view.rerender(
      <I18nextProvider i18n={i18nInstance}>
        <ExportBottomSheet
          {...defaultProps}
          initialTemplate="full_dossier"
          autoGenerateToken="paid-report-123"
          sunlightReady={true}
          sunlightFailed={false}
        />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('export-post-checkout-state')).toHaveAttribute('data-phase', 'generating');
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveExport(blob);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    fireEvent.pointerDown(screen.getByTestId('bottom-sheet-overlay'));
    fireEvent.click(screen.getByTestId('bottom-sheet-overlay'));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('shows retry after a post-checkout export error and allows retrying the generation flow', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    vi.mocked(api.exportBriefing)
      .mockRejectedValueOnce(new Error('export failed'))
      .mockResolvedValueOnce(blob);

    renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-123',
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-retry-btn')).toBeInTheDocument();
    });
    expect(screen.getByText("We couldn't generate the PDF. Try again. Your briefing data is still available.")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);
    mockClose.mockClear();

    fireEvent.click(screen.getByTestId('export-retry-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'post_checkout_export_checkpoint',
      expect.objectContaining({
        checkpoint: 'auto_generate_started',
        template: 'full_dossier',
        trigger: 'retry_button',
      }),
    );
  });

  it('keeps the ready state visible and logs download failures in post-checkout recovery', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    vi.mocked(api.exportBriefing).mockResolvedValue(blob);
    vi.mocked(api.downloadPdfBlob).mockRejectedValueOnce(new Error('download failed'));

    renderSheet({
      initialTemplate: 'full_dossier',
      autoGenerateToken: 'paid-report-123',
    });

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Download Full dossier/i }));

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'post_checkout_export_checkpoint',
        expect.objectContaining({
          checkpoint: 'download_attempt_failed',
          template: 'full_dossier',
          trigger: 'manual_button',
        }),
      );
    });
    expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Full dossier/i })).toBeInTheDocument();
  });

  it('uses compact NL slash EN language control independent from app language', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet();

    const languageControl = screen.getByRole('radiogroup', { name: 'Language' });
    expect(languageControl).toHaveTextContent('NL/EN');
    expect(languageControl.querySelector('.export-sheet__language-separator')).toHaveTextContent('/');

    fireEvent.click(screen.getByRole('radio', { name: 'NL' }));
    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'nl' }),
      );
    });
  });

  it('forwards municipality separately from city in the export payload', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet({ city: 'Amstelveen', municipality: 'Amsterdam' });

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Amstelveen',
          municipality: 'Amsterdam',
        }),
      );
    });
  });

  it('prefers the summer seasonal shadow snapshot for quick brief export', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet({
      shadowSnapshots: [
        { label: 'winter', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
        { label: 'equinox', hour: 12, dataUrl: 'data:image/png;base64,BBB', viewpoint: 'top' },
        { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,CCC', viewpoint: 'top' },
      ],
    });

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          shadowImageB64: 'CCC',
        }),
      );
    });
  });

  it('maps seasonal shadow fields for questions pack export', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet({
      shadowSnapshots: [
        { label: 'winter', hour: 12, dataUrl: 'data:image/png;base64,AAA', viewpoint: 'top' },
        { label: 'equinox', hour: 12, dataUrl: 'data:image/png;base64,BBB', viewpoint: 'top' },
        { label: 'summer', hour: 12, dataUrl: 'data:image/png;base64,CCC', viewpoint: 'top' },
      ],
    });
    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));
    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          shadowImageB64: 'AAA',
          shadowEquinoxB64: 'BBB',
          shadowSummerB64: 'CCC',
        }),
      );
    });
  });

  it('awaits onBeforeGenerate before calling export API', async () => {
    let releasePreflight: (() => void) | undefined;
    const onBeforeGenerate = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { releasePreflight = resolve; }),
    );
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    renderSheet({ onBeforeGenerate });
    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    expect(onBeforeGenerate).toHaveBeenCalledWith('full_dossier');
    expect(api.exportBriefing).not.toHaveBeenCalled();

    await act(async () => {
      releasePreflight?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalled();
    });
  });

  it('shows error and aborts export when onBeforeGenerate fails', async () => {
    const onBeforeGenerate = vi.fn().mockRejectedValue(new Error('sunlight sync failed'));
    renderSheet({ onBeforeGenerate });
    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByText("We couldn't generate the PDF. Try again. Your briefing data is still available.")).toBeInTheDocument();
    });
    expect(api.exportBriefing).not.toHaveBeenCalled();
  });

  it('shows language mismatch warning when export language differs from UI language', () => {
    renderSheet();
    // UI language is 'en', default export language matches
    expect(screen.queryByTestId('export-language-warning')).not.toBeInTheDocument();

    // Switch export language to NL while UI is EN
    fireEvent.click(screen.getByRole('radio', { name: 'NL' }));
    expect(screen.getByTestId('export-language-warning')).toBeInTheDocument();
    expect(screen.getByTestId('export-language-warning')).toHaveTextContent('PDF will be generated in Nederlands');
  });

  it('hides language mismatch warning when export language matches UI language', () => {
    renderSheet();
    // Switch to NL then back to EN
    fireEvent.click(screen.getByRole('radio', { name: 'NL' }));
    expect(screen.getByTestId('export-language-warning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.queryByTestId('export-language-warning')).not.toBeInTheDocument();
  });

  it('shows language mismatch warning with NL UI language', async () => {
    const nlI18n = await setupTestI18n('nl');
    render(
      <I18nextProvider i18n={nlI18n}>
        <ExportBottomSheet {...defaultProps} />
      </I18nextProvider>,
    );

    // Default export language should match NL UI — no warning
    expect(screen.queryByTestId('export-language-warning')).not.toBeInTheDocument();

    // Switch export to EN while UI is NL
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.getByTestId('export-language-warning')).toBeInTheDocument();
    expect(screen.getByTestId('export-language-warning')).toHaveTextContent('PDF wordt gegenereerd in het English');
  });

  it('uses the stored export language during post-checkout recovery', async () => {
    const nlI18n = await setupTestI18n('nl');
    vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));

    render(
      <I18nextProvider i18n={nlI18n}>
        <ExportBottomSheet
          {...defaultProps}
          initialTemplate="full_dossier"
          initialExportLanguage="en"
          autoGenerateToken="paid-report-789"
        />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'full_dossier',
          language: 'en',
        }),
      );
    });
  });

  it('shows error when export fails', async () => {
    vi.mocked(api.exportBriefing).mockRejectedValue(new Error('fail'));
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByText("We couldn't generate the PDF. Try again. Your briefing data is still available.")).toBeInTheDocument();
    });
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('shows Buy Full dossier flow for non-entitled users', async () => {
    const onBuyFullDossier = vi.fn();
    renderSheet({ isEntitled: false, onBuyFullDossier });

    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));
    fireEvent.click(screen.getByTestId('export-generate-btn'));

    expect(onBuyFullDossier).toHaveBeenCalledOnce();
    expect(api.exportBriefing).not.toHaveBeenCalled();
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
      expect(screen.getByText('Rendering source appendix...')).toBeInTheDocument();
    });

    await act(async () => {
      resolver?.();
      await Promise.resolve();
    });
  });

  it('downloads the generated PDF from the ready actions', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    vi.mocked(api.exportBriefing).mockResolvedValue(blob);
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => {
      expect(api.downloadPdfBlob).toHaveBeenCalledWith(
        blob,
        'buurt-check-quick-brief-0363010012345678.pdf',
      );
    });
  });

  it('shares the generated PDF from the ready actions', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    vi.mocked(api.exportBriefing).mockResolvedValue(blob);
    vi.mocked(api.sharePdfBlob).mockResolvedValue(true);
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('export-ready-actions')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Share PDF/i }));

    await waitFor(() => {
      expect(api.sharePdfBlob).toHaveBeenCalledWith(
        blob,
        'buurt-check-quick-brief-0363010012345678.pdf',
        'Download evidence',
      );
    });
  });

  it('shows the localized full dossier price in the template card only', () => {
    renderSheet({
      isEntitled: false,
      buyPriceLabel: '$4.99',
    });

    expect(screen.getByRole('radio', { name: fullDossierRadio })).toHaveTextContent('Full dossier ($4.99)');
    expect(screen.queryByTestId('export-buy-price')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

    expect(screen.getByRole('radio', { name: fullDossierRadio })).toHaveTextContent('Full dossier ($4.99)');
    expect(screen.queryByTestId('export-buy-price')).not.toBeInTheDocument();
  });

  it('uses the taller export sheet sizing for the template chooser flow', () => {
    renderSheet();

    expect(screen.getByRole('dialog')).toHaveStyle({
      maxHeight: '72vh',
      minHeight: '72vh',
    });
  });

  it('disables the buy button and shows the checkout-unavailable message', () => {
    renderSheet({
      isEntitled: false,
      buyDisabled: true,
      buyDisabledMessage: 'Checkout is temporarily unavailable.',
    });

    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

    expect(screen.getByTestId('export-generate-btn')).toBeDisabled();
    expect(screen.getByTestId('export-buy-unavailable')).toHaveTextContent(
      'Checkout is temporarily unavailable.',
    );
  });

  describe('sunlight readiness messaging', () => {
    it('keeps Generate enabled for full_dossier when sunlight is still computing', () => {
      renderSheet({ sunlightReady: false });
    fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      const btn = screen.getByTestId('export-generate-btn');
      expect(btn).not.toBeDisabled();
    });

    it('does NOT disable Generate button for quick_brief when sunlight not ready', () => {
      renderSheet({ sunlightReady: false });
      // quick_brief is the default template
      const btn = screen.getByTestId('export-generate-btn');
      expect(btn).not.toBeDisabled();
    });

    it('enables Generate button for full_dossier when sunlight is ready', () => {
      renderSheet({ sunlightReady: true });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      const btn = screen.getByTestId('export-generate-btn');
      expect(btn).not.toBeDisabled();
    });

    it('shows computing status for full_dossier when sunlight not ready', () => {
      renderSheet({ sunlightReady: false });
      // Status should not show for quick_brief
      expect(screen.queryByTestId('export-sunlight-computing')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));
      expect(screen.getByTestId('export-sunlight-computing')).toBeInTheDocument();
      expect(screen.getByTestId('export-sunlight-computing')).toHaveTextContent('Calculating sunlight analysis...');
    });

    it('hides computing status when sunlight is ready', () => {
      renderSheet({ sunlightReady: true });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      expect(screen.queryByTestId('export-sunlight-computing')).not.toBeInTheDocument();
    });

    it('shows warning when sunlight failed for full_dossier', () => {
      renderSheet({ sunlightReady: true, sunlightFailed: true });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      expect(screen.getByTestId('export-sunlight-warning')).toBeInTheDocument();
      expect(screen.getByTestId('export-sunlight-warning')).toHaveTextContent(
        'Sunlight analysis was not completed before export',
      );
    });

    it('does NOT show warning when sunlight succeeded', () => {
      renderSheet({ sunlightReady: true, sunlightFailed: false });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      expect(screen.queryByTestId('export-sunlight-warning')).not.toBeInTheDocument();
    });

    it('allows export when sunlight failed (ready=true, failed=true)', () => {
      renderSheet({ sunlightReady: true, sunlightFailed: true });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      const btn = screen.getByTestId('export-generate-btn');
      expect(btn).not.toBeDisabled();
    });

    it('still allows full_dossier export when sunlight is still computing', async () => {
      vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
      renderSheet({ sunlightReady: false });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      const btn = screen.getByTestId('export-generate-btn');
      expect(btn).not.toBeDisabled();
      fireEvent.click(btn);
      await waitFor(() => {
        expect(api.exportBriefing).toHaveBeenCalledWith(
          expect.objectContaining({
            template: 'full_dossier',
          }),
        );
      });
    });

    it('does NOT show sunlight warning for quick_brief template', () => {
      renderSheet({ sunlightReady: true, sunlightFailed: true });
      // Stay on quick_brief (default)
      expect(screen.queryByTestId('export-sunlight-warning')).not.toBeInTheDocument();
    });

    it('shows NL sunlight computing text in Dutch locale', async () => {
      const nlI18n = await setupTestI18n('nl');
      render(
        <I18nextProvider i18n={nlI18n}>
          <ExportBottomSheet {...defaultProps} sunlightReady={false} />
        </I18nextProvider>,
      );
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadioNl }));

      expect(screen.getByTestId('export-sunlight-computing')).toHaveTextContent(
        'Zonlichtanalyse wordt berekend...',
      );
    });

    it('shows NL sunlight warning text in Dutch locale', async () => {
      const nlI18n = await setupTestI18n('nl');
      render(
        <I18nextProvider i18n={nlI18n}>
          <ExportBottomSheet {...defaultProps} sunlightReady={true} sunlightFailed={true} />
        </I18nextProvider>,
      );
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadioNl }));

      expect(screen.getByTestId('export-sunlight-warning')).toHaveTextContent(
        'Zonlichtanalyse was niet voltooid voor export',
      );
    });

    it('keeps Generate enabled for full_dossier while shadow snapshots are still pending', () => {
      renderSheet({
        sunlightReady: true,
        shadowSnapshotsReady: false,
        shadowSnapshotsFailed: false,
      });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      expect(screen.getByTestId('export-shadow-computing')).toHaveTextContent('Capturing shadow analysis...');
      expect(screen.getByTestId('export-generate-btn')).not.toBeDisabled();
    });

    it('still allows full_dossier export while shadow snapshots are still pending', async () => {
      vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
      renderSheet({
        sunlightReady: true,
        shadowSnapshotsReady: false,
        shadowSnapshotsFailed: false,
      });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      fireEvent.click(screen.getByTestId('export-generate-btn'));

      await waitFor(() => {
        expect(api.exportBriefing).toHaveBeenCalledWith(
          expect.objectContaining({
            template: 'full_dossier',
          }),
        );
      });
    });

    it('shows a shadow warning and still allows full_dossier export when shadow capture failed', async () => {
      vi.mocked(api.exportBriefing).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
      renderSheet({
        sunlightReady: true,
        shadowSnapshotsReady: true,
        shadowSnapshotsFailed: true,
      });
      fireEvent.click(screen.getByRole('radio', { name: fullDossierRadio }));

      expect(screen.getByTestId('export-shadow-warning')).toHaveTextContent(
        'Shadow analysis was not completed before export',
      );
      expect(screen.getByTestId('export-generate-btn')).not.toBeDisabled();

      fireEvent.click(screen.getByTestId('export-generate-btn'));

      await waitFor(() => {
        expect(api.exportBriefing).toHaveBeenCalledWith(
          expect.objectContaining({
            template: 'full_dossier',
          }),
        );
      });
    });
  });

  it('uses indeterminate progressbar during API call (no aria-valuenow)', async () => {
    let resolver: (() => void) | undefined;
    vi.mocked(api.exportBriefing).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolver = () => resolve(new Blob(['pdf'])); }),
    );
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    const progressBar = await screen.findByRole('progressbar', { name: 'Generating...' });
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    // During API call, progress is indeterminate — no aria-valuenow
    expect(progressBar).not.toHaveAttribute('aria-valuenow');

    // The SVG should have the indeterminate animation class
    const svg = progressBar.querySelector('.export-sheet__progress-svg');
    expect(svg).toHaveClass('export-sheet__progress-svg--indeterminate');

    // Percentage text should be hidden during indeterminate phase
    expect(progressBar.querySelector('.export-sheet__progress-percent')).toBeNull();

    await act(async () => {
      resolver?.();
      await Promise.resolve();
    });
  });
});
