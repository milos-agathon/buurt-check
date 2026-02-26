import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import ContextualTooltip from './ui/ContextualTooltip';
import { hasSeenTooltip, markTooltipSeen } from '../services/tooltipTracker';
import { downloadPdfBlob, exportBriefing } from '../services/api';
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
  street?: string;
  city?: string;
  buurtCode?: string;
  postcode?: string;
  houseNumber?: string;
  houseLetter?: string;
  addition?: string;
  shadowSnapshots?: ShadowSnapshot[] | null;
  onGenerateStart?: () => void;
  onGenerateSuccess?: () => void;
  onGenerateError?: () => void;
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
  street,
  city,
  buurtCode,
  postcode,
  houseNumber,
  houseLetter,
  addition,
  shadowSnapshots,
  onGenerateStart,
  onGenerateSuccess,
  onGenerateError,
}: ExportBottomSheetProps) {
  const { t, i18n } = useTranslation();
  const [template, setTemplate] = useState<'quick_brief' | 'full_dossier'>('quick_brief');
  const [exportLanguage, setExportLanguage] = useState<'en' | 'nl'>(
    i18n.language === 'nl' ? 'nl' : 'en',
  );
  const [includeShadows, setIncludeShadows] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressStage, setProgressStage] = useState<'idle' | 'collecting' | 'rendering' | 'downloading' | 'ready'>('idle');
  const [error, setError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [exportTooltipVisible, setExportTooltipVisible] = useState(false);

  const dismissExportTooltip = useCallback(() => {
    setExportTooltipVisible(false);
    markTooltipSeen('export');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setProgressStage('idle');
      setError(false);
      setShareError(false);
      setGeneratedBlob(null);
      setExportTooltipVisible(false);
      setExportLanguage(i18n.language === 'nl' ? 'nl' : 'en');
    }
  }, [i18n.language, isOpen]);

  const filename = useMemo(() => {
    const suffix = template === 'full_dossier' ? 'full-dossier' : 'quick-brief';
    return `buurt-check-${suffix}-${vboId}.pdf`;
  }, [template, vboId]);

  const progressPercent = progressStage === 'collecting'
    ? 25
    : progressStage === 'rendering'
      ? 65
      : progressStage === 'downloading'
        ? 90
        : progressStage === 'ready'
          ? 100
          : 0;
  const ringRadius = 17;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  const handleGenerate = async () => {
    setGenerating(true);
    setProgressStage('collecting');
    setError(false);
    setShareError(false);
    setGeneratedBlob(null);
    onGenerateStart?.();
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

      setProgressStage('rendering');
      const blob = await exportBriefing({
        vboId,
        rdX,
        rdY,
        lat,
        lng,
        address,
        template,
        street,
        city,
        buurtCode,
        postcode,
        houseNumber,
        houseLetter,
        addition,
        language: exportLanguage,
        shadowImageB64: shadowB64,
      });
      setProgressStage('downloading');
      setGeneratedBlob(blob);
      setProgressStage('ready');
      if (!hasSeenTooltip('export')) {
        setExportTooltipVisible(true);
      }
      onGenerateSuccess?.();
    } catch {
      setError(true);
      setProgressStage('idle');
      onGenerateError?.();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedBlob) return;
    downloadPdfBlob(generatedBlob, filename);
  };

  const handleShare = async () => {
    if (!generatedBlob) return;
    setShareError(false);
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (typeof File !== 'undefined' && nav.share) {
      const file = new File([generatedBlob], filename, { type: 'application/pdf' });
      const canShareFile = nav.canShare ? nav.canShare({ files: [file] }) : true;
      if (canShareFile) {
        try {
          await nav.share({
            title: t('export.title', 'Export Briefing'),
            files: [file],
          });
          return;
        } catch {
          // Fall back to direct download if share is cancelled/unavailable.
        }
      }
    }

    try {
      downloadPdfBlob(generatedBlob, filename);
    } catch {
      setShareError(true);
    }
  };

  const hasShadows = shadowSnapshots && shadowSnapshots.length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="45vh" ariaLabel={t('export.title')}>
      <div className="export-sheet" data-testid="export-sheet">
        <h3 className="export-sheet__title">{t('export.title', 'Export Briefing')}</h3>

        <div className="export-sheet__section">
          <span className="export-sheet__label">{t('export.template', 'Template')}</span>
          <div className="export-sheet__templates" role="radiogroup" aria-label={t('export.template', 'Template')}>
            <button
              type="button"
              role="radio"
              aria-checked={template === 'quick_brief'}
              className={`export-sheet__template-card${template === 'quick_brief' ? ' export-sheet__template-card--active' : ''}`}
              onClick={() => {
                setTemplate('quick_brief');
                setGeneratedBlob(null);
              }}
              disabled={generating}
            >
              <svg className="export-sheet__template-illus" viewBox="0 0 52 36" aria-hidden="true">
                <rect x="8" y="4" width="28" height="30" rx="3" />
                <path d="M14 12h16M14 17h16M14 22h12" />
              </svg>
              <span className="export-sheet__template-title">{t('export.quickBrief', 'Quick Brief')}</span>
              <span className="export-sheet__template-meta">{t('export.quickBriefMeta', '1 page')}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={template === 'full_dossier'}
              className={`export-sheet__template-card${template === 'full_dossier' ? ' export-sheet__template-card--active' : ''}`}
              onClick={() => {
                setTemplate('full_dossier');
                setGeneratedBlob(null);
              }}
              disabled={generating}
            >
              <svg className="export-sheet__template-illus" viewBox="0 0 52 36" aria-hidden="true">
                <rect x="4" y="8" width="18" height="24" rx="2.5" />
                <rect x="16" y="4" width="18" height="24" rx="2.5" />
                <rect x="28" y="8" width="18" height="24" rx="2.5" />
              </svg>
              <span className="export-sheet__template-title">{t('export.fullDossier', 'Full Dossier')}</span>
              <span className="export-sheet__template-meta">{t('export.fullDossierMeta', '5+ pages')}</span>
            </button>
          </div>
        </div>

        <div className="export-sheet__section">
          <span className="export-sheet__label">{t('export.language', 'Language')}</span>
          <div className="export-sheet__language-segment" role="radiogroup" aria-label={t('export.language', 'Language')}>
            <button
              type="button"
              role="radio"
              aria-checked={exportLanguage === 'en'}
              className={`export-sheet__language-btn${exportLanguage === 'en' ? ' export-sheet__language-btn--active' : ''}`}
              onClick={() => setExportLanguage('en')}
              disabled={generating}
            >
              {t('export.languageEn', 'EN')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={exportLanguage === 'nl'}
              className={`export-sheet__language-btn${exportLanguage === 'nl' ? ' export-sheet__language-btn--active' : ''}`}
              onClick={() => setExportLanguage('nl')}
              disabled={generating}
            >
              {t('export.languageNl', 'NL')}
            </button>
          </div>
          {exportLanguage !== i18n.language && (
            <p className="export-sheet__language-warning" data-testid="export-language-warning">
              {t('export.languageMismatch', {
                language: exportLanguage === 'en' ? 'English' : 'Nederlands',
              })}
            </p>
          )}
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

        {generating && (
          <div className="export-sheet__progress" data-testid="export-progress">
            <div
              className="export-sheet__progress-ring"
              role="progressbar"
              aria-label={t('export.generating', 'Generating...')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <svg viewBox="0 0 40 40" className="export-sheet__progress-svg" aria-hidden="true">
                <circle className="export-sheet__progress-track" cx="20" cy="20" r={ringRadius} />
                <circle
                  className="export-sheet__progress-value"
                  cx="20"
                  cy="20"
                  r={ringRadius}
                  style={{
                    strokeDasharray: `${ringCircumference}`,
                    strokeDashoffset: `${ringDashOffset}`,
                  }}
                />
              </svg>
              <svg className="export-sheet__progress-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 3h7l5 5v13H7z" />
                <path d="M14 3v6h5" />
              </svg>
              <span className="export-sheet__progress-percent">{progressPercent}%</span>
            </div>
            <p className="export-sheet__progress-text">
              {progressStage === 'collecting' && t('export.progress.collecting', 'Collecting data...')}
              {progressStage === 'rendering' && t('export.progress.rendering', 'Rendering PDF...')}
              {progressStage === 'downloading' && t('export.progress.downloading', 'Preparing download...')}
            </p>
          </div>
        )}

        {progressStage === 'ready' && generatedBlob && (
          <div className="export-sheet__ready" data-testid="export-ready-actions">
            <div className="export-sheet__ready-header">
              <p className="export-sheet__progress-text">
                {t('export.progress.ready', 'PDF is ready. Share it or download a copy.')}
              </p>
              {exportTooltipVisible && (
                <ContextualTooltip
                  message={t('tooltip.export')}
                  onDismiss={dismissExportTooltip}
                  position="below"
                />
              )}
            </div>
            <div className="export-sheet__actions">
              <button type="button" className="export-sheet__btn export-sheet__btn--secondary" onClick={handleShare}>
                {t('export.share', 'Share PDF')}
              </button>
              <button type="button" className="export-sheet__btn export-sheet__btn--secondary" onClick={handleDownload}>
                {t('export.download', 'Download PDF')}
              </button>
            </div>
          </div>
        )}

        {shareError && (
          <p className="export-sheet__error">{t('export.shareError', 'Could not share PDF. Try downloading instead.')}</p>
        )}

        {progressStage !== 'ready' && (
          <button
            type="button"
            className="export-sheet__btn"
            onClick={handleGenerate}
            disabled={generating}
            data-testid="export-generate-btn"
          >
            {generating
              ? t('export.generating', 'Generating...')
              : t('export.generate', 'Generate PDF')}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
