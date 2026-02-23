import { useEffect, useRef, useCallback, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BufferGeometry,
  CanvasTexture,
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
  Texture,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import HeatmapLegend from './HeatmapLegend';
import { sunHoursToColor } from '../utils/heatmapColors';
import { getSunDirection, SUN_DISTANCE } from '../utils/sunPosition';
import './NeighborhoodViewer3D.css';

/**
 * Theme-aware neighbor building appearance.
 * Contrast ratios (alpha-blended on ground, WCAG 1.4.11 graphical 3:1 min):
 *   Light: 0x556E85 @ 0.90 on #DDE3EA → blended #62798F → 3.49:1
 *   Dark:  0x8A9BB0 @ 0.65 on #1A2838 → blended #627286 → 3.04:1
 */
const NEIGHBOR_COLOR_LIGHT = 0x556E85;
const NEIGHBOR_COLOR_DARK = 0x8A9BB0;
const NEIGHBOR_OPACITY_LIGHT = 0.90;
const NEIGHBOR_OPACITY_DARK = 0.65;

// Convert lat/lng to Web Mercator tile coordinates and fractional position within tile
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const x = Math.floor(xFloat);
  const y = Math.floor(yFloat);

  // Fractional position within the tile (0-1)
  const fracX = xFloat - x;
  const fracY = yFloat - y;

  return { x, y, zoom, fracX, fracY };
}

interface Props {
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
}

interface HeatmapRange {
  minHours: number;
  maxHours: number;
}

// Canvas quality controls — feature-flagged for safe rollout.
const SHADOW_MAP_SIZE = Number(import.meta.env.VITE_VIEWER3D_SHADOW_SIZE) || 2048;
const DPR_CAP = Number(import.meta.env.VITE_VIEWER3D_DPR_CAP) || 2;
const TILE_GRID: '3x3' | '2x2' = import.meta.env.VITE_VIEWER3D_TILE_GRID === '2x2' ? '2x2' : '3x3';
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
const GROUND_COLOR_LIGHT = 0xDDE3EA;
const GROUND_COLOR_DARK = 0x1A2838;
const HEATMAP_ROOF_NORMAL_MIN_Y = 0.25;

function getCanvasDimensions(container: HTMLDivElement) {
  const width = Math.max(container.clientWidth, 1);
  const fallbackHeight = Math.min(width * VIEWER_FALLBACK_ASPECT, VIEWER_FALLBACK_MAX_HEIGHT);
  const height = Math.max(container.clientHeight || fallbackHeight, 1);
  return { width, height };
}

