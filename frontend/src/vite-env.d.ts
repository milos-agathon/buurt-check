/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_ADDRESS_FALLBACK_API_BASE?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_GOOGLE_PLAY_PRODUCT_ID?: string;
  readonly VITE_PLAY_PACKAGE_NAME?: string;
  readonly VITE_PLAY_SHA256_CERT_FINGERPRINTS?: string;
  readonly VITE_PREVIEW_DISABLE_PAYMENTS?: string;
  readonly VITE_PREVIEW_FORCE_FULL_DOSSIER_VIEW?: string;
  readonly VITE_VIEWER3D_SHADOW_SIZE?: string;
  readonly VITE_VIEWER3D_DPR_CAP?: string;
  readonly VITE_VIEWER3D_TILE_GRID?: string;
  readonly VITE_VIEWER3D_CONTINUOUS_RENDER?: string;
  readonly VITE_SUNLIGHT_USE_WORKER?: string;
  readonly VITE_SUNLIGHT_CULL_DISTANCE_METERS?: string;
  readonly VITE_SVF_SAMPLE_POINTS?: string;
}
