import { useEffect, useRef, useCallback } from 'react';
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
  Raycaster,
  SRGBColorSpace,
  Scene,
  Shape,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import SunCalc from 'suncalc';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import './NeighborhoodViewer3D.css';

/** Theme-aware neighbor building appearance */
const NEIGHBOR_COLOR_LIGHT = 0xB4C0CE;
const NEIGHBOR_COLOR_DARK = 0x8A9BB0;
const NEIGHBOR_OPACITY_LIGHT = 0.70;
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
  onSunlightAnalysis?: (result: SunlightResult) => void;
  onShadowSnapshots?: (snapshots: ShadowSnapshot[]) => void;
  loading?: boolean;
}

// Canvas quality controls — feature-flagged for safe rollout.
const SHADOW_MAP_SIZE = Number(import.meta.env.VITE_VIEWER3D_SHADOW_SIZE) || 2048;
const DPR_CAP = Number(import.meta.env.VITE_VIEWER3D_DPR_CAP) || 2;
const TILE_GRID: '3x3' | '2x2' = import.meta.env.VITE_VIEWER3D_TILE_GRID === '2x2' ? '2x2' : '3x3';
const SUN_DISTANCE = 300;
const GROUND_SIZE = 750;
const FRUSTUM = 300;
const TARGET_COLOR = 0x2EC4B6;
const NEIGHBOR_CHUNK_SIZE = 40;
const NEIGHBOR_FRAME_BUDGET_MS = 10;

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

