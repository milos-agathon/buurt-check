import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BottomSheet from './ui/BottomSheet';
import ContextualTooltip from './ui/ContextualTooltip';
import { hasSeenTooltip, markTooltipSeen } from '../services/tooltipTracker';
import { downloadPdfBlob, exportBriefing, sharePdfBlob } from '../services/api';
import { trackEvent } from '../services/analytics';
import { isServerRenderAvailable } from '../config/pricing';
import type { ShadowSnapshot } from '../types/api';
import type { SunlightSubmissionPayload } from '../services/api';
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
  reportId?: string;
  street?: string;
  city?: string;
  municipality?: string;
  buurtCode?: string;
  postcode?: string;
  houseNumber?: string;
  houseLetter?: string;
  addition?: string;
  sunlightPayload?: SunlightSubmissionPayload;
  shadowSnapshots?: ShadowSnapshot[] | null;
  isEntitled?: boolean;
  onBuyFullDossier?: () => void;
  buyLabel?: string;
  buyPriceLabel?: string;
  buyDisabled?: boolean;
  buyDisabledMessage?: string;
  buyPending?: boolean;
  sunlightReady?: boolean;
  sunlightFailed?: boolean;
  onBeforeGenerate?: (template: 'quick_brief' | 'full_dossier') => Promise<void> | void;
  onGenerateStart?: () => void;
  onGenerateSuccess?: () => void;
  onGenerateError?: () => void;
  initialTemplate?: 'quick_brief' | 'full_dossier';
  autoGenerateToken?: string | null;
}

type RecoveryPhase = 'waiting_prerequisites' | 'generating' | 'ready' | 'error';
type GenerateTrigger = 'manual' | 'post_checkout_auto' | 'post_checkout_retry';
const POST_CHECKOUT_WAIT_TIMEOUT_MS = 10_000;

