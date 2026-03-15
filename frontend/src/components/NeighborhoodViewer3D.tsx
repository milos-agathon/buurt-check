import { useEffect, useRef, useCallback, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  LinearFilter,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Shape,
  Spherical,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import HeatmapLegend from './HeatmapLegend';
import { sunHoursToColor } from '../utils/heatmapColors';
import {
  createDateInTimeZone,
  getSunDirection,
  sunCalcToNorthAzimuth,
  SUN_DISTANCE,
} from '../utils/sunPosition';
import { buildRoofPointGrid } from '../utils/spatialHashGrid';
import { ROOF_EVALUATION_OFFSET_METERS } from '../utils/sunlightConstants';
import { generateFacadePoints, generateGroundProxyPoints } from '../utils/roofSampling';
import { computeIrradiance } from '../utils/irradianceComputation';
import {
  centroidOfFootprint,
  frontSnapshotBearingDeg,
  northOverlayRotationRad,
  snapshotCameraScenePosition,
  snapshotTargetSceneZ,
} from '../utils/shadowSnapshotGeometry';
import { computeRoofNormal } from '../utils/surfaceNormals';
import { hasSeenTooltip, markTooltipSeen } from '../services/tooltipTracker';
import { fetchWeatherTmy } from '../services/api';
import { serializeBuildings } from '../workers/geometrySerialization';
import { isWorkerSupported, runSunlightInWorker } from '../workers/sunlightBridge';
import { isOffscreenCanvasSupported, runSvfInWorker } from '../workers/svfBridge';
import './NeighborhoodViewer3D.css';

/**
 * Theme-aware neighbor building appearance.
 * Contrast ratios (alpha-blended on ground, WCAG 1.4.11 graphical 3:1 min):
 *   Light: 0x556E85 @ 0.90 on #CDD5DF → blended #566F84 → 3.86:1
 *   Dark:  0x8A9BB0 @ 0.80 on #263848 → blended #738A9E → 3.52:1
 */
const NEIGHBOR_COLOR_LIGHT = 0x556E85;
const NEIGHBOR_COLOR_DARK = 0x8A9BB0;
const NEIGHBOR_OPACITY_LIGHT = 0.90;
const NEIGHBOR_OPACITY_DARK = 0.80;

interface Props {
  addressId?: string;
  reportId?: string;
  buildings: BuildingBlock[];
  targetPandId?: string;
  center: { lat: number; lng: number; rd_x: number; rd_y: number };
  sunDateTime?: Date;
  showHeatmap?: boolean;
  onSunlightAnalysis?: (result: SunlightResult) => void;
  onSunlightError?: () => void;
  sunlightRetryToken?: number;
  onShadowSnapshots?: (snapshots: ShadowSnapshot[]) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  statusMessage?: string | null;
}

interface HeatmapRange {
  minHours: number;
  maxHours: number;
}

// Canvas quality controls — feature-flagged for safe rollout.
const SHADOW_MAP_SIZE = Number(import.meta.env.VITE_VIEWER3D_SHADOW_SIZE) || 2048;
const DPR_CAP = Number(import.meta.env.VITE_VIEWER3D_DPR_CAP) || 2;
const SVF_SAMPLE_POINTS = Math.max(1, Number(import.meta.env.VITE_SVF_SAMPLE_POINTS) || 5);
const SVF_SAMPLE_POINTS_MOBILE = Math.max(1, Number(import.meta.env.VITE_SVF_SAMPLE_POINTS_MOBILE) || 3);
const SVF_IDLE_TIMEOUT_MS = Math.max(0, Number(import.meta.env.VITE_SVF_IDLE_TIMEOUT_MS) || 200);
const USE_SUNLIGHT_WORKER = import.meta.env.VITE_SUNLIGHT_USE_WORKER !== 'false';
const GROUND_SIZE = 750;
const FRUSTUM = 300;
const TARGET_COLOR = 0x2EC4B6;
const NEIGHBOR_CHUNK_SIZE = 40;
const NEIGHBOR_FRAME_BUDGET_MS = 10;
const VIEWER_FALLBACK_ASPECT = 0.75;
const VIEWER_FALLBACK_MAX_HEIGHT = 360;
const ISOMETRIC_POLAR_ANGLE = Math.PI / 3.3;
const ISOMETRIC_POLAR_RANGE = Math.PI / 30;
const CAMERA_FIT_PADDING = 1.12;
const CAMERA_MIN_DISTANCE_FACTOR = 0.90;
const CAMERA_MAX_DISTANCE_FACTOR = 1.35;
const GROUND_COLOR_LIGHT = 0xCDD5DF;
const GROUND_COLOR_DARK = 0x263848;
const HEATMAP_ROOF_NORMAL_MIN_Y = 0.25;
const TARGET_EMISSIVE = 0x57D4C8;
const GROUND_BASEMAP_SIZE = 1024;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

function getCanvasDimensions(container: HTMLDivElement) {
  const width = Math.max(container.clientWidth, 1);
  const fallbackHeight = Math.min(width * VIEWER_FALLBACK_ASPECT, VIEWER_FALLBACK_MAX_HEIGHT);
  const height = Math.max(container.clientHeight || fallbackHeight, 1);
  return { width, height };
}

function isLikelyMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia('(max-width: 768px)').matches) return true;
  }

  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === 'boolean') {
    return nav.userAgentData.mobile;
  }

  return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getSvfSamplePointBudget(): number {
  if (!isLikelyMobileDevice()) {
    return SVF_SAMPLE_POINTS;
  }
  return Math.min(SVF_SAMPLE_POINTS, SVF_SAMPLE_POINTS_MOBILE);
}

function waitForNextPaint(abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      abortSignal.removeEventListener('abort', finish);
      if (frameId != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
      resolve();
    };

    abortSignal.addEventListener('abort', finish, { once: true });

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(() => finish());
      timeoutId = setTimeout(finish, 32);
      return;
    }

    timeoutId = setTimeout(finish, 0);
  });
}

function waitForMainThreadIdle(abortSignal: AbortSignal, timeoutMs: number): Promise<void> {
  if (abortSignal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      abortSignal.removeEventListener('abort', finish);

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }

      if (
        idleId != null
        && typeof window !== 'undefined'
      ) {
        const idleWindow = window as IdleWindow;
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      }

      resolve();
    };

    abortSignal.addEventListener('abort', finish, { once: true });

    if (typeof window === 'undefined') {
      timeoutId = setTimeout(finish, 0);
      return;
    }

    const idleWindow = window as IdleWindow;
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(() => finish(), { timeout: timeoutMs });
      return;
    }

    timeoutId = setTimeout(finish, 16);
  });
}

/**
 * Create a BufferGeometry from LoD 2.2 surfaces.
 * Each surface is a polygon of [dx, dy, z_nap] vertices (RD offsets + NAP height).
 * Converts to Three.js Y-up: [dx, z_nap - buildingGround, -dy] so north points toward -Z.
 * Uses fan triangulation from vertex 0 for each polygon.
 */