/**
 * Create a BufferGeometry from LoD 2.2 surfaces.
 * Each surface is a polygon of [dx, dy, z_nap] vertices (RD offsets + NAP height).
 * Converts to Three.js Y-up: [dx, z_nap - buildingGround, dy].
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
  buildings,
  targetPandId,
  center,
  sunDateTime,
  showHeatmap = true,
  onSunlightAnalysis,
  onSunlightError,
  sunlightRetryToken = 0,
  onShadowSnapshots,
  loading = false,
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
    buildingMeshes: Mesh[];
    ground: Mesh;
    animId: number;
    renderQueued: boolean;
  } | null>(null);

  const basemapMeshesRef = useRef<Mesh[]>([]);
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
  const allBuildingsReadyRef = useRef(false);
  const neighborBuildFrameRef = useRef<number | null>(null);
  const dampingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange | null>(null);
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

    for (let i = 0; i < positions.count; i++) {
      const normalY = normals ? normals.getY(i) : 1;
      if (normalY < HEATMAP_ROOF_NORMAL_MIN_Y) {
        colors.setXYZ(i, baseColor[0], baseColor[1], baseColor[2]);
        continue;
      }

      const vx = positions.getX(i);
      const vz = positions.getZ(i);

      let nearestIdx = -1;
      let nearestDistanceSq = Infinity;
      for (let j = 0; j < roofPoints.length; j++) {
        const point = roofPoints[j];
        const dx = point[0] - vx;
        // Roof points already use viewer Z (north is negative Z), so compare directly.
        const dz = point[2] - vz;
        const distanceSq = (dx * dx) + (dz * dz);
        if (distanceSq < nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          nearestIdx = j;
        }
      }

      if (nearestIdx < 0) {
        colors.setXYZ(i, baseColor[0], baseColor[1], baseColor[2]);
        continue;
      }

      const sampleHours = perPointAnnual[nearestIdx];
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
      isDarkMode ? 0.30 : 0.34,
    );
    scene.add(ambient);

    const sunLight = new DirectionalLight(0xffffff, isDarkMode ? 0.85 : 0.9);
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
      scene, camera, renderer, controls, sunLight,
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

  // Capture shadow snapshots — 3 static views at 9:00/12:00/17:00 on Dec 21
  // Extracted into a callback so it can be triggered from the chunk completion path
  const captureSnapshots = useCallback(() => {
    const ctx = sceneRef.current;
    const callback = onShadowSnapshotsRef.current;
    if (!ctx || !callback || snapshotsCaptured.current) return;
    if (!allBuildingsReadyRef.current) return;
    snapshotsCaptured.current = true;

    const savedCameraPos = ctx.camera.position.clone();
    const savedSunPos = ctx.sunLight.position.clone();
    const savedSunIntensity = ctx.sunLight.intensity;

    ctx.camera.position.set(0, 200, 0.1);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.updateProjectionMatrix();

    const year = new Date().getFullYear();
    const winterSolstice = new Date(year, 11, 21);
    const snapshotConfigs = [
      { hour: 9, label: 'morning' },
      { hour: 12, label: 'noon' },
      { hour: 17, label: 'evening' },
    ];

    const snapshots: ShadowSnapshot[] = [];

    for (const config of snapshotConfigs) {
      const date = new Date(winterSolstice);
      date.setHours(config.hour, 0, 0, 0);

      const sunDir = getSunDirection(date, center.lat, center.lng);

      if (sunDir) {
        ctx.sunLight.position.set(
          sunDir.x * SUN_DISTANCE,
          sunDir.y * SUN_DISTANCE,
          sunDir.z * SUN_DISTANCE,
        );
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
      } else {
        ctx.sunLight.intensity = 0;
      }

      ctx.renderer.render(ctx.scene, ctx.camera);
      const dataUrl = ctx.renderer.domElement.toDataURL('image/png');

      snapshots.push({ label: config.label, hour: config.hour, dataUrl });
    }

    // Restore camera and sun state
    ctx.camera.position.copy(savedCameraPos);
    ctx.camera.lookAt(0, 0, 0);
    ctx.camera.updateProjectionMatrix();
    ctx.sunLight.position.copy(savedSunPos);
    ctx.sunLight.intensity = savedSunIntensity;
    renderOnce();

    callback(snapshots);
  }, [center.lat, center.lng, renderOnce]);

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
          emissive: 0x57D4C8,
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
    const summerNoon = new Date(year, 5, 21, 12, 0, 0);
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

  // Load PDOK street map as a 3x3 grid of basemap tiles
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !center.lat || !center.lng) return;

    for (const mesh of basemapMeshesRef.current) {
      ctx.scene.remove(mesh);
      if ((mesh.material as MeshStandardMaterial).map) {
        (mesh.material as MeshStandardMaterial).map!.dispose();
      }
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    basemapMeshesRef.current = [];

    const zoom = 16;
    const centerTile = latLngToTile(center.lat, center.lng, zoom);

    const offsets = TILE_GRID === '2x2'
      ? [
        { dx: 0, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
      ]
      : [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
      ];

    const meshes: Mesh[] = [];
    basemapMeshesRef.current = meshes;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const equatorTileWidth = 40075016.686 / Math.pow(2, zoom);
    const tileWidthMeters = equatorTileWidth * Math.cos((center.lat * Math.PI) / 180);

    const centerOffsetX = (centerTile.fracX - 0.5) * tileWidthMeters;
    const centerOffsetY = (centerTile.fracY - 0.5) * tileWidthMeters;

    offsets.forEach(({ dx, dy }) => {
      const tileX = centerTile.x + dx;
      const tileY = centerTile.y + dy;

      const url = `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/${zoom}/${tileX}/${tileY}.png`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!sceneRef.current) return;

        let texture: Texture;
        if (isDark) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const c = canvas.getContext('2d')!;
          c.filter = 'invert(1) hue-rotate(180deg) brightness(1.8) contrast(1.5) saturate(1.2)';
          c.drawImage(img, 0, 0);
          texture = new CanvasTexture(canvas);
        } else {
          texture = new Texture(img);
          texture.needsUpdate = true;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;

        const tileGeom = new PlaneGeometry(tileWidthMeters, tileWidthMeters);
        const tileMat = new MeshStandardMaterial({
          map: texture,
          roughness: 0.95,
          side: DoubleSide,
        });
        const tileMesh = new Mesh(tileGeom, tileMat);
        tileMesh.rotation.x = -Math.PI / 2;

        const worldX = (dx * tileWidthMeters) - centerOffsetX;
        const worldZ = (dy * tileWidthMeters) - centerOffsetY;

        tileMesh.position.set(worldX, 0.01, worldZ);
        tileMesh.receiveShadow = true;

        sceneRef.current.scene.add(tileMesh);
        meshes.push(tileMesh);
        renderOnce();
      };
      img.onerror = () => {
        if (import.meta.env.DEV) {
          console.warn(`[3D] Basemap tile failed: ${url}`);
        }
      };
      img.src = url;
    });

    return () => {
      for (const mesh of basemapMeshesRef.current) {
        sceneRef.current?.scene.remove(mesh);
        if ((mesh.material as MeshStandardMaterial).map) {
          (mesh.material as MeshStandardMaterial).map!.dispose();
        }
        mesh.geometry.dispose();
        (mesh.material as Material).dispose();
      }
      basemapMeshesRef.current = [];
    };
  }, [center.lat, center.lng, renderOnce]);

  // Sunlight analysis — async multipoint sampling with cooperative scheduling.
  const computeSunlight = useCallback(async () => {
    const ctx = sceneRef.current;
    const callback = onSunlightAnalysisRef.current;
    if (!ctx || !callback || buildings.length === 0 || !targetPandId) return;
    if (!allBuildingsReadyRef.current || sunlightComputed.current) return;

    const target = buildings.find((building) => building.pand_id === targetPandId);
    if (!target || target.footprint.length < 3) return;

    sunlightComputed.current = true;
    sunlightAbortRef.current?.abort();
    const abortController = new AbortController();
    sunlightAbortRef.current = abortController;

    try {
      const minGround = Math.min(...buildings.map((building) => building.ground_height));
      const roofY = (target.ground_height - minGround) + target.building_height + 0.5;
      const year = new Date().getFullYear();
      const { analyzeSunlight } = await import('../utils/sunlightAnalysis');

      const result = await analyzeSunlight({
        buildingMeshes: ctx.buildingMeshes,
        targetPandId,
        footprint: target.footprint,
        roofY,
        lat: center.lat,
        lng: center.lng,
        year,
        intervalMinutes: 30,
        chunkRaycasts: 200,
        abortSignal: abortController.signal,
      });

      if (!result || abortController.signal.aborted) {
        if (!result && !abortController.signal.aborted) {
          onSunlightErrorRef.current?.();
        }
        sunlightComputed.current = false;
        return;
      }

      let nextResult: SunlightResult = result;
      const rendererWithReadback = ctx.renderer as unknown as {
        setRenderTarget?: (...args: unknown[]) => void;
        readRenderTargetPixels?: (...args: unknown[]) => void;
      };
      const canComputeSvf = (
        typeof rendererWithReadback.setRenderTarget === 'function'
        && typeof rendererWithReadback.readRenderTargetPixels === 'function'
      );

      if (canComputeSvf && result.roofGridPoints && result.roofGridPoints.length > 0) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        if (abortController.signal.aborted) {
          sunlightComputed.current = false;
          return;
        }

        const { computeSvfMultiPoint } = await import('../utils/svfComputation');
        const svf = computeSvfMultiPoint(
          ctx.renderer,
          ctx.buildingMeshes,
          result.roofGridPoints,
          5,
        );
        if (Number.isFinite(svf)) {
          nextResult = { ...result, svf: round3(svf) };
        }
      }

      if (abortController.signal.aborted) {
        sunlightComputed.current = false;
        return;
      }

      sunlightResultRef.current = nextResult;
      const range = applyTargetHeatmap(nextResult);
      setHeatmapRange(range);
      callback(nextResult);
      renderOnce();
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (!isAbort && import.meta.env.DEV) {
        console.warn('[3D] Sunlight analysis failed', error);
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
  }, [applyTargetHeatmap, buildings, center.lat, center.lng, renderOnce, targetPandId]);

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

  // Fallback: run sunlight analysis when callback arrives after buildings are ready.
  useEffect(() => {
    if (onSunlightAnalysis && allBuildingsReadyRef.current && !sunlightComputed.current) {
      void computeSunlight();
    }
  }, [onSunlightAnalysis, computeSunlight]);

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
        aria-label={t('viewer3d.canvasAria')}
        aria-describedby={sceneSummaryId}
      >
        {loading ? (
          <div className="viewer-3d__skeleton" aria-label={t('viewer3d.loading')} aria-busy="true" />
        ) : (
          <button
            className="viewer-3d__reset-btn"
            onClick={() => frameCamera()}
            aria-label={t('viewer3d.resetView')}
            title={t('viewer3d.resetView')}
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
      </div>
      <p id={sceneSummaryId} className="viewer-3d__summary">{staticSceneSummary}</p>
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
