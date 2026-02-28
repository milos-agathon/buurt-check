/// <reference lib="webworker" />

import { analyzeSunlight } from '../utils/sunlightAnalysis';
import { buildTrianglesFromBuildings, getRelativeTargetHeights } from '../utils/sunlightGeometry';
import { createTriangleRaycaster } from '../utils/triangleRaycaster';
import type {
  SunlightWorkerIncomingMessage,
  SunlightWorkerOutgoingMessage,
} from '../utils/sunlightWorkerProtocol';

const controllers = new Map<string, AbortController>();

function postMessageToMain(message: SunlightWorkerOutgoingMessage) {
  self.postMessage(message);
}

self.addEventListener('message', async (event: MessageEvent<SunlightWorkerIncomingMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'cancel') {
    const existing = controllers.get(message.requestId);
    if (existing) {
      existing.abort();
      controllers.delete(message.requestId);
    }
    return;
  }

  const { payload, requestId } = message;
  const abortController = new AbortController();
  controllers.set(requestId, abortController);

  try {
    const target = payload.buildings.find((building) => building.pand_id === payload.targetPandId);
    if (!target || target.footprint.length < 3) {
      postMessageToMain({ type: 'result', requestId, result: null });
      return;
    }

    const heights = getRelativeTargetHeights(payload.buildings, payload.targetPandId);
    if (!heights) {
      postMessageToMain({ type: 'result', requestId, result: null });
      return;
    }

    const triangles = buildTrianglesFromBuildings(
      payload.buildings,
      payload.targetPandId,
      payload.cullDistanceMeters,
    );
    const raycaster = createTriangleRaycaster(triangles);

    const result = await analyzeSunlight({
      buildingMeshes: [],
      raycaster,
      targetPandId: payload.targetPandId,
      footprint: target.footprint,
      roofY: heights.roofY,
      groundY: heights.groundY,
      lat: payload.lat,
      lng: payload.lng,
      year: payload.year,
      intervalMinutes: payload.intervalMinutes,
      chunkRaycasts: payload.chunkRaycasts,
      gridSpacingMeters: payload.gridSpacingMeters,
      maxPoints: payload.maxRoofPoints,
      includeFacadePoints: payload.includeFacadePoints,
      includeGroundPoints: payload.includeGroundPoints,
      facadePointCount: payload.facadePointCount,
      groundPointCount: payload.groundPointCount,
      abortSignal: abortController.signal,
    });

    if (abortController.signal.aborted) {
      postMessageToMain({ type: 'result', requestId, result: null });
      return;
    }

    const nextResult = result ? { ...result, analysisMethod: 'cpu-raycast-worker' as const } : null;
    postMessageToMain({ type: 'result', requestId, result: nextResult });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    if (isAbort) {
      postMessageToMain({ type: 'result', requestId, result: null });
      return;
    }
    const messageText = error instanceof Error ? error.message : 'Unknown worker error';
    postMessageToMain({ type: 'error', requestId, error: messageText });
  } finally {
    controllers.delete(requestId);
  }
});

export {};