export default function ExportBottomSheet({
  isOpen,
  onClose,
  vboId,
  rdX,
  rdY,
  lat,
  lng,
  address,
  reportId,
  street,
  city,
  municipality,
  buurtCode,
  postcode,
  houseNumber,
  houseLetter,
  addition,
  sunlightPayload,
  shadowSnapshots,
  isEntitled = false,
  onBuyFullDossier,
  buyLabel,
  buyPriceLabel,
  buyDisabled = false,
  buyDisabledMessage,
  buyPending = false,
  sunlightReady = true,
  sunlightFailed = false,
  onBeforeGenerate,
  onGenerateStart,
  onGenerateSuccess,
  onGenerateError,
  initialTemplate,
  autoGenerateToken,
}: ExportBottomSheetProps) {
  const { t, i18n } = useTranslation();
  const uiLanguage: 'en' | 'nl' = i18n.language === 'nl' ? 'nl' : 'en';
  const [template, setTemplate] = useState<'quick_brief' | 'full_dossier'>('quick_brief');
  const [exportLanguage, setExportLanguage] = useState<'en' | 'nl'>(
    uiLanguage,
  );
  const [includeShadows, setIncludeShadows] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressStage, setProgressStage] = useState<'idle' | 'collecting' | 'rendering' | 'downloading' | 'ready'>('idle');
  const [error, setError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [exportTooltipVisible, setExportTooltipVisible] = useState(false);
  const [recoveryPhase, setRecoveryPhase] = useState<RecoveryPhase | null>(null);
  const [bypassPrerequisites, setBypassPrerequisites] = useState(false);
  const recoveryTokenRef = useRef<string | null>(null);
  const waitingCheckpointTokenRef = useRef<string | null>(null);
  const autoGenerateStartedTokenRef = useRef<string | null>(null);
  const isPostCheckoutRecovery = Boolean(autoGenerateToken && initialTemplate === 'full_dossier');
  const recoveryToken = isPostCheckoutRecovery ? autoGenerateToken : null;
  const activeTemplate = isPostCheckoutRecovery ? 'full_dossier' : template;
  const checkpointTemplate = activeTemplate;
  const postCheckoutPrerequisitesReady = sunlightReady || sunlightFailed;
  const sheetTitle = isPostCheckoutRecovery
    ? t('export.downloadDossier', 'Download dossier')
    : t('export.title', 'Export Briefing');
  const shouldBlockRecoveryClose = isPostCheckoutRecovery
    && (recoveryPhase === 'waiting_prerequisites' || recoveryPhase === 'generating');
  const recoveryStateLabel = recoveryPhase === 'generating'
    ? t('export.postCheckoutStateGenerating', 'Generating dossier')
    : recoveryPhase === 'ready'
      ? t('export.postCheckoutStateReady', 'Dossier ready')
      : t('export.postCheckoutStateConfirmed', 'Payment confirmed');
  const recoveryMessage = recoveryPhase === 'generating'
    ? t(
      'export.postCheckoutGenerating',
      'We are generating your dossier now. This can take a moment. The download button will appear below when it is ready.',
    )
    : recoveryPhase === 'ready'
      ? t(
        'export.postCheckoutReady',
        'Your dossier is ready. Tap Download dossier to save it.',
      )
      : t(
        'export.postCheckoutUnlocked',
        'Your full dossier is unlocked. We will prepare it automatically. This can take a moment.',
      );

  const logPostCheckoutCheckpoint = useCallback((
    checkpoint: string,
    details?: Record<string, string | number | boolean>,
  ) => {
    if (!isPostCheckoutRecovery) return;

    const payload = {
      checkpoint,
      template: checkpointTemplate,
      ...details,
    };

    if (import.meta.env.DEV) {
      console.info('[post-checkout-export]', payload);
    }
    trackEvent('post_checkout_export_checkpoint', payload);
  }, [checkpointTemplate, isPostCheckoutRecovery]);

  const dismissExportTooltip = useCallback(() => {
    setExportTooltipVisible(false);
    markTooltipSeen('export');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setGenerating(false);
      setProgressStage('idle');
      setError(false);
      setShareError(false);
      setGeneratedBlob(null);
      setExportTooltipVisible(false);
      setExportLanguage(uiLanguage);
      setRecoveryPhase(null);
      setBypassPrerequisites(false);
      recoveryTokenRef.current = null;
      waitingCheckpointTokenRef.current = null;
      autoGenerateStartedTokenRef.current = null;
    }
  }, [isOpen, uiLanguage]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    setTemplate(initialTemplate ?? 'quick_brief');
  }, [initialTemplate, isOpen]);

  useEffect(() => {
    if (!isOpen || !isPostCheckoutRecovery || !recoveryToken) {
      return;
    }
    if (recoveryTokenRef.current === recoveryToken) {
      return;
    }

    recoveryTokenRef.current = recoveryToken;
    waitingCheckpointTokenRef.current = null;
    autoGenerateStartedTokenRef.current = null;
    setExportLanguage(uiLanguage);
    setGenerating(false);
    setProgressStage('idle');
    setError(false);
    setShareError(false);
    setGeneratedBlob(null);
    setExportTooltipVisible(false);
    setRecoveryPhase('waiting_prerequisites');
    setBypassPrerequisites(false);
  }, [isOpen, isPostCheckoutRecovery, recoveryToken, uiLanguage]);

  const filename = useMemo(() => {
    const suffix = activeTemplate === 'full_dossier' ? 'full-dossier' : 'quick-brief';
    return `buurt-check-${suffix}-${vboId}.pdf`;
  }, [activeTemplate, vboId]);

  const isIndeterminate = progressStage === 'collecting' || progressStage === 'rendering';
  const progressPercent = progressStage === 'downloading'
    ? 90
    : progressStage === 'ready'
      ? 100
      : 0;
  const ringRadius = 17;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = isIndeterminate
    ? ringCircumference * 0.75
    : ringCircumference - (progressPercent / 100) * ringCircumference;

  const handleGenerate = useCallback(async (trigger: GenerateTrigger = 'manual') => {
    if (activeTemplate === 'full_dossier' && !isEntitled) {
      onBuyFullDossier?.();
      return;
    }

    if (trigger === 'manual') {
      trackEvent('pdf_export_clicked', {
        template: activeTemplate,
        report_id: reportId ?? 'none',
        vbo_id: vboId,
      });
    } else if (isPostCheckoutRecovery) {
      logPostCheckoutCheckpoint('auto_generate_started', {
        trigger: trigger === 'post_checkout_retry' ? 'retry_button' : 'automatic',
      });
    }

    if (isPostCheckoutRecovery) {
      setRecoveryPhase('generating');
    }
    setGenerating(true);
    setProgressStage('collecting');
    setError(false);
    setShareError(false);
    setGeneratedBlob(null);
    if (!isPostCheckoutRecovery) {
      onGenerateStart?.();
    }
    try {
      await onBeforeGenerate?.(activeTemplate);

      let shadowB64: string | undefined;
      let shadowEquinoxB64: string | undefined;
      let shadowSummerB64: string | undefined;
      let shadowImages:
        | Array<{
          hour: number;
          label: string;
          image_b64: string;
          viewpoint?: string;
          sun_azimuth?: number;
          sun_altitude?: number;
        }>
        | undefined;
      // When server-side rendering is available, skip sending client
      // snapshots — the backend will render via forge3d directly.
      const useClientSnapshots = includeShadows
        && shadowSnapshots
        && shadowSnapshots.length > 0
        && !isServerRenderAvailable();

      if (useClientSnapshots && shadowSnapshots && shadowSnapshots.length > 0) {
        shadowImages = shadowSnapshots.map(s => {
          const raw = s.dataUrl;
          return {
            hour: s.hour,
            label: s.label,
            image_b64: raw.startsWith('data:') ? raw.split(',')[1] : raw,
            viewpoint: s.viewpoint ?? s.label,
            sun_azimuth: s.sunAzimuth,
            sun_altitude: s.sunAltitude,
          };
        });

        if (activeTemplate === 'full_dossier') {
          const winterSnapshot = shadowSnapshots.find(s => s.label === 'winter');
          const equinoxSnapshot = shadowSnapshots.find(s => s.label === 'equinox');
          const summerSnapshot = shadowSnapshots.find(s => s.label === 'summer');
          const toB64 = (dataUrl?: string) => {
            if (!dataUrl) return undefined;
            return dataUrl.startsWith('data:')
              ? dataUrl.split(',')[1]
              : dataUrl;
          };
          shadowB64 = toB64(winterSnapshot?.dataUrl);
          shadowEquinoxB64 = toB64(equinoxSnapshot?.dataUrl);
          shadowSummerB64 = toB64(summerSnapshot?.dataUrl);
        } else {
          const primarySnapshot = shadowSnapshots.find(
            s => s.label === 'summer',
          )
            || shadowSnapshots.find(
              s => (s.viewpoint ?? s.label) === 'top' && s.hour === 12,
            )
            || shadowSnapshots.find(s => s.hour === 12)
            || shadowSnapshots.find(s => (s.viewpoint ?? s.label) === 'top')
            || shadowSnapshots[0];
          const dataUrl = primarySnapshot.dataUrl;
          shadowB64 = dataUrl.startsWith('data:')
            ? dataUrl.split(',')[1]
            : dataUrl;
        }
      }

      setProgressStage('rendering');
      const blob = await exportBriefing({
        vboId,
        rdX,
        rdY,
        lat,
        lng,
        address,
        reportId,
        template: activeTemplate,
        street,
        city,
        municipality,
        buurtCode,
        postcode,
        houseNumber,
        houseLetter,
        addition,
        sunlightPayload,
        language: exportLanguage,
        shadowImageB64: shadowB64,
        shadowEquinoxB64,
        shadowSummerB64,
        shadowImages,
      });
      setProgressStage('downloading');
      setGeneratedBlob(blob);
      setProgressStage('ready');
      if (isPostCheckoutRecovery) {
        setRecoveryPhase('ready');
      }
      logPostCheckoutCheckpoint('export_response_received', {
        blob_ready: true,
      });
      if (!hasSeenTooltip('export')) {
        setExportTooltipVisible(true);
      }
      trackEvent('pdf_export_completed', {
        template: activeTemplate,
        report_id: reportId ?? 'none',
        vbo_id: vboId,
      });
      if (!isPostCheckoutRecovery) {
        onGenerateSuccess?.();
      }
    } catch {
      logPostCheckoutCheckpoint('generate_failed');
      if (isPostCheckoutRecovery) {
        setRecoveryPhase('error');
      }
      setError(true);
      setProgressStage('idle');
      if (!isPostCheckoutRecovery) {
        onGenerateError?.();
      }
    } finally {
      setGenerating(false);
    }
  }, [
    activeTemplate,
    addition,
    address,
    buurtCode,
    city,
    exportLanguage,
    houseLetter,
    houseNumber,
    isEntitled,
    lat,
    lng,
    municipality,
    onBeforeGenerate,
    onBuyFullDossier,
    onGenerateError,
    onGenerateStart,
    onGenerateSuccess,
    postcode,
    rdX,
    rdY,
    reportId,
    shadowSnapshots,
    street,
    sunlightPayload,
    vboId,
    isPostCheckoutRecovery,
    logPostCheckoutCheckpoint,
  ]);

  useEffect(() => {
    if (
      !isOpen
      || !isPostCheckoutRecovery
      || !recoveryToken
      || recoveryPhase !== 'waiting_prerequisites'
      || postCheckoutPrerequisitesReady
    ) {
      return;
    }

    if (waitingCheckpointTokenRef.current === recoveryToken) {
      return;
    }

    waitingCheckpointTokenRef.current = recoveryToken;
    logPostCheckoutCheckpoint('waiting_prerequisites');
  }, [
    isOpen,
    isPostCheckoutRecovery,
    postCheckoutPrerequisitesReady,
    recoveryPhase,
    recoveryToken,
    logPostCheckoutCheckpoint,
  ]);

  useEffect(() => {
    if (
      !isOpen
      || !isPostCheckoutRecovery
      || !recoveryToken
      || recoveryPhase !== 'waiting_prerequisites'
      || (!postCheckoutPrerequisitesReady && !bypassPrerequisites)
    ) {
      return;
    }

    if (autoGenerateStartedTokenRef.current === recoveryToken) {
      return;
    }

    autoGenerateStartedTokenRef.current = recoveryToken;
    void handleGenerate('post_checkout_auto');
  }, [
    handleGenerate,
    isOpen,
    isPostCheckoutRecovery,
    postCheckoutPrerequisitesReady,
    bypassPrerequisites,
    recoveryPhase,
    recoveryToken,
  ]);

  useEffect(() => {
    if (
      !isOpen
      || !isPostCheckoutRecovery
      || !recoveryToken
      || recoveryPhase !== 'waiting_prerequisites'
      || postCheckoutPrerequisitesReady
      || bypassPrerequisites
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.warn('[post-checkout-export] waiting for prerequisites timed out; continuing without sunlight gate');
      }
      logPostCheckoutCheckpoint('waiting_prerequisites_timeout');
      setBypassPrerequisites(true);
    }, POST_CHECKOUT_WAIT_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [
    bypassPrerequisites,
    isOpen,
    isPostCheckoutRecovery,
    logPostCheckoutCheckpoint,
    postCheckoutPrerequisitesReady,
    recoveryPhase,
    recoveryToken,
  ]);

  const handleDownload = () => {
    if (!generatedBlob) return;
    logPostCheckoutCheckpoint('download_attempt_started', {
      trigger: 'manual_button',
    });
    void Promise.resolve(downloadPdfBlob(generatedBlob, filename)).catch(() => {
      logPostCheckoutCheckpoint('download_attempt_failed', {
        trigger: 'manual_button',
      });
      setShareError(true);
    });
  };

  const handleCloseRequest = useCallback(() => {
    if (shouldBlockRecoveryClose) {
      return;
    }
    onClose();
  }, [onClose, shouldBlockRecoveryClose]);

  const handleRetryPostCheckout = useCallback(() => {
    if (!isPostCheckoutRecovery) {
      return;
    }
    void handleGenerate('post_checkout_retry');
  }, [handleGenerate, isPostCheckoutRecovery]);

  const handleShare = async () => {
    if (!generatedBlob) return;
    setShareError(false);
    try {
      const shared = await sharePdfBlob(generatedBlob, filename, sheetTitle);
      if (!shared) {
        await downloadPdfBlob(generatedBlob, filename);
      }
    } catch {
      setShareError(true);
    }
  };

  const hasShadows = shadowSnapshots && shadowSnapshots.length > 0;
  const requiresPurchase = activeTemplate === 'full_dossier' && !isEntitled;
  const showPostCheckoutSummary = isPostCheckoutRecovery && recoveryPhase != null && recoveryPhase !== 'error';
  const showRecoveryProgress = recoveryPhase === 'waiting_prerequisites' || recoveryPhase === 'generating';
  const recoveryProgressIndeterminate = recoveryPhase === 'waiting_prerequisites' || isIndeterminate;
  const recoveryProgressText = recoveryPhase === 'waiting_prerequisites'
    ? t('export.postCheckoutPreparing', 'Preparing dossier...')
    : progressStage === 'collecting'
      ? t('export.progress.collecting', 'Collecting data...')
      : progressStage === 'rendering'
        ? t('export.progress.rendering', 'Rendering PDF...')
        : t('export.progress.downloading', 'Preparing download...');

  return (
    <BottomSheet isOpen={isOpen} onClose={handleCloseRequest} height="45vh" ariaLabel={sheetTitle}>
      <div className="export-sheet" data-testid="export-sheet">
        <h3 className="export-sheet__title">{sheetTitle}</h3>

        {isPostCheckoutRecovery ? (
          <>
            {showPostCheckoutSummary && (
              <div
                className="export-sheet__recovery"
                data-testid="export-post-checkout-state"
                data-phase={recoveryPhase ?? undefined}
              >
                <p className="export-sheet__recovery-label">{recoveryStateLabel}</p>
                <p
                  className="export-sheet__resume-note"
                  data-testid={
                    recoveryPhase === 'ready'
                      ? 'export-post-checkout-ready'
                      : recoveryPhase === 'generating'
                        ? 'export-post-checkout-generating'
                        : 'export-post-checkout-waiting'
                  }
                >
                  {recoveryMessage}
                </p>
              </div>
            )}

            {error && (
              <p className="export-sheet__error">{t('export.error', 'Export failed. Please try again.')}</p>
            )}

            {showRecoveryProgress && (
              <div className="export-sheet__progress" data-testid="export-progress">
                <div
                  className="export-sheet__progress-ring"
                  role="progressbar"
                  aria-label={t('export.generating', 'Generating...')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  {...(recoveryProgressIndeterminate ? {} : { 'aria-valuenow': progressPercent })}
                >
                  <svg
                    viewBox="0 0 40 40"
                    className={`export-sheet__progress-svg${recoveryProgressIndeterminate ? ' export-sheet__progress-svg--indeterminate' : ''}`}
                    aria-hidden="true"
                  >
                    <circle className="export-sheet__progress-track" cx="20" cy="20" r={ringRadius} />
                    <circle
                      className={`export-sheet__progress-value${recoveryProgressIndeterminate ? ' export-sheet__progress-value--indeterminate' : ''}`}
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
                  {!recoveryProgressIndeterminate && (
                    <span className="export-sheet__progress-percent">{progressPercent}%</span>
                  )}
                </div>
                <p className="export-sheet__progress-text">{recoveryProgressText}</p>
              </div>
            )}

            {recoveryPhase === 'ready' && generatedBlob && (
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
                  <button type="button" className="export-sheet__btn" onClick={handleDownload}>
                    {t('export.downloadDossier', 'Download dossier')}
                  </button>
                  <button type="button" className="export-sheet__btn export-sheet__btn--secondary" onClick={handleShare}>
                    {t('export.share', 'Share PDF')}
                  </button>
                </div>
              </div>
            )}

            {shareError && (
              <p className="export-sheet__error">{t('export.shareError', 'Could not share PDF. Try downloading instead.')}</p>
            )}

            {recoveryPhase === 'error' && (
              <button
                type="button"
                className="export-sheet__btn"
                onClick={handleRetryPostCheckout}
                data-testid="export-retry-btn"
              >
                {t('error.retry')}
              </button>
            )}
          </>
        ) : (
          <>
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
                  <span className="export-sheet__template-meta">{t('export.fullDossierMeta', '10+ pages')}</span>
                </button>
              </div>

              {template === 'full_dossier' && !requiresPurchase && !sunlightReady && (
                <p id="sunlight-computing-msg" role="status" className="export-sheet__sunlight-status" data-testid="export-sunlight-computing">
                  {t('export.sunlightComputing', 'Calculating sunlight analysis...')}
                </p>
              )}

              {template === 'full_dossier' && sunlightReady && sunlightFailed && (
                <p id="sunlight-warning-msg" role="status" className="export-sheet__sunlight-warning" data-testid="export-sunlight-warning">
                  {t('export.sunlightUnavailableWarning', 'Sunlight data unavailable — dossier will show N/A')}
                </p>
              )}

              {template === 'full_dossier' && requiresPurchase && buyPriceLabel && (
                <p className="export-sheet__sunlight-status" data-testid="export-buy-price">
                  {t('export.fullDossierPrice', { price: buyPriceLabel })}
                </p>
              )}

              {template === 'full_dossier' && requiresPurchase && buyDisabled && buyDisabledMessage && (
                <p
                  id="checkout-unavailable-msg"
                  className="export-sheet__checkout-warning"
                  data-testid="export-buy-unavailable"
                >
                  {buyDisabledMessage}
                </p>
              )}
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
                  {...(isIndeterminate ? {} : { 'aria-valuenow': progressPercent })}
                >
                  <svg
                    viewBox="0 0 40 40"
                    className={`export-sheet__progress-svg${isIndeterminate ? ' export-sheet__progress-svg--indeterminate' : ''}`}
                    aria-hidden="true"
                  >
                    <circle className="export-sheet__progress-track" cx="20" cy="20" r={ringRadius} />
                    <circle
                      className={`export-sheet__progress-value${isIndeterminate ? ' export-sheet__progress-value--indeterminate' : ''}`}
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
                  {!isIndeterminate && (
                    <span className="export-sheet__progress-percent">{progressPercent}%</span>
                  )}
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
                onClick={() => {
                  void handleGenerate('manual');
                }}
                disabled={
                  generating
                  || (requiresPurchase && (buyPending || buyDisabled || !onBuyFullDossier))
                  || (!requiresPurchase && template === 'full_dossier' && !sunlightReady)
                }
                aria-busy={(requiresPurchase && buyPending) || undefined}
                aria-describedby={
                  requiresPurchase && buyDisabled && buyDisabledMessage
                    ? 'checkout-unavailable-msg'
                    : !requiresPurchase && template === 'full_dossier' && !sunlightReady
                      ? 'sunlight-computing-msg'
                      : template === 'full_dossier' && sunlightReady && sunlightFailed
                        ? 'sunlight-warning-msg'
                        : undefined
                }
                data-testid="export-generate-btn"
              >
                {requiresPurchase
                  ? (buyLabel ?? t('export.buyFullDossier', 'Buy Full Dossier'))
                  : generating
                    ? t('export.generating', 'Generating...')
                    : t('export.generate', 'Generate PDF')}
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
