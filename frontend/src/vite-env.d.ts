/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_VIEWER3D_SHADOW_SIZE?: string;
  readonly VITE_VIEWER3D_DPR_CAP?: string;
  readonly VITE_VIEWER3D_TILE_GRID?: string;
  readonly VITE_VIEWER3D_CONTINUOUS_RENDER?: string;
}
