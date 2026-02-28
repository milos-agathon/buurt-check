import type { FacadeSunlightResult } from '../types/api';

/** Serialized building geometry for transfer to Worker. */
export interface SerializedBuilding {
  /** Float32Array of vertex positions (x, y, z interleaved). */
  positions: Float32Array;
  /** Uint32Array of triangle indices (optional - if indexed geometry). */
  indices?: Uint32Array;
  /** Pand ID for self-shadow exclusion. */
  pandId: string;
  /** Whether this is the ground plane (excluded from obstruction checks). */
  isGround: boolean;
}

/** Input message: main thread -> sunlight Worker. */
export interface SunlightWorkerRequest {
  type: 'analyzeSunlight';
  id: number;
  buildings: SerializedBuilding[];
  footprint: number[][];
  roofY: number;
  targetPandId: string;
  lat: number;
  lng: number;
  year: number;
  intervalMinutes: number;
  gridSpacingMeters: number;
  maxPoints: number;
  // Forward-compatible optional sampling controls used by current viewer.
  groundY?: number;
  chunkRaycasts?: number;
  includeFacadePoints?: boolean;
  includeGroundPoints?: boolean;
  facadePointCount?: number;
  groundPointCount?: number;
  facadeOffsetMeters?: number;
  groundOffsetMeters?: number;
  facadeHeightMeters?: number;
  groundHeightOffsetMeters?: number;
  extraEvalPoints?: {
    points: [number, number, number][];
    labels: string[];
    skipSelfShadow: boolean;
  };
}

/** Progress message: sunlight Worker -> main thread. */
export interface SunlightWorkerProgress {
  type: 'progress';
  id: number;
  monthsDone: number;
  totalMonths: number;
}

export interface SunlightWorkerResultData {
  winter: number;
  equinox: number;
  summer: number;
  annualAverage: number;
  analysisYear: number;
  perPointAnnual: number[];
  roofGridPoints: [number, number, number][];
  facadeProxyPoints?: [number, number, number][];
  groundProxyPoints?: [number, number, number][];
  perFacadeAnnual?: number[];
  perGroundAnnual?: number[];
  facadeResults?: FacadeSunlightResult[];
  groundAnnualAverage?: number;
  samplingBreakdown?: {
    roof: number;
    facade: number;
    ground: number;
    total: number;
  };
}

/** Result message: sunlight Worker -> main thread. */
export interface SunlightWorkerResult {
  type: 'result';
  id: number;
  result: SunlightWorkerResultData | null;
}

/** Error message: Worker -> main thread. */
export interface SunlightWorkerError {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerOutMessage =
  | SunlightWorkerProgress
  | SunlightWorkerResult
  | SunlightWorkerError;

export interface SvfWorkerRequest {
  type: 'computeSvf';
  id: number;
  buildings: SerializedBuilding[];
  evalPoints: [number, number, number][];
  maxSamplePoints: number;
}

export interface SvfWorkerResult {
  type: 'svfResult';
  id: number;
  svf: number;
}

export type SvfWorkerOutMessage = SvfWorkerResult | SunlightWorkerError;
