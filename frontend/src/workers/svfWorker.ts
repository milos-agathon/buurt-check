/// <reference lib="webworker" />

import { WebGLRenderer } from 'three';
import { computeSvfMultiPoint } from '../utils/svfComputation';
import { deserializeBuildings } from './geometrySerialization';
import type { SvfWorkerOutMessage, SvfWorkerRequest } from './sunlightWorkerTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<SvfWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'computeSvf') return;

  let renderer: WebGLRenderer | null = null;
  let meshes: ReturnType<typeof deserializeBuildings> = [];
  try {
    const canvas = new OffscreenCanvas(256, 256);
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not available in SVF Worker');
    }

    renderer = new WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      context: gl as WebGLRenderingContext,
    });

    meshes = deserializeBuildings(msg.buildings);
    const svf = computeSvfMultiPoint(renderer, meshes, msg.evalPoints, msg.maxSamplePoints);

    const response: SvfWorkerOutMessage = {
      type: 'svfResult',
      id: msg.id,
      svf,
    };
    ctx.postMessage(response);
  } catch (err) {
    const errorMsg: SvfWorkerOutMessage = {
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(errorMsg);
  } finally {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
    }
    renderer?.dispose();
  }
});

export {};
