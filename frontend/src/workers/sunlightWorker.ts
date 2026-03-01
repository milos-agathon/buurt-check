/// <reference lib="webworker" />

import { Raycaster } from 'three';
import { analyzeSunlight } from '../utils/sunlightAnalysis';
import { deserializeBuildings } from './geometrySerialization';
import type { SunlightWorkerRequest, WorkerOutMessage } from './sunlightWorkerTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function noopYield(): Promise<void> {
  return Promise.resolve();
}

/** Reuse a single Raycaster across messages — persistent Worker, sequential processing. */
const sharedRaycaster = new Raycaster();

ctx.addEventListener('message', async (event: MessageEvent<SunlightWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'analyzeSunlight') return;

  let meshes: ReturnType<typeof deserializeBuildings> = [];
  try {
    meshes = deserializeBuildings(msg.buildings);

    const result = await analyzeSunlight({
      buildingMeshes: meshes,
      targetPandId: msg.targetPandId,
      footprint: msg.footprint,
      roofY: msg.roofY,
      groundY: msg.groundY,
      lat: msg.lat,
      lng: msg.lng,
      year: msg.year,
      intervalMinutes: msg.intervalMinutes,
      chunkRaycasts: msg.chunkRaycasts,
      gridSpacingMeters: msg.gridSpacingMeters,
      maxPoints: msg.maxPoints,
      includeFacadePoints: msg.includeFacadePoints,
      includeGroundPoints: msg.includeGroundPoints,
      facadePointCount: msg.facadePointCount,
      groundPointCount: msg.groundPointCount,
      facadeOffsetMeters: msg.facadeOffsetMeters,
      groundOffsetMeters: msg.groundOffsetMeters,
      facadeHeightMeters: msg.facadeHeightMeters,
      groundHeightOffsetMeters: msg.groundHeightOffsetMeters,
      extraEvalPoints: msg.extraEvalPoints,
      emitPerTimestep: msg.emitPerTimestep,
      raycaster: sharedRaycaster,
      yieldControl: noopYield,
      onMonthComplete: (monthIdx: number, totalMonths: number) => {
        const progress: WorkerOutMessage = {
          type: 'progress',
          id: msg.id,
          monthsDone: monthIdx + 1,
          totalMonths,
        };
        ctx.postMessage(progress);
      },
    });

    const response: WorkerOutMessage = {
      type: 'result',
      id: msg.id,
      result: result ? {
        winter: result.winter,
        equinox: result.equinox,
        summer: result.summer,
        annualAverage: result.annualAverage,
        analysisYear: result.analysisYear ?? msg.year,
        perPointAnnual: result.perPointAnnual ?? [],
        roofGridPoints: result.roofGridPoints ?? [],
        facadeProxyPoints: result.facadeProxyPoints,
        groundProxyPoints: result.groundProxyPoints,
        perFacadeAnnual: result.perFacadeAnnual,
        perGroundAnnual: result.perGroundAnnual,
        facadeResults: result.facadeResults,
        groundAnnualAverage: result.groundAnnualAverage,
        samplingBreakdown: result.samplingBreakdown,
        perTimestepVisibility: result.perTimestepVisibility,
        timestepMeta: result.timestepMeta,
      } : null,
    };
    ctx.postMessage(response);
  } catch (err) {
    const errorMsg: WorkerOutMessage = {
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  } finally {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
    }
  }
});

export {};
