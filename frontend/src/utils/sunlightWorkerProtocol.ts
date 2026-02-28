import type { BuildingBlock, SunlightResult } from '../types/api';

export interface SunlightWorkerPayload {
  buildings: BuildingBlock[];
  targetPandId: string;
  lat: number;
  lng: number;
  year: number;
  intervalMinutes: number;
  chunkRaycasts: number;
  gridSpacingMeters: number;
  maxRoofPoints: number;
  includeFacadePoints: boolean;
  includeGroundPoints: boolean;
  facadePointCount: number;
  groundPointCount: number;
  cullDistanceMeters: number;
}

export interface SunlightWorkerAnalyzeMessage {
  type: 'analyze';
  requestId: string;
  payload: SunlightWorkerPayload;
}

export interface SunlightWorkerCancelMessage {
  type: 'cancel';
  requestId: string;
}

export interface SunlightWorkerResultMessage {
  type: 'result';
  requestId: string;
  result: SunlightResult | null;
}

export interface SunlightWorkerErrorMessage {
  type: 'error';
  requestId: string;
  error: string;
}

export type SunlightWorkerIncomingMessage =
  | SunlightWorkerAnalyzeMessage
  | SunlightWorkerCancelMessage;

export type SunlightWorkerOutgoingMessage =
  | SunlightWorkerResultMessage
  | SunlightWorkerErrorMessage;