function createLod22Geometry(surfaces: number[][][], buildingGround: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const surface of surfaces) {
    if (surface.length < 3) continue;
    const baseIndex = positions.length / 3;

    for (const vert of surface) {
      // [dx, dy, z_nap] -> Three.js [dx, z_nap - buildingGround, -dy] (North is -Z)
      positions.push(vert[0], vert[2] - buildingGround, -vert[1]);
    }

    // Fan triangulation: vertex 0 connects to each consecutive pair
    for (let i = 1; i < surface.length - 1; i++) {
      indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createBuildingGeometry(building: BuildingBlock): BufferGeometry | null {
  if (building.roof_surfaces && building.roof_surfaces.length > 0) {
    return createLod22Geometry(building.roof_surfaces, building.ground_height);
  }

  const footprint = building.footprint;
  if (footprint.length < 3) return null;

  const shape = new Shape();
  shape.moveTo(footprint[0][0], footprint[0][1]);
  for (let i = 1; i < footprint.length; i++) {
    shape.lineTo(footprint[i][0], footprint[i][1]);
  }
  shape.closePath();

  const geom = new ExtrudeGeometry(shape, {
    depth: building.building_height,
    bevelEnabled: false,
  });
  const transform = new Matrix4().makeRotationX(-Math.PI / 2);
  transform.setPosition(0, 0, 0);
  geom.applyMatrix4(transform);
  geom.deleteAttribute('uv');
  return geom;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getRoofNormal(building: BuildingBlock): [number, number, number] {
  const surfaces = building.roof_surfaces;
  if (!surfaces || surfaces.length === 0) {
    return [0, 1, 0];
  }

  let topSurface: number[][] | null = null;
  let topSurfaceAvgY = -Infinity;

  for (const surface of surfaces) {
    if (!surface || surface.length < 3) continue;

    const avgY = surface.reduce((sum, vert) => sum + (vert[2] ?? 0), 0) / surface.length;
    if (avgY > topSurfaceAvgY) {
      topSurfaceAvgY = avgY;
      topSurface = surface.map((vert) => [vert[0], vert[2], -vert[1]]);
    }
  }

  if (!topSurface || topSurface.length < 3) {
    return [0, 1, 0];
  }

  return computeRoofNormal(topSurface);
}

function getHeatmapRange(values: number[]): HeatmapRange | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return {
    minHours: round1(min),
    maxHours: round1(max),
  };
}

function toRgbComponents(hexColor: number): [number, number, number] {
  const color = new Color(hexColor);
  return [color.r, color.g, color.b];
}

export default function NeighborhoodViewer3D({
  addressId,
  reportId,
  buildings,
  targetPandId,
  center,
  sunDateTime,
  showHeatmap = false,
  onSunlightAnalysis,
  onSunlightError,
  sunlightRetryToken = 0,
  onShadowSnapshots,
  loading = false,
  error,
  onRetry,
  statusMessage,
}: Props) {
  const { t } = useTranslation();
  const sceneSummaryId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    controls: OrbitControls;
    sunLight: DirectionalLight;
    ambientLight: HemisphereLight;
    buildingMeshes: Mesh[];
    ground: Mesh;
    animId: number;
    renderQueued: boolean;
  } | null>(null);

  const groundTextureRef = useRef<Texture | null>(null);
  const targetMeshRef = useRef<Mesh | null>(null);
  const targetMaterialCloneRef = useRef<MeshStandardMaterial | null>(null);
  const sunlightComputed = useRef(false);
  const sunlightResultRef = useRef<SunlightResult | null>(null);
  const sunlightAbortRef = useRef<AbortController | null>(null);
  const snapshotsCaptured = useRef(false);
  const onSunlightAnalysisRef = useRef(onSunlightAnalysis);
  onSunlightAnalysisRef.current = onSunlightAnalysis;
  const onSunlightErrorRef = useRef(onSunlightError);
  onSunlightErrorRef.current = onSunlightError;
  const onShadowSnapshotsRef = useRef(onShadowSnapshots);
  onShadowSnapshotsRef.current = onShadowSnapshots;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const allBuildingsReadyRef = useRef(false);
  const neighborBuildFrameRef = useRef<number | null>(null);
  const dampingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange | null>(null);
  const [showControlsHint, setShowControlsHint] = useState(() => !hasSeenTooltip('3d-controls'));
  const targetBuilding = buildings.find((building) => building.pand_id === targetPandId) ?? buildings[0];
  const staticSceneSummary = targetBuilding
    ? t(
      'viewer3d.altSummaryWithTarget',
      {
        count: buildings.length,
        height: Math.round(targetBuilding.building_height),
      },
    )
    : t('viewer3d.altSummaryNoTarget', { count: buildings.length });

  // Camera tracking refs
  const cameraSetRef = useRef(false);
  const lastFocusedPandId = useRef<string | null>(null);

  const renderOnce = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx || ctx.renderQueued) return;
    ctx.renderQueued = true;
    requestAnimationFrame(() => {
      const current = sceneRef.current;
      if (!current) return;
      current.controls.update();
      current.renderer.render(current.scene, current.camera);
      current.renderQueued = false;
    });
  }, []);

  // Controls hint: auto-dismiss after 3s or on first interaction
  const dismissControlsHint = useCallback(() => {
    setShowControlsHint(false);
    markTooltipSeen('3d-controls');
  }, []);

  useEffect(() => {
    if (!showControlsHint) return;
    const timer = setTimeout(dismissControlsHint, 3000);
    const el = containerRef.current;
    if (el) {
      el.addEventListener('mousedown', dismissControlsHint, { once: true });
      el.addEventListener('touchstart', dismissControlsHint, { once: true });
      el.addEventListener('wheel', dismissControlsHint, { once: true });
    }
    return () => {
      clearTimeout(timer);
      if (el) {
        el.removeEventListener('mousedown', dismissControlsHint);
        el.removeEventListener('touchstart', dismissControlsHint);
        el.removeEventListener('wheel', dismissControlsHint);
      }
    };
  }, [showControlsHint, dismissControlsHint]);

  // Detect pointer type for hint text: coarse = touch, fine = desktop
  const isTouchDevice = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches;

  // Extract camera framing into a callable function
  const frameCamera = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx || buildings.length === 0) return;

    const minGround = Math.min(...buildings.map((b) => b.ground_height));

    let allMinX = Infinity, allMaxX = -Infinity, allMinY = Infinity, allMaxY = -Infinity;
    let tallestHeight = 0;
    for (const b of buildings) {
      for (const p of b.footprint) {
        allMinX = Math.min(allMinX, p[0]);
        allMaxX = Math.max(allMaxX, p[0]);
        allMinY = Math.min(allMinY, p[1]);
        allMaxY = Math.max(allMaxY, p[1]);
      }
      tallestHeight = Math.max(tallestHeight, b.building_height);
    }

    const spanX = allMaxX - allMinX;
    const spanZ = allMaxY - allMinY;
    const maxSpan = Math.max(spanX, spanZ, 1);

    const targetBuilding = targetPandId ? buildings.find((b) => b.pand_id === targetPandId) : null;
    const focusBuilding = targetBuilding || buildings[0];
    const fp = focusBuilding.footprint;
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
    const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const targetY = focusBuilding.ground_height - minGround + Math.max(focusBuilding.building_height * 0.45, 6);

    const verticalExtent = Math.max(tallestHeight + 10, 20);
    const vfov = (ctx.camera.fov * Math.PI) / 180;
    const aspect = Math.max(ctx.camera.aspect, 1);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const distanceForHeight = (verticalExtent / 2) / Math.tan(vfov / 2);
    const distanceForWidth = (maxSpan / 2) / Math.tan(hfov / 2);
    const baseDistance = Math.max(distanceForHeight, distanceForWidth, 28) * CAMERA_FIT_PADDING;

    const azimuth = Math.PI / 4;
    const planarDistance = Math.sin(ISOMETRIC_POLAR_ANGLE) * baseDistance;
    const cameraX = cx + Math.cos(azimuth) * planarDistance;
    const cameraY = targetY + Math.cos(ISOMETRIC_POLAR_ANGLE) * baseDistance;
    const cameraZ = cy + Math.sin(azimuth) * planarDistance;

    ctx.camera.position.set(cameraX, cameraY, cameraZ);
    ctx.camera.lookAt(cx, targetY, cy);
    ctx.controls.target.set(cx, targetY, cy);
    ctx.controls.minDistance = baseDistance * CAMERA_MIN_DISTANCE_FACTOR;
    ctx.controls.maxDistance = baseDistance * CAMERA_MAX_DISTANCE_FACTOR;
    ctx.camera.updateProjectionMatrix();
    renderOnce();
  }, [buildings, targetPandId, renderOnce]);

  // Keyboard navigation for accessibility (WCAG 2.1.1)
  const ORBIT_STEP = 0.087; // ~5 degrees in radians
  const ZOOM_FACTOR = 0.9;  // 10% per keypress

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const { camera, controls } = ctx;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new Spherical().setFromVector3(offset);

    let handled = false;

    switch (e.key) {
      case 'ArrowLeft':
        spherical.theta -= ORBIT_STEP;
        handled = true;
        break;
      case 'ArrowRight':
        spherical.theta += ORBIT_STEP;
        handled = true;
        break;
      case 'ArrowUp':
        spherical.phi = Math.max(controls.minPolarAngle, spherical.phi - ORBIT_STEP);
        handled = true;
        break;
      case 'ArrowDown':
        spherical.phi = Math.min(controls.maxPolarAngle, spherical.phi + ORBIT_STEP);
        handled = true;
        break;
      case '+':
      case '=':
      case 'PageUp':
        spherical.radius = Math.max(controls.minDistance, spherical.radius * ZOOM_FACTOR);
        handled = true;
        break;
      case '-':
      case 'PageDown':
        spherical.radius = Math.min(controls.maxDistance, spherical.radius / ZOOM_FACTOR);
        handled = true;
        break;
      case 'Home':
        frameCamera();
        e.preventDefault();
        return;
    }

    if (handled) {
      e.preventDefault();
      camera.position.copy(new Vector3().setFromSpherical(spherical).add(controls.target));
      camera.lookAt(controls.target);
      renderOnce();
    }
  }, [frameCamera, renderOnce]);

  const resetTargetHeatmap = useCallback(() => {
    const targetMesh = targetMeshRef.current;
    if (!targetMesh) return;

    const geometry = targetMesh.geometry as Partial<BufferGeometry>;
    if (
      typeof geometry.getAttribute === 'function'
      && typeof geometry.deleteAttribute === 'function'
      && geometry.getAttribute('color')
    ) {
      geometry.deleteAttribute('color');
    }

    const material = Array.isArray(targetMesh.material) ? targetMesh.material[0] : targetMesh.material;
    if (material instanceof MeshStandardMaterial) {
      const originalMaterial = targetMaterialCloneRef.current;
      if (originalMaterial) {
        material.copy(originalMaterial);
      } else {
        material.vertexColors = false;
        material.color.setHex(TARGET_COLOR);
      }
      material.needsUpdate = true;
    }
  }, []);

  const applyTargetHeatmap = useCallback((result: SunlightResult): HeatmapRange | null => {
    const targetMesh = targetMeshRef.current;
    if (!targetMesh) return null;

    const geometry = targetMesh.geometry as Partial<BufferGeometry>;
    if (
      typeof geometry.getAttribute !== 'function'
      || typeof geometry.setAttribute !== 'function'
    ) {
      return null;
    }

    const positions = geometry.getAttribute('position');
    if (
      !positions
      || typeof positions.getX !== 'function'
      || typeof positions.getZ !== 'function'
      || typeof positions.count !== 'number'
    ) {
      return null;
    }

    const roofPoints = result.roofGridPoints ?? [];
    const perPointAnnual = result.perPointAnnual ?? [];
    if (!showHeatmap || roofPoints.length === 0 || perPointAnnual.length !== roofPoints.length) {
      resetTargetHeatmap();
      return null;
    }

    const range = getHeatmapRange(perPointAnnual);
    if (!range) {
      resetTargetHeatmap();
      return null;
    }

    const normals = geometry.getAttribute('normal');
    const colors = new Float32BufferAttribute(positions.count * 3, 3);
    const baseColor = toRgbComponents(TARGET_COLOR);

    // Pre-compute spatial index for O(1) amortized nearest-neighbor lookups
    // instead of O(m) brute-force per vertex. Cell size 5m covers ~2.5x the
    // typical 2m roof grid spacing, so 3x3 neighborhood search is sufficient.
    const roofGrid = buildRoofPointGrid(roofPoints, 5);

    for (let i = 0; i < positions.count; i++) {
      const normalY = normals ? normals.getY(i) : 1;
      if (normalY < HEATMAP_ROOF_NORMAL_MIN_Y) {
        colors.setXYZ(i, baseColor[0], baseColor[1], baseColor[2]);
        continue;
      }

      const vx = positions.getX(i);
      const vz = positions.getZ(i);

      const nearest = roofGrid.findNearest(vx, vz, roofPoints);

      if (!nearest) {
        colors.setXYZ(i, baseColor[0], baseColor[1], baseColor[2]);
        continue;
      }

      const sampleHours = perPointAnnual[nearest.index];
      if (!Number.isFinite(sampleHours)) {
        colors.setXYZ(i, baseColor[0], baseColor[1], baseColor[2]);
        continue;
      }
      const [r, g, b] = sunHoursToColor(sampleHours, range.minHours, range.maxHours);
      colors.setXYZ(i, r, g, b);
    }

    geometry.setAttribute('color', colors);

    const material = Array.isArray(targetMesh.material) ? targetMesh.material[0] : targetMesh.material;
    if (material instanceof MeshStandardMaterial) {
      if (targetMaterialCloneRef.current == null) {
        targetMaterialCloneRef.current = material.clone();
      }
      material.vertexColors = true;
      material.color.setHex(0xffffff);
      material.needsUpdate = true;
    }

    return range;
  }, [resetTargetHeatmap, showHeatmap]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = getCanvasDimensions(container);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const groundColor = isDarkMode ? GROUND_COLOR_DARK : GROUND_COLOR_LIGHT;

    // Scene
    const scene = new Scene();
    // Match the scene background to the ground plane so framing stays geometry-first.
    scene.background = new Color(groundColor);

    // Camera
    const camera = new PerspectiveCamera(50, width / height, 1, 1000);
    camera.position.set(100, 120, 100);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new HemisphereLight(
      isDarkMode ? 0x5B6672 : 0xE7EDF3,
      isDarkMode ? 0x2C3642 : 0xBEC8D2,
      isDarkMode ? 0.20 : 0.26,
    );
    scene.add(ambient);

    const sunLight = new DirectionalLight(0xffffff, isDarkMode ? 0.95 : 1.0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    sunLight.shadow.camera.left = -FRUSTUM;
    sunLight.shadow.camera.right = FRUSTUM;
    sunLight.shadow.camera.top = FRUSTUM;
    sunLight.shadow.camera.bottom = -FRUSTUM;
    sunLight.shadow.camera.far = 600;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.bias = -0.001;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target); // Required for shadow rendering

    // Ground plane
    const groundGeom = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new MeshStandardMaterial({
      color: groundColor,
      roughness: 0.90,
      side: DoubleSide,
    });
    const ground = new Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    // Controls — orbit only
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = ISOMETRIC_POLAR_ANGLE - ISOMETRIC_POLAR_RANGE;
    controls.maxPolarAngle = ISOMETRIC_POLAR_ANGLE + ISOMETRIC_POLAR_RANGE;

    const continuousRender = import.meta.env.VITE_VIEWER3D_CONTINUOUS_RENDER === 'true';
    let onControlStart: (() => void) | null = null;
    let onControlChange: (() => void) | null = null;
    let onControlEnd: (() => void) | null = null;

    sceneRef.current = {
      scene, camera, renderer, controls, sunLight, ambientLight: ambient,
      buildingMeshes: [], ground, animId: 0, renderQueued: false,
    };

    if (continuousRender) {
      const animate = () => {
        const id = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        sceneRef.current!.animId = id;
      };
      animate();
    } else {
      const runDampingLoop = () => {
        const current = sceneRef.current;
        if (!current) return;
        controls.update();
        renderer.render(scene, camera);
        current.animId = requestAnimationFrame(runDampingLoop);
      };

      onControlStart = () => {
        if (dampingTimerRef.current) {
          clearTimeout(dampingTimerRef.current);
          dampingTimerRef.current = null;
        }
        const current = sceneRef.current;
        if (current && current.animId === 0) {
          runDampingLoop();
        }
      };

      onControlChange = () => {
        if (sceneRef.current?.animId === 0) {
          renderOnce();
        }
      };

      onControlEnd = () => {
        if (dampingTimerRef.current) {
          clearTimeout(dampingTimerRef.current);
        }
        dampingTimerRef.current = setTimeout(() => {
          const current = sceneRef.current;
          if (current) {
            cancelAnimationFrame(current.animId);
            current.animId = 0;
            controls.update();
            renderer.render(scene, camera);
          }
          dampingTimerRef.current = null;
        }, 500);
      };

      controls.addEventListener('start', onControlStart);
      controls.addEventListener('change', onControlChange);
      controls.addEventListener('end', onControlEnd);

      // Draw initial frame so scene contents are visible while idle.
      renderOnce();
    }

    // Resize handler
    const onResize = () => {
      const { width: w, height: h } = getCanvasDimensions(container);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderOnce();
    };
    window.addEventListener('resize', onResize);

    return () => {
      sunlightAbortRef.current?.abort();
      sunlightAbortRef.current = null;
      if (dampingTimerRef.current) {
        clearTimeout(dampingTimerRef.current);
        dampingTimerRef.current = null;
      }
      window.removeEventListener('resize', onResize);
      if (onControlStart) controls.removeEventListener('start', onControlStart);
      if (onControlChange) controls.removeEventListener('change', onControlChange);
      if (onControlEnd) controls.removeEventListener('end', onControlEnd);
      cancelAnimationFrame(sceneRef.current?.animId ?? 0);
      controls.dispose();
      // Dispose all scene resources (geometries, materials, textures, shadow maps)
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            (obj.material as Material[]).forEach((m) => m.dispose());
          } else {
            (obj.material as Material)?.dispose();
          }
        }
        if (obj instanceof DirectionalLight && obj.shadow?.map) {
          obj.shadow.map.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      targetMeshRef.current = null;
      targetMaterialCloneRef.current?.dispose();
      targetMaterialCloneRef.current = null;
      sunlightResultRef.current = null;
      sceneRef.current = null;
    };
  }, [renderOnce]);

  // Capture shadow snapshots for export: three summer-solstice top views
  // at 09:00, 12:00, and 15:00 local time.
  const captureSnapshots = useCallback(() => {
    const ctx = sceneRef.current;
    const callback = onShadowSnapshotsRef.current;
    if (!ctx || !callback || snapshotsCaptured.current) return;
    if (!allBuildingsReadyRef.current) return;
    snapshotsCaptured.current = true;

    // Keep export captures sharp enough for PDF while avoiding multi-megabyte
    // request payloads that can fail in production proxies.
    const OFFSCREEN_W = 1800;
    const OFFSCREEN_H = 1200;
    const HIRES_SHADOW_MAP = 4096;
    const SNAPSHOT_RADIUS_METERS = 30;
    const SNAPSHOT_BACKGROUND_COLOR = 0xF7FAFD;
    const SNAPSHOT_GROUND_COLOR = 0xDDE6EF;
    const SNAPSHOT_NEIGHBOR_COLOR = 0xBAC6D1;
    const SCALE_BAR_METERS = 15;
    const SNAPSHOT_MIME_TYPE = 'image/jpeg';
    const SNAPSHOT_JPEG_QUALITY = 0.86;

    // Save camera + sun state
    const savedCameraPos = ctx.camera.position.clone();
    const savedSunPos = ctx.sunLight.position.clone();
    const savedSunIntensity = ctx.sunLight.intensity;
    const savedAspect = ctx.camera.aspect;
    const savedSceneBackground = ctx.scene.background;

    // Save original shadow map size to restore later
    const origShadowW = ctx.sunLight.shadow.mapSize.width;
    const origShadowH = ctx.sunLight.shadow.mapSize.height;

    // Create offscreen renderer for high-res capture
    let offscreenRenderer: WebGLRenderer | null = null;
    try {
      offscreenRenderer = new WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      offscreenRenderer.setSize(OFFSCREEN_W, OFFSCREEN_H);
      offscreenRenderer.setPixelRatio(1);
      offscreenRenderer.shadowMap.enabled = true;
      offscreenRenderer.shadowMap.type = PCFSoftShadowMap;
    } catch {
      // WebGL context creation can fail (e.g. too many contexts).
      // Fall back to the interactive renderer.
      offscreenRenderer = null;
    }

    const renderTarget = offscreenRenderer ?? ctx.renderer;
    const outputW = offscreenRenderer ? OFFSCREEN_W : (renderTarget.domElement.width || OFFSCREEN_W);
    const outputH = offscreenRenderer ? OFFSCREEN_H : (renderTarget.domElement.height || OFFSCREEN_H);
    const outputAspect = outputW / outputH;
    const fovRad = (ctx.camera.fov * Math.PI) / 180;
    const computedHeight = (2 * SNAPSHOT_RADIUS_METERS)
      / (2 * Math.tan(fovRad / 2) * outputAspect);
    const snapshotCameraHeight = Math.max(28, computedHeight);

    // Keep a clone backup per material so snapshot print styling can be restored safely.
    const materialBackups = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const backupMaterial = (material: Material) => {
      if (!(material instanceof MeshStandardMaterial)) return;
      if (!materialBackups.has(material)) {
        materialBackups.set(material, material.clone());
      }
    };
    const styleMaterial = (
      material: Material,
      style: {
        color: number;
        emissive?: number;
        emissiveIntensity?: number;
        opacity?: number;
        transparent?: boolean;
        roughness?: number;
        metalness?: number;
      },
    ) => {
      if (!(material instanceof MeshStandardMaterial)) return;
      backupMaterial(material);
      material.color.setHex(style.color);
      if (
        style.emissive != null
        && typeof (
          material as MeshStandardMaterial & { emissive?: { setHex: (hex: number) => void } }
        ).emissive?.setHex === 'function'
      ) {
        (material as MeshStandardMaterial & { emissive: { setHex: (hex: number) => void } })
          .emissive.setHex(style.emissive);
      }
      if (style.emissiveIntensity != null) {
        (material as MeshStandardMaterial & { emissiveIntensity: number })
          .emissiveIntensity = style.emissiveIntensity;
      }
      if (style.opacity != null) {
        material.opacity = style.opacity;
      }
      if (style.transparent != null) {
        material.transparent = style.transparent;
      }
      if (style.roughness != null) {
        material.roughness = style.roughness;
      }
      if (style.metalness != null) {
        material.metalness = style.metalness;
      }
      material.needsUpdate = true;
    };

    // Snapshot styling is print-first and independent from interactive dark mode.
    // Use lighter surfaces plus lower ambient fill so cast shadows stay legible
    // in the exported dossier instead of blending into neighboring buildings.
    const savedAmbientSky = ctx.ambientLight.color.getHex();
    const savedAmbientGround = ctx.ambientLight.groundColor.getHex();
    const savedAmbientIntensity = ctx.ambientLight.intensity;
    ctx.ambientLight.color.setHex(0xF0F5F9);
    ctx.ambientLight.groundColor.setHex(0xCDD8E2);
    ctx.ambientLight.intensity = 0.08;

    ctx.scene.background = new Color(SNAPSHOT_BACKGROUND_COLOR);
    const groundMaterials = Array.isArray(ctx.ground.material) ? ctx.ground.material : [ctx.ground.material];
    for (const material of groundMaterials) {
      styleMaterial(material, {
        color: SNAPSHOT_GROUND_COLOR,
        transparent: false,
        opacity: 1,
        roughness: 0.95,
        metalness: 0.02,
      });
    }
    const targetMesh = targetMeshRef.current;
    for (const mesh of ctx.buildingMeshes) {
      const isTargetMesh = mesh === targetMesh || mesh.userData.pandId === targetPandId;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (isTargetMesh) {
          styleMaterial(material, {
            color: TARGET_COLOR,
            emissive: TARGET_EMISSIVE,
            emissiveIntensity: 0.55,
            transparent: false,
            opacity: 1,
            roughness: 0.5,
            metalness: 0.06,
          });
        } else {
          styleMaterial(material, {
            color: SNAPSHOT_NEIGHBOR_COLOR,
            emissive: 0x000000,
            emissiveIntensity: 0,
            transparent: false,
            opacity: 1,
            roughness: 0.86,
            metalness: 0.05,
          });
        }
      }
    }

    // Temporarily increase shadow map to 4096 for higher quality
    if (origShadowW < HIRES_SHADOW_MAP) {
      ctx.sunLight.shadow.mapSize.width = HIRES_SHADOW_MAP;
      ctx.sunLight.shadow.mapSize.height = HIRES_SHADOW_MAP;
      // Dispose existing shadow map so Three.js regenerates at new size
      if (ctx.sunLight.shadow.map) {
        ctx.sunLight.shadow.map.dispose();
        ctx.sunLight.shadow.map = null as unknown as typeof ctx.sunLight.shadow.map;
      }
    }

    if (offscreenRenderer) {
      ctx.camera.aspect = OFFSCREEN_W / OFFSCREEN_H;
    }
    ctx.camera.updateProjectionMatrix();

    const snapshots: ShadowSnapshot[] = [];
    const targetBuilding = buildings.find((building) => building.pand_id === targetPandId);
    const targetFootprint = targetBuilding?.footprint;
    const focusFootprint = targetFootprint && targetFootprint.length >= 3
      ? targetFootprint
      : buildings[0]?.footprint ?? [[0, 0]];
    const centroid = centroidOfFootprint(focusFootprint);
    const cx = centroid.x;
    const cy = centroid.y;
    const targetHeight = targetBuilding?.building_height ?? 12;
    const snapshotTargetY = Math.max(targetHeight * 0.45, 6);
    const frontBearingDeg = frontSnapshotBearingDeg(
      focusFootprint,
      targetBuilding?.orientation_deg,
    );
    const year = new Date().getFullYear();
    // Capture summer-solstice evidence using one stable oblique top view at
    // three times of day, so the viewer and export flows share the same
    // morning / noon / late-afternoon evidence set.
    const topBearingDeg = (frontBearingDeg + 30) % 360;
    const snapshotConfigs = [
      { hour: 9, label: 'top_morning', viewpoint: 'top' as const, month: 5, day: 21, bearingDeg: topBearingDeg },
      { hour: 12, label: 'top_noon', viewpoint: 'top' as const, month: 5, day: 21, bearingDeg: topBearingDeg },
      { hour: 15, label: 'top_afternoon', viewpoint: 'top' as const, month: 5, day: 21, bearingDeg: topBearingDeg },
    ];

    // Overlay canvas for cartographic elements
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = outputW;
    overlayCanvas.height = outputH;
    const overlayCtx = overlayCanvas.getContext('2d');
    let captureSucceeded = false;

    try {
      for (const config of snapshotConfigs) {
        const date = createDateInTimeZone(year, config.month, config.day, config.hour, 0);
        // Front/rear views use shorter planar distance for a closer, more
        // informative perspective.  Top view keeps a wider distance for context.
        const isTopView = config.viewpoint === 'top';
        // Front/rear: close enough to clearly see the building, but far
        // enough that it's never clipped at the edges.
        const planarDistance = isTopView ? snapshotCameraHeight : Math.max(14, snapshotCameraHeight * 0.55);
        const cameraElevation = isTopView ? snapshotCameraHeight : Math.max(10, snapshotCameraHeight * 0.45);
        const cameraPos = snapshotCameraScenePosition(centroid, config.bearingDeg, planarDistance);
        ctx.camera.position.set(
          cameraPos.x,
          snapshotTargetY + cameraElevation,
          cameraPos.z,
        );
        ctx.camera.lookAt(cx, snapshotTargetY, snapshotTargetSceneZ(cy));
        ctx.camera.updateProjectionMatrix();

        const sunDir = getSunDirection(date, center.lat, center.lng);
        const sunAzimuthDeg = sunDir
          ? ((Math.atan2(sunDir.x, -sunDir.z) * 180 / Math.PI) + 360) % 360
          : null;
        const sunAltitudeDeg = sunDir
          ? Math.max(0, Math.asin(sunDir.y) * 180 / Math.PI)
          : null;

        if (sunDir) {
          ctx.sunLight.position.set(
            sunDir.x * SUN_DISTANCE,
            sunDir.y * SUN_DISTANCE,
            sunDir.z * SUN_DISTANCE,
          );
          // Slightly stronger directional light keeps lit surfaces bright while
          // preserving distinctly darker shadow areas in the exported images.
          ctx.sunLight.intensity = 1.15;
        } else {
          ctx.sunLight.intensity = 0;
        }

        renderTarget.render(ctx.scene, ctx.camera);

        // Composite: render 3D + cartographic overlays
        const cw = overlayCanvas.width;
        const ch = overlayCanvas.height;
        const aspect = cw / ch;
        const visibleHeight = 2 * cameraElevation * Math.tan(fovRad / 2);
        const visibleWidth = visibleHeight * aspect;
        const metersPerPixel = visibleWidth / cw;

        if (overlayCtx) {
          overlayCtx.clearRect(0, 0, cw, ch);
          // Draw the 3D render onto the overlay canvas
          overlayCtx.drawImage(renderTarget.domElement, 0, 0, cw, ch);
          const uiScale = Math.max(0.45, Math.min(1.2, cw / OFFSCREEN_W));
          const px = (value: number) => Math.max(1, Math.round(value * uiScale));
          const uiMargin = px(40);
          const uiTextColor = 'rgba(28, 45, 63, 0.96)';

          // --- Compass rose (top-right, rotated so N points toward geographic north) ---
          const compassDiameterPx = px(190);
          const compassRadius = compassDiameterPx / 2;
          const compassCx = cw - uiMargin - compassRadius;
          const compassCy = uiMargin + compassRadius + px(24);
          overlayCtx.save();
          // Background circle (unrotated)
          overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.90)';
          overlayCtx.beginPath();
          overlayCtx.arc(compassCx, compassCy, compassRadius, 0, Math.PI * 2);
          overlayCtx.fill();
          overlayCtx.strokeStyle = uiTextColor;
          overlayCtx.lineWidth = px(4);
          overlayCtx.stroke();
          // Rotate the inner arrow + N label around the compass center
          overlayCtx.translate(compassCx, compassCy);
          overlayCtx.rotate(northOverlayRotationRad(config.bearingDeg));
          overlayCtx.fillStyle = uiTextColor;
          overlayCtx.strokeStyle = uiTextColor;
          overlayCtx.lineWidth = px(5);
          overlayCtx.font = `700 ${px(46)}px sans-serif`;
          overlayCtx.textAlign = 'center';
          overlayCtx.fillText('N', 0, -compassRadius + px(48));
          // Arrow shaft
          overlayCtx.beginPath();
          overlayCtx.moveTo(0, compassRadius - px(30));
          overlayCtx.lineTo(0, -compassRadius + px(62));
          overlayCtx.stroke();
          // Arrow head
          overlayCtx.beginPath();
          overlayCtx.moveTo(0, -compassRadius + px(52));
          overlayCtx.lineTo(-px(18), -compassRadius + px(80));
          overlayCtx.lineTo(px(18), -compassRadius + px(80));
          overlayCtx.closePath();
          overlayCtx.fill();
          overlayCtx.restore();

          // Target building is already teal-colored in the 3D scene via
          // TARGET_COLOR material — no extra 2D outline overlay needed.

          // --- Scale bar (bottom-left) ---
          const scalePx = Math.max(px(150), Math.min(SCALE_BAR_METERS / metersPerPixel, cw * 0.3));
          const scalePanelPadX = px(26);
          const scalePanelPadY = px(28);
          const scalePanelW = scalePx + (2 * scalePanelPadX);
          const scalePanelH = px(210);
          const scalePanelX = uiMargin;
          const scalePanelY = ch - uiMargin - scalePanelH;
          const sx = scalePanelX + scalePanelPadX;
          const sy = scalePanelY + scalePanelPadY + px(40);
          overlayCtx.save();
          overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.90)';
          overlayCtx.fillRect(scalePanelX, scalePanelY, scalePanelW, scalePanelH);
          overlayCtx.fillStyle = uiTextColor;
          overlayCtx.strokeStyle = uiTextColor;
          overlayCtx.lineWidth = px(16);
          // Bar
          overlayCtx.beginPath();
          overlayCtx.moveTo(sx, sy);
          overlayCtx.lineTo(sx + scalePx, sy);
          overlayCtx.stroke();
          // End caps
          const capHalf = px(36);
          overlayCtx.beginPath();
          overlayCtx.moveTo(sx, sy - capHalf);
          overlayCtx.lineTo(sx, sy + capHalf);
          overlayCtx.moveTo(sx + scalePx, sy - capHalf);
          overlayCtx.lineTo(sx + scalePx, sy + capHalf);
          overlayCtx.stroke();
          // Label
          overlayCtx.font = `700 ${px(90)}px sans-serif`;
          overlayCtx.textAlign = 'center';
          overlayCtx.fillText(`${SCALE_BAR_METERS}m`, sx + scalePx / 2, sy + px(110));
          overlayCtx.restore();

          const dataUrl = overlayCanvas.toDataURL(SNAPSHOT_MIME_TYPE, SNAPSHOT_JPEG_QUALITY);
          snapshots.push({
            label: config.label,
            hour: config.hour,
            dataUrl,
            viewpoint: config.viewpoint,
            sunAzimuth: sunAzimuthDeg ?? undefined,
            sunAltitude: sunAltitudeDeg ?? undefined,
          });
        } else {
          // No 2D context (unlikely) — fall back to raw 3D capture
          const dataUrl = renderTarget.domElement.toDataURL(
            SNAPSHOT_MIME_TYPE,
            SNAPSHOT_JPEG_QUALITY,
          );
          snapshots.push({
            label: config.label,
            hour: config.hour,
            dataUrl,
            viewpoint: config.viewpoint,
            sunAzimuth: sunAzimuthDeg ?? undefined,
            sunAltitude: sunAltitudeDeg ?? undefined,
          });
        }
      }

      captureSucceeded = true;
      callback(snapshots);
    } finally {
      // Dispose offscreen renderer
      if (offscreenRenderer) {
        offscreenRenderer.dispose();
      }

      // Restore shadow map size
      if (origShadowW < HIRES_SHADOW_MAP) {
        ctx.sunLight.shadow.mapSize.width = origShadowW;
        ctx.sunLight.shadow.mapSize.height = origShadowH;
        // Dispose high-res shadow map so it regenerates at original size
        if (ctx.sunLight.shadow.map) {
          ctx.sunLight.shadow.map.dispose();
          ctx.sunLight.shadow.map = null as unknown as typeof ctx.sunLight.shadow.map;
        }
      }

      for (const [material, backup] of materialBackups.entries()) {
        material.copy(backup);
        material.needsUpdate = true;
        backup.dispose();
      }

      ctx.scene.background = savedSceneBackground;

      // Restore ambient light
      ctx.ambientLight.color.setHex(savedAmbientSky);
      ctx.ambientLight.groundColor.setHex(savedAmbientGround);
      ctx.ambientLight.intensity = savedAmbientIntensity;

      // Restore camera and sun state
      ctx.camera.position.copy(savedCameraPos);
      ctx.camera.aspect = savedAspect;
      ctx.camera.lookAt(0, 0, 0);
      ctx.camera.updateProjectionMatrix();
      ctx.sunLight.position.copy(savedSunPos);
      ctx.sunLight.intensity = savedSunIntensity;
      renderOnce();

      if (!captureSucceeded) {
        snapshotsCaptured.current = false;
      }
    }
  }, [buildings, center.lat, center.lng, renderOnce, targetPandId]);

  // Add buildings to scene
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || buildings.length === 0) return;
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    if (neighborBuildFrameRef.current != null) {
      cancelAnimationFrame(neighborBuildFrameRef.current);
      neighborBuildFrameRef.current = null;
    }

    // Remove old buildings
    sunlightAbortRef.current?.abort();
    sunlightAbortRef.current = null;
    targetMeshRef.current = null;
    targetMaterialCloneRef.current?.dispose();
    targetMaterialCloneRef.current = null;
    sunlightResultRef.current = null;
    setHeatmapRange(null);
    const disposedMaterials = new Set<Material>();
    for (const mesh of ctx.buildingMeshes) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    }
    ctx.buildingMeshes = [];

    // Reset camera flag when selecting a new target address
    if (targetPandId && targetPandId !== lastFocusedPandId.current) {
      cameraSetRef.current = false;
      lastFocusedPandId.current = targetPandId;
    }

    const neighborMaterial = new MeshStandardMaterial({
      color: isDarkMode ? NEIGHBOR_COLOR_DARK : NEIGHBOR_COLOR_LIGHT,
      transparent: true,
      opacity: isDarkMode ? NEIGHBOR_OPACITY_DARK : NEIGHBOR_OPACITY_LIGHT,
      side: DoubleSide,
    });
    let neighborMaterialUsed = false;
    let neighborMaterialDisposed = false;
    const disposeNeighborMaterial = () => {
      if (!neighborMaterialDisposed) {
        neighborMaterial.dispose();
        neighborMaterialDisposed = true;
      }
    };
    const deferredNeighbors: BuildingBlock[] = [];

    for (const building of buildings) {
      const isTarget = building.pand_id === targetPandId;

      if (isTarget) {
        const geom = createBuildingGeometry(building);
        if (!geom) continue;
        const mat = new MeshStandardMaterial({
          color: TARGET_COLOR,
          emissive: TARGET_EMISSIVE,
          emissiveIntensity: isDarkMode ? 0.20 : 0.40,
          side: DoubleSide,
        });
        const mesh = new Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.pandId = building.pand_id;
        ctx.scene.add(mesh);
        ctx.buildingMeshes.push(mesh);
        targetMeshRef.current = mesh;
        targetMaterialCloneRef.current?.dispose();
        targetMaterialCloneRef.current = mat.clone();
        renderOnce();
        continue;
      }

      deferredNeighbors.push(building);
    }

    // Camera framing on first load
    if (!cameraSetRef.current && buildings.length > 0) {
      frameCamera();
      cameraSetRef.current = true;
    }

    sunlightComputed.current = false;
    snapshotsCaptured.current = false;
    allBuildingsReadyRef.current = false;

    let cancelled = false;
    let nextIndex = 0;

    const addNeighborChunk = () => {
      if (cancelled || !sceneRef.current) return;

      const chunkGeometries: BufferGeometry[] = [];
      const chunkStart = performance.now();

      while (nextIndex < deferredNeighbors.length && chunkGeometries.length < NEIGHBOR_CHUNK_SIZE) {
        const geom = createBuildingGeometry(deferredNeighbors[nextIndex]);
        nextIndex += 1;
        if (geom) chunkGeometries.push(geom);
        if (performance.now() - chunkStart >= NEIGHBOR_FRAME_BUDGET_MS) {
          break;
        }
      }

      if (chunkGeometries.length > 0) {
        const merged = mergeGeometries(chunkGeometries, false);
        if (merged) {
          for (const geom of chunkGeometries) {
            geom.dispose();
          }
          const mesh = new Mesh(merged, neighborMaterial);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.isContext = true;
          ctx.scene.add(mesh);
          ctx.buildingMeshes.push(mesh);
          neighborMaterialUsed = true;
          renderOnce();
        } else {
          for (const geom of chunkGeometries) {
            const mesh = new Mesh(geom, neighborMaterial);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.isContext = true;
            ctx.scene.add(mesh);
            ctx.buildingMeshes.push(mesh);
            neighborMaterialUsed = true;
          }
          renderOnce();
        }
      }

      if (nextIndex < deferredNeighbors.length) {
        neighborBuildFrameRef.current = requestAnimationFrame(addNeighborChunk);
      } else {
        neighborBuildFrameRef.current = null;
        if (!neighborMaterialUsed) {
          disposeNeighborMaterial();
        }
        allBuildingsReadyRef.current = true;
        captureSnapshots();
        void computeSunlight();
      }
    };

    if (deferredNeighbors.length > 0) {
      neighborBuildFrameRef.current = requestAnimationFrame(addNeighborChunk);
    } else {
      disposeNeighborMaterial();
      allBuildingsReadyRef.current = true;
      captureSnapshots();
      void computeSunlight();
    }

    return () => {
      cancelled = true;
      if (neighborBuildFrameRef.current != null) {
        cancelAnimationFrame(neighborBuildFrameRef.current);
        neighborBuildFrameRef.current = null;
      }
      if (!neighborMaterialUsed) {
        disposeNeighborMaterial();
      }
    };
  }, [buildings, targetPandId, frameCamera, renderOnce, captureSnapshots]);

  // Fix sun to summer noon — static lighting for context card
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const year = new Date().getFullYear();
    const summerNoon = createDateInTimeZone(year, 5, 21, 12, 0);
    const sunDir = getSunDirection(summerNoon, center.lat, center.lng);

    if (!sunDir) {
      ctx.sunLight.intensity = 0;
      renderOnce();
      return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
    ctx.sunLight.position.set(
      sunDir.x * SUN_DISTANCE,
      sunDir.y * SUN_DISTANCE,
      sunDir.z * SUN_DISTANCE,
    );
    ctx.sunLight.target.position.set(0, 0, 0);
    renderOnce();
  }, [center.lat, center.lng, renderOnce]);

  // Optional override driven by ShadowTimeSlider.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !sunDateTime) return;

    const sunDir = getSunDirection(sunDateTime, center.lat, center.lng);
    if (!sunDir) {
      ctx.sunLight.intensity = 0;
      renderOnce();
      return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
    ctx.sunLight.position.set(
      sunDir.x * SUN_DISTANCE,
      sunDir.y * SUN_DISTANCE,
      sunDir.z * SUN_DISTANCE,
    );
    ctx.sunLight.target.position.set(0, 0, 0);
    renderOnce();
  }, [sunDateTime, center.lat, center.lng, renderOnce]);

  // Load orthophoto imagery onto the ground plane. Prefer the backend WMS
  // proxy when a report id is available so viewer and export imagery match.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    let cancelled = false;
    const img = new Image();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const radius = Math.round(GROUND_SIZE / 2);
    const proxyBase = import.meta.env.VITE_API_BASE || '/api';
    const proxyParams = new URLSearchParams({
      type: 'luchtfoto',
      rd_x: String(center.rd_x),
      rd_y: String(center.rd_y),
      radius: String(radius),
      size: String(GROUND_BASEMAP_SIZE),
    });
    if (reportId) {
      proxyParams.set('report_id', reportId);
    }
    const directParams = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      LAYERS: 'Actueel_orthoHR',
      STYLES: '',
      CRS: 'EPSG:28992',
      BBOX: `${center.rd_x - radius},${center.rd_y - radius},${center.rd_x + radius},${center.rd_y + radius}`,
      WIDTH: String(GROUND_BASEMAP_SIZE),
      HEIGHT: String(GROUND_BASEMAP_SIZE),
      FORMAT: 'image/jpeg',
      TRANSPARENT: 'false',
    });
    const url = reportId
      ? `${proxyBase}/address/wms-tile?${proxyParams}`
      : `https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?${directParams}`;

    const groundMaterial = Array.isArray(ctx.ground.material) ? ctx.ground.material[0] : ctx.ground.material;
    if (!(groundMaterial instanceof MeshStandardMaterial)) {
      return;
    }

    if (groundTextureRef.current) {
      groundTextureRef.current.dispose();
      groundTextureRef.current = null;
    }
    groundMaterial.map = null;
    groundMaterial.color.setHex(isDark ? 0x8A97A5 : 0xffffff);
    groundMaterial.needsUpdate = true;

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !sceneRef.current) return;

      const texture = new Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      groundTextureRef.current = texture;

      groundMaterial.map = texture;
      groundMaterial.roughness = 0.95;
      groundMaterial.color.setHex(isDark ? 0xAAB6C2 : 0xffffff);
      groundMaterial.needsUpdate = true;
      renderOnce();
    };
    img.onerror = () => {
      if (cancelled) return;
      groundMaterial.map = null;
      groundMaterial.color.setHex(isDark ? GROUND_COLOR_DARK : GROUND_COLOR_LIGHT);
      groundMaterial.needsUpdate = true;
      if (import.meta.env.DEV) {
        console.warn(`[3D] Orthophoto basemap failed: ${url}`);
      }
    };
    img.src = url;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      img.src = '';
      if (groundTextureRef.current) {
        groundTextureRef.current.dispose();
        groundTextureRef.current = null;
      }
      groundMaterial.map = null;
      groundMaterial.color.setHex(isDark ? GROUND_COLOR_DARK : GROUND_COLOR_LIGHT);
      groundMaterial.needsUpdate = true;
    };
  }, [center.rd_x, center.rd_y, renderOnce, reportId]);

  // Sunlight analysis — async multipoint sampling with cooperative scheduling.
  const computeSunlight = useCallback(async () => {
    const ctx = sceneRef.current;
    const callback = onSunlightAnalysisRef.current;
    if (!ctx || !callback || buildings.length === 0 || !targetPandId) {
      console.warn('[sunlight] computeSunlight guard failed', {
        hasCtx: Boolean(ctx),
        hasCallback: Boolean(callback),
        buildingCount: buildings.length,
        hasTargetPandId: Boolean(targetPandId),
      });
      return;
    }
    if (!allBuildingsReadyRef.current) {
      console.warn('[sunlight] skipped — buildings not ready');
      return;
    }
    // Don't compute during Phase 1 (target-only, surrounding still loading)
    if (loadingRef.current) {
      console.warn('[sunlight] skipped — surrounding still loading');
      return;
    }

    const target = buildings.find((building) => building.pand_id === targetPandId);
    if (!target || target.footprint.length < 3) {
      console.warn('[sunlight] skipped — target not found or footprint too small', {
        hasTarget: Boolean(target),
        footprintLength: target?.footprint.length ?? 0,
      });
      return;
    }

    // Allow re-entry: abort previous computation, then mark as computing
    sunlightAbortRef.current?.abort();
    sunlightComputed.current = true;
    const abortController = new AbortController();
    sunlightAbortRef.current = abortController;
    const startedAt = performance.now();
    if (import.meta.env.DEV) {
      console.info('[3D] Sunlight analysis started', {
        targetPandId,
        buildingCount: buildings.length,
      });
    }

    try {
      const minGround = Math.min(...buildings.map((building) => building.ground_height));
      const roofY = (
        (target.ground_height - minGround)
        + target.building_height
        + ROOF_EVALUATION_OFFSET_METERS
      );
      const groundY = target.ground_height - minGround;
      const year = new Date().getFullYear();
      let result: SunlightResult | null = null;
      const weatherPromise = addressId && reportId
        ? fetchWeatherTmy(addressId, center.lat, center.lng, abortController.signal, reportId)
        : Promise.resolve(null);

      const facadePoints = generateFacadePoints(target.footprint, groundY, [1.5, 4.5]);
      const groundPoints = generateGroundProxyPoints(target.footprint, groundY, 5, 8);
      const extraEvalPointsLabeled = [
        ...facadePoints.map((entry) => ({
          point: entry.point,
          label: `facade:${entry.orientation}:${entry.heightLabel}`,
        })),
        ...groundPoints.map((point, index) => ({
          point,
          label: `ground:ring:${index}`,
        })),
      ];
      const extraEvalPoints = extraEvalPointsLabeled.length > 0
        ? {
          points: extraEvalPointsLabeled.map((entry) => entry.point),
          labels: extraEvalPointsLabeled.map((entry) => entry.label),
          skipSelfShadow: false,
        }
        : undefined;

      const analysisParams = {
        footprint: target.footprint,
        roofY,
        groundY,
        targetPandId,
        lat: center.lat,
        lng: center.lng,
        year,
        intervalMinutes: 30,
        chunkRaycasts: 200,
        extraEvalPoints,
        emitPerTimestep: true,
      };

      // Serialize once — buffers are NOT transferred (no zero-copy), so they
      // remain readable and can be reused for the SVF worker call below.
      const serialized = (USE_SUNLIGHT_WORKER && isWorkerSupported())
        ? serializeBuildings(ctx.buildingMeshes)
        : null;

      if (serialized) {
        try {
          result = await runSunlightInWorker({
            buildings: serialized,
            ...analysisParams,
            // Worker bridge defaults: 256 points at 1m grid spacing
            abortSignal: abortController.signal,
          });
        } catch (workerError) {
          console.warn('[sunlight] Worker failed, falling back to main thread', workerError);
        }
      }

      if (!result && !abortController.signal.aborted) {
        const { analyzeSunlight } = await import('../utils/sunlightAnalysis');
        result = await analyzeSunlight({
          buildingMeshes: ctx.buildingMeshes,
          ...analysisParams,
          // Main-thread fallback: lower density for UI responsiveness
          gridSpacingMeters: 2,
          maxPoints: 64,
          abortSignal: abortController.signal,
        });
      }

      if (!result || abortController.signal.aborted) {
        if (!result && !abortController.signal.aborted) {
          if (import.meta.env.DEV) {
            console.warn('[3D] Sunlight analysis returned no result', {
              elapsedMs: Math.round(performance.now() - startedAt),
            });
          }
          onSunlightErrorRef.current?.();
        }
        sunlightComputed.current = false;
        return;
      }

      const analysisMethod: SunlightResult['analysisMethod'] = result.analysisMethod ?? 'cpu-raycast-main';
      let nextResult: SunlightResult = result;
      const rendererWithReadback = ctx.renderer as unknown as {
        setRenderTarget?: (...args: unknown[]) => void;
        readRenderTargetPixels?: (...args: unknown[]) => void;
      };
      const canComputeSvf = (
        typeof rendererWithReadback.setRenderTarget === 'function'
        && typeof rendererWithReadback.readRenderTargetPixels === 'function'
      );
      let svf: number | undefined;

      if (
        isOffscreenCanvasSupported()
        && result.roofGridPoints
        && result.roofGridPoints.length > 0
      ) {
        // Reuse serialized data from sunlight pass, or serialize now for main-thread fallback path
        const svfBuildings = serialized ?? serializeBuildings(ctx.buildingMeshes);
        const svfSamplePointBudget = getSvfSamplePointBudget();
        try {
          svf = await runSvfInWorker(svfBuildings, result.roofGridPoints, svfSamplePointBudget);
        } catch (workerError) {
          if (import.meta.env.DEV) {
            console.warn('[3D] SVF Worker failed, falling back to main thread', workerError);
          }
        }
      }

      if (
        svf === undefined
        && canComputeSvf
        && result.roofGridPoints
        && result.roofGridPoints.length > 0
      ) {
        await waitForNextPaint(abortController.signal);
        if (abortController.signal.aborted) {
          sunlightComputed.current = false;
          return;
        }
        await waitForMainThreadIdle(abortController.signal, SVF_IDLE_TIMEOUT_MS);
        if (abortController.signal.aborted) {
          sunlightComputed.current = false;
          return;
        }

        const { computeSvfMultiPoint } = await import('../utils/svfComputation');
        const svfSamplePointBudget = getSvfSamplePointBudget();
        svf = computeSvfMultiPoint(
          ctx.renderer,
          ctx.buildingMeshes,
          result.roofGridPoints,
          svfSamplePointBudget,
        );
      }

      // Compute anisotropic SVF on main thread when renderer supports readback.
      // Uses summer solstice noon as deterministic reference — always daytime,
      // consistent across sessions, and representative of peak diffuse conditions.
      let svfAnisotropic: number | undefined;
      if (
        canComputeSvf
        && result.roofGridPoints
        && result.roofGridPoints.length > 0
        && svf !== undefined
      ) {
        const SunCalc = (await import('suncalc')).default;
        if (abortController.signal.aborted) {
          sunlightComputed.current = false;
          return;
        }
        const refDate = createDateInTimeZone(year, 5, 21, 12, 0); // June 21 noon
        const sunPos = SunCalc.getPosition(refDate, center.lat, center.lng);
        const sunAlt = Math.max(0, sunPos.altitude);
        const sunAz = sunCalcToNorthAzimuth(sunPos.azimuth);

        const { computeAnisotropicSvfMultiPoint } = await import('../utils/svfComputation');
        if (abortController.signal.aborted) {
          sunlightComputed.current = false;
          return;
        }
        const svfSamplePointBudget = getSvfSamplePointBudget();
        svfAnisotropic = computeAnisotropicSvfMultiPoint(
          ctx.renderer,
          ctx.buildingMeshes,
          result.roofGridPoints,
          sunAlt,
          sunAz,
          svfSamplePointBudget,
        );
      }

      if (svf !== undefined && Number.isFinite(svf)) {
        nextResult = {
          ...result,
          svf: round3(svf),
          ...(svfAnisotropic !== undefined && Number.isFinite(svfAnisotropic)
            ? { svfAnisotropic: round3(svfAnisotropic) }
            : {}),
          analysisMethod,
        };
      } else {
        nextResult = { ...result, analysisMethod };
      }

      if (abortController.signal.aborted) {
        sunlightComputed.current = false;
        return;
      }

      sunlightResultRef.current = nextResult;
      const range = applyTargetHeatmap(nextResult);
      setHeatmapRange(range);
      callback(nextResult);
      console.info('[sunlight] computation completed', {
        winterHours: nextResult.winter?.toFixed(1),
        buildingCount: buildings.length,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      if (import.meta.env.DEV) {
        console.info('[3D] Sunlight analysis completed', {
          method: nextResult.analysisMethod,
          winter: nextResult.winter,
          equinox: nextResult.equinox,
          summer: nextResult.summer,
          svf: nextResult.svf ?? null,
        });
      }
      renderOnce();

      const canEstimateIrradiance = (
        nextResult.svf != null
        && (result.perTimestepVisibility?.length ?? 0) > 0
        && (result.timestepMeta?.length ?? 0) > 0
      );

      if (canEstimateIrradiance) {
        void weatherPromise.then((weather) => {
          if (abortController.signal.aborted || !weather || weather.length === 0) {
            return;
          }

          const perTimestepVisibility = result?.perTimestepVisibility;
          const timestepMeta = result?.timestepMeta;
          const svfValue = nextResult.svf;
          if (
            !perTimestepVisibility
            || !timestepMeta
            || timestepMeta.length === 0
            || svfValue == null
          ) {
            return;
          }

          const sunDirections = timestepMeta.map((step) => {
            const sunDir = getSunDirection(new Date(step.date), center.lat, center.lng);
            if (!sunDir) return [0, 0, 0];
            return [sunDir.x, sunDir.y, sunDir.z];
          });

          const roofNormal = getRoofNormal(target);
          const irradiance = computeIrradiance({
            perTimestepVisibility,
            timestepMeta,
            sunDirections,
            surfaceNormal: roofNormal,
            svf: svfValue,
            weather,
            intervalMinutes: analysisParams.intervalMinutes,
          });

          if (abortController.signal.aborted) {
            return;
          }

          const enrichedResult: SunlightResult = {
            ...(sunlightResultRef.current ?? nextResult),
            irradianceKwhM2: round3(irradiance.totalKwhM2),
            irradianceDirectKwhM2: round3(irradiance.directKwhM2),
            irradianceDiffuseKwhM2: round3(irradiance.diffuseKwhM2),
          };

          sunlightResultRef.current = enrichedResult;
          callback(enrichedResult);
          renderOnce();
        }).catch(() => {
          // Graceful degradation: keep sunlight hours and SVF even if weather fetch fails.
        });
      }
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (isAbort) {
        console.info('[sunlight] analysis aborted', {
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      } else {
        console.error('[sunlight] analysis failed', {
          elapsedMs: Math.round(performance.now() - startedAt),
          error,
        });
      }
      if (!isAbort) {
        onSunlightErrorRef.current?.();
      }
      sunlightComputed.current = false;
    } finally {
      if (sunlightAbortRef.current === abortController) {
        sunlightAbortRef.current = null;
      }
    }
  }, [addressId, applyTargetHeatmap, buildings, center.lat, center.lng, renderOnce, reportId, targetPandId]);

  useEffect(() => {
    const result = sunlightResultRef.current;
    if (!result) {
      setHeatmapRange(null);
      resetTargetHeatmap();
      renderOnce();
      return;
    }
    const range = applyTargetHeatmap(result);
    setHeatmapRange(range);
    renderOnce();
  }, [applyTargetHeatmap, resetTargetHeatmap, renderOnce, showHeatmap]);

  // Fallback: capture snapshots when onShadowSnapshots callback arrives after buildings are ready
  useEffect(() => {
    if (onShadowSnapshots && allBuildingsReadyRef.current && !snapshotsCaptured.current) {
      captureSnapshots();
    }
  }, [onShadowSnapshots, captureSnapshots]);

  // Fallback: run sunlight analysis when callback arrives or loading finishes.
  useEffect(() => {
    if (onSunlightAnalysis && allBuildingsReadyRef.current && !sunlightComputed.current && !loadingRef.current) {
      void computeSunlight();
    }
  }, [onSunlightAnalysis, computeSunlight, loading]);

  useEffect(() => {
    if (sunlightRetryToken <= 0) return;
    sunlightResultRef.current = null;
    setHeatmapRange(null);
    resetTargetHeatmap();
    renderOnce();
    if (onSunlightAnalysis && allBuildingsReadyRef.current && !loading) {
      void computeSunlight();
    }
  }, [
    computeSunlight,
    loading,
    onSunlightAnalysis,
    renderOnce,
    resetTargetHeatmap,
    sunlightRetryToken,
  ]);

  return (
    <div className="viewer-3d" data-testid="viewer-3d">
      <h2 className="viewer-3d__title">{t('viewer3d.title')}</h2>
      <div
        className="viewer-3d__canvas"
        ref={containerRef}
        data-testid="viewer-3d-canvas"
        tabIndex={0}
        role="application"
        aria-label={t('viewer3d.canvasAria')}
        aria-describedby={sceneSummaryId}
        onKeyDown={handleKeyDown}
      >
        {loading ? (
          <div className="viewer-3d__skeleton" aria-label={t('viewer3d.loading')} aria-busy="true" />
        ) : (
          <button
            className="viewer-3d__reset-btn"
            onClick={() => frameCamera()}
            aria-label={t('viewer3d.resetView')}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4V1h3" />
              <path d="M15 12v3h-3" />
              <path d="M15 4V1h-3" />
              <path d="M1 12v3h3" />
              <rect x="4" y="4" width="8" height="8" rx="1" />
            </svg>
          </button>
        )}
        <HeatmapLegend
          visible={!loading && showHeatmap && !!heatmapRange}
          minHours={heatmapRange?.minHours ?? 0}
          maxHours={heatmapRange?.maxHours ?? 0}
        />
        {showControlsHint && !loading && (
          <div className="viewer-3d__controls-hint" aria-hidden="true">
            <span className="viewer-3d__controls-hint-text">
              {isTouchDevice
                ? t('viewer3d.controlsHint.touch')
                : t('viewer3d.controlsHint.desktop')}
            </span>
          </div>
        )}
        {error && !loading && (
          <div className="viewer-3d__error" role="status">
            <p className="viewer-3d__error-text">{error}</p>
            {onRetry && (
              <button
                type="button"
                className="app__retry-button viewer-3d__retry"
                onClick={onRetry}
              >
                {t('error.retry', 'Retry')}
              </button>
            )}
          </div>
        )}
      </div>
      <p id={sceneSummaryId} className="viewer-3d__summary">
        {staticSceneSummary} {t('viewer3d.keyboardHint')}
      </p>
      {statusMessage && !error && (
        <p className="viewer-3d__status-message">{statusMessage}</p>
      )}
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
