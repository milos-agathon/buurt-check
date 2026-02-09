import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ExportBottomSheet from './ExportBottomSheet';
import { setupTestI18n } from '../test/helpers';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  exportBriefing: vi.fn(),
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
    expect(screen.getByText('Export Briefing')).toBeInTheDocument();
    expect(screen.getByText('Quick Brief')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderSheet({ isOpen: false });
    expect(screen.queryByTestId('export-sheet')).not.toBeInTheDocument();
  });

  it('calls exportBriefing and closes on generate', async () => {
    vi.mocked(api.exportBriefing).mockResolvedValue(undefined);
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(api.exportBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          vboId: '0363010012345678',
          address: 'Keizersgracht 100, Amsterdam',
          language: 'en',
        }),
      );
    });

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalled();
    });
  });

  it('shows error when export fails', async () => {
    vi.mocked(api.exportBriefing).mockRejectedValue(new Error('fail'));
    renderSheet();

    fireEvent.click(screen.getByTestId('export-generate-btn'));

    await waitFor(() => {
      expect(screen.getByText('Export failed. Please try again.')).toBeInTheDocument();
    });
    expect(mockClose).not.toHaveBeenCalled();
  });
});