export default function NeighborhoodViewer3D({
  buildings,
  targetPandId,
  center,
  onSunlightAnalysis,
  onShadowSnapshots,
  loading = false,
}: Props) {
  const { t } = useTranslation();
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
  const sunlightComputed = useRef(false);
  const snapshotsCaptured = useRef(false);
  const onShadowSnapshotsRef = useRef(onShadowSnapshots);
  onShadowSnapshotsRef.current = onShadowSnapshots;
  const allBuildingsReadyRef = useRef(false);
  const neighborBuildFrameRef = useRef<number | null>(null);
  const dampingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const maxSpan = Math.max(allMaxX - allMinX, allMaxY - allMinY);

    const targetBuilding = targetPandId ? buildings.find((b) => b.pand_id === targetPandId) : null;
    const focusBuilding = targetBuilding || buildings[0];
    const fp = focusBuilding.footprint;
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
    const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const targetY = focusBuilding.ground_height - minGround + focusBuilding.building_height / 2;

    const distance = Math.max(maxSpan * 1.5, 30);
    const cameraHeight = Math.max(tallestHeight * 1.2, 15);

    ctx.camera.position.set(cx + distance, cameraHeight, cy + distance);
    ctx.camera.lookAt(cx, targetY, cy);
    ctx.controls.target.set(cx, targetY, cy);
    ctx.camera.updateProjectionMatrix();
    renderOnce();
  }, [buildings, targetPandId, renderOnce]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = Math.min(width * 0.75, 400);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Scene
    const scene = new Scene();
    scene.background = new Color(isDarkMode ? 0x0D1620 : 0xF0F3F6);

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
      isDarkMode ? 0x6688aa : 0xb1e1ff,
      isDarkMode ? 0x443311 : 0xb97a20,
      isDarkMode ? 0.30 : 0.35,
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
      color: isDarkMode ? 0x1A2838 : 0xDDE3EA,
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
    controls.maxPolarAngle = Math.PI / 2.1;

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
      const w = container.clientWidth;
      const h = Math.min(w * 0.75, 400);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderOnce();
    };
    window.addEventListener('resize', onResize);

    return () => {
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

      const sunPos = SunCalc.getPosition(date, center.lat, center.lng);

      if (sunPos.altitude > 0) {
        const az = sunPos.azimuth;
        const alt = sunPos.altitude;
        const x = -Math.sin(az) * Math.cos(alt) * SUN_DISTANCE;
        const y = Math.sin(alt) * SUN_DISTANCE;
        const z = Math.cos(az) * Math.cos(alt) * SUN_DISTANCE;
        ctx.sunLight.position.set(x, y, z);
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
          color: isDarkMode ? TARGET_COLOR : TARGET_COLOR,
          emissive: 0x57D4C8,
          emissiveIntensity: 0.15,
          side: DoubleSide,
        });
        const mesh = new Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.pandId = building.pand_id;
        ctx.scene.add(mesh);
        ctx.buildingMeshes.push(mesh);
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
      }
    };

    if (deferredNeighbors.length > 0) {
      neighborBuildFrameRef.current = requestAnimationFrame(addNeighborChunk);
    } else {
      disposeNeighborMaterial();
      allBuildingsReadyRef.current = true;
      captureSnapshots();
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
    const sunPos = SunCalc.getPosition(summerNoon, center.lat, center.lng);

    if (sunPos.altitude <= 0) {
      ctx.sunLight.intensity = 0;
      renderOnce();
      return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
    const az = sunPos.azimuth;
    const alt = sunPos.altitude;

    const x = -Math.sin(az) * Math.cos(alt) * SUN_DISTANCE;
    const y = Math.sin(alt) * SUN_DISTANCE;
    const z = Math.cos(az) * Math.cos(alt) * SUN_DISTANCE;

    ctx.sunLight.position.set(x, y, z);
    ctx.sunLight.target.position.set(0, 0, 0);
    renderOnce();
  }, [center.lat, center.lng, renderOnce]);

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

  // Sunlight analysis — compute once when buildings are ready
  const computeSunlight = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx || !onSunlightAnalysis || buildings.length === 0 || !targetPandId) return;
    if (sunlightComputed.current) return;
    sunlightComputed.current = true;

    const target = buildings.find((b) => b.pand_id === targetPandId);
    if (!target) return;

    const fp = target.footprint;
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
    const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const minGround = Math.min(...buildings.map((b) => b.ground_height));
    const targetTop = target.ground_height - minGround + target.building_height;
    const roofCenter = new Vector3(cx, targetTop + 0.5, cy);

    const raycaster = new Raycaster();
    const year = new Date().getFullYear();
    const monthlyDates = Array.from({ length: 12 }, (_, i) => new Date(year, i, 21));
    const WINTER_IDX = 11;
    const EQUINOX_IDX = 2;
    const SUMMER_IDX = 5;

    const monthlyHours: number[] = [];

    for (const date of monthlyDates) {
      const times = SunCalc.getTimes(date, center.lat, center.lng);
      const sunrise = times.sunrise.getHours();
      const sunset = times.sunset.getHours();
      let sunlitHours = 0;

      for (let h = sunrise; h <= sunset; h++) {
        const d = new Date(date);
        d.setHours(h, 30, 0, 0);
        const sunPos = SunCalc.getPosition(d, center.lat, center.lng);
        if (sunPos.altitude <= 0) continue;

        const az = sunPos.azimuth;
        const alt = sunPos.altitude;
        const sunDir = new Vector3(
          -Math.sin(az) * Math.cos(alt),
          Math.sin(alt),
          Math.cos(az) * Math.cos(alt),
        ).normalize();

        raycaster.set(roofCenter, sunDir);
        raycaster.far = SUN_DISTANCE * 2;

        const intersections = raycaster.intersectObjects(ctx.buildingMeshes);
        const blocked = intersections.some(
          (hit) => hit.object.userData.pandId !== targetPandId && !hit.object.userData.isGround,
        );

        if (!blocked) {
          sunlitHours++;
        }
      }
      monthlyHours.push(sunlitHours);
    }

    const annualAverage = Math.round((monthlyHours.reduce((s, h) => s + h, 0) / 12) * 10) / 10;

    onSunlightAnalysis({
      winter: monthlyHours[WINTER_IDX],
      equinox: monthlyHours[EQUINOX_IDX],
      summer: monthlyHours[SUMMER_IDX],
      annualAverage,
      analysisYear: year,
    });
  }, [buildings, targetPandId, center.lat, center.lng, onSunlightAnalysis]);

  // Trigger sunlight analysis after buildings render
  useEffect(() => {
    if (buildings.length > 0 && targetPandId) {
      const timer = setTimeout(computeSunlight, 100);
      return () => clearTimeout(timer);
    }
  }, [buildings, targetPandId, computeSunlight]);

  // Fallback: capture snapshots when onShadowSnapshots callback arrives after buildings are ready
  useEffect(() => {
    if (onShadowSnapshots && allBuildingsReadyRef.current && !snapshotsCaptured.current) {
      captureSnapshots();
    }
  }, [onShadowSnapshots, captureSnapshots]);

  return (
    <div className="viewer-3d">
      <h2 className="viewer-3d__title">{t('viewer3d.title')}</h2>
      <div className="viewer-3d__canvas" ref={containerRef} data-testid="viewer-3d-canvas">
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
      </div>
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
