import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedAddress } from '../types/api';
import './LoadingScreen.css';

export const LOADING_PROGRESS_SEQUENCE = [
  'findingBuilding',
  'loading3D',
  'checkingNoise',
  'checkingAir',
  'checkingClimate',
  'calculatingSunlight',
] as const;

export type LoadingProgressStep = (typeof LOADING_PROGRESS_SEQUENCE)[number];

interface LoadingScreenProps {
  address: ResolvedAddress | null;
  pendingDisplayName: string | null;
  step: LoadingProgressStep;
  warningKey?: string | null;
}

const STEP_TO_KEY: Record<LoadingProgressStep, string> = {
  findingBuilding: 'loading.findingBuilding',
  loading3D: 'loading.loading3D',
  checkingNoise: 'loading.checkingNoise',
  checkingAir: 'loading.samplingAir',
  checkingClimate: 'loading.analyzingClimate',
  calculatingSunlight: 'loading.computingSunlight',
};

const STEP_TO_SUBKEY: Record<LoadingProgressStep, string> = {
  findingBuilding: 'loading.sub.findingBuilding',
  loading3D: 'loading.sub.loading3D',
  checkingNoise: 'loading.sub.checkingNoise',
  checkingAir: 'loading.sub.checkingAir',
  checkingClimate: 'loading.sub.checkingClimate',
  calculatingSunlight: 'loading.sub.calculatingSunlight',
};

function parsePendingDisplayName(displayName: string | null): { line1: string; line2: string } {
  if (!displayName) {
    return { line1: '', line2: '' };
  }

  const parts = displayName
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return { line1: displayName, line2: '' };
  }

  const [line1, ...rest] = parts;
  return { line1, line2: rest.join(', ') };
}

function formatAddressLines(address: ResolvedAddress | null, pendingDisplayName: string | null) {
  if (address) {
    const houseNumber = [address.house_number, address.house_letter, address.addition]
      .filter(Boolean)
      .join('');
    const line1 = [address.street, houseNumber].filter(Boolean).join(' ').trim();
    const line2 = [address.postcode, address.city].filter(Boolean).join(' ').trim();
    return { line1, line2 };
  }

  return parsePendingDisplayName(pendingDisplayName);
}

export default function LoadingScreen({
  address,
  pendingDisplayName,
  step,
  warningKey,
}: LoadingScreenProps) {
  const { t } = useTranslation();

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [subLineVisible, setSubLineVisible] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      setSubLineVisible(true);
      return;
    }

    setSubLineVisible(false);
    const timer = setTimeout(() => setSubLineVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [step, prefersReducedMotion]);

  const { line1, line2 } = useMemo(
    () => formatAddressLines(address, pendingDisplayName),
    [address, pendingDisplayName],
  );

  const stepIndex = LOADING_PROGRESS_SEQUENCE.indexOf(step);
  const progressPercent = ((stepIndex + 1) / LOADING_PROGRESS_SEQUENCE.length) * 100;
  const statusKey = warningKey ?? STEP_TO_KEY[step];
  const statusLabel = t(statusKey);
  const showWarning = !!warningKey;
  const addressLine1 = line1 || t('loading.addressFallbackLine1');
  const addressLine2 = line2 || t('loading.addressFallbackLine2');

  return (
    <section className="loading-screen" data-testid="loading-screen" aria-live="polite">
      <header className="loading-screen__address" data-testid="loading-screen-address">
        <p className="loading-screen__address-line1">{addressLine1}</p>
        <p className="loading-screen__address-line2">{addressLine2}</p>
      </header>

      <div className="loading-screen__animation-wrap" aria-hidden="true">
        <svg
          className="loading-screen__building"
          width="180"
          height="160"
          viewBox="0 0 180 160"
        >
          <path
            className="loading-screen__segment"
            data-segment="foundation"
            pathLength={1}
            d="M50 148 H130"
          />
          <path
            className="loading-screen__segment"
            data-segment="left-wall"
            pathLength={1}
            d="M50 148 V24"
          />
          <path
            className="loading-screen__segment"
            data-segment="right-wall"
            pathLength={1}
            d="M130 148 V24"
          />
          <path
            className="loading-screen__segment"
            data-segment="roof"
            pathLength={1}
            d="M50 24 H74 V14 H83 V6 H97 V14 H106 V24 H130"
          />
          <path
            className="loading-screen__segment"
            data-segment="windows"
            pathLength={1}
            d="M64 44 H80 M100 44 H116 M64 66 H80 M100 66 H116 M64 88 H80 M100 88 H116 M64 44 V98 M80 44 V98 M100 44 V98 M116 44 V98"
          />
          <path
            className="loading-screen__segment"
            data-segment="door"
            pathLength={1}
            d="M84 148 V112 H96 V148"
          />
        </svg>
      </div>

      <div
        className={`loading-screen__status${showWarning ? ' loading-screen__status--warning' : ''}`}
        data-testid="loading-screen-status"
      >
        {!showWarning && <span className="loading-screen__dot" aria-hidden="true" />}
        {showWarning && (
          <svg
            className="loading-screen__warning-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4L22 21H2L12 4z" />
            <path d="M12 10v5" />
            <path d="M12 18h.01" />
          </svg>
        )}
        <p className="loading-screen__status-text" key={statusKey} data-testid="loading-screen-status-text">
          {statusLabel}
        </p>
      </div>

      {subLineVisible && !showWarning && (
        <p className="loading-screen__sub-text" data-testid="loading-screen-sub-text">
          {t(STEP_TO_SUBKEY[step])}
        </p>
      )}

      <div
        className="loading-screen__progress"
        role="progressbar"
        aria-label={t('loading.progressAria')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
      >
        <div className="loading-screen__progress-track">
          <div
            className="loading-screen__progress-fill"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressPercent / 100))})` }}
            data-testid="loading-screen-progress-fill"
          />
        </div>
      </div>
    </section>
  );
}
