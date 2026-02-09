import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import { exportBriefing } from '../services/api';
import type { ShadowSnapshot } from '../types/api';
import './ExportBottomSheet.css';

interface ExportBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  vboId: string;
  rdX: number;
  rdY: number;
  lat: number;
  lng: number;
  address: string;
  shadowSnapshots?: ShadowSnapshot[] | null;
}

export default function ExportBottomSheet({
  isOpen,
  onClose,
  vboId,
  rdX,
  rdY,
  lat,
  lng,
  address,
  shadowSnapshots,
}: ExportBottomSheetProps) {
  const { t, i18n } = useTranslation();
  const [includeShadows, setIncludeShadows] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(false);
    try {
      let shadowB64: string | undefined;
      if (includeShadows && shadowSnapshots && shadowSnapshots.length > 0) {
        // Use the first (noon) snapshot
        const noonSnapshot = shadowSnapshots.find(s => s.hour === 12) || shadowSnapshots[0];
        // Strip data URL prefix if present
        const dataUrl = noonSnapshot.dataUrl;
        shadowB64 = dataUrl.startsWith('data:')
          ? dataUrl.split(',')[1]
          : dataUrl;
      }

      await exportBriefing({
        vboId,
        rdX,
        rdY,
        lat,
        lng,
        address,
        language: i18n.language === 'nl' ? 'nl' : 'en',
        shadowImageB64: shadowB64,
      });
      onClose();
    } catch {
      setError(true);
    } finally {
      setGenerating(false);
    }
  };

  const hasShadows = shadowSnapshots && shadowSnapshots.length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="45vh">
      <div className="export-sheet" data-testid="export-sheet">
        <h3 className="export-sheet__title">{t('export.title', 'Export Briefing')}</h3>

        <div className="export-sheet__option">
          <span className="export-sheet__label">{t('export.template', 'Template')}</span>
          <span className="export-sheet__value">{t('export.quickBrief', 'Quick Brief')}</span>
        </div>

        <div className="export-sheet__option">
          <span className="export-sheet__label">{t('export.language', 'Language')}</span>
          <span className="export-sheet__value">
            {i18n.language === 'nl' ? 'Nederlands' : 'English'}
          </span>
        </div>

        {hasShadows && (
          <label className="export-sheet__toggle">
            <input
              type="checkbox"
              checked={includeShadows}
              onChange={(e) => setIncludeShadows(e.target.checked)}
            />
            <span>{t('export.includeShadows', 'Include shadow snapshot')}</span>
          </label>
        )}

        {error && (
          <p className="export-sheet__error">{t('export.error', 'Export failed. Please try again.')}</p>
        )}

        <button
          className="export-sheet__btn"
          onClick={handleGenerate}
          disabled={generating}
          data-testid="export-generate-btn"
        >
          {generating
            ? t('export.generating', 'Generating...')
            : t('export.generate', 'Generate PDF')}
        </button>
      </div>
    </BottomSheet>
  );
}
