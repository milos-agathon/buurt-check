import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import SunCalc from 'suncalc';
import ShadowControls from './ShadowControls';
import OverlayControls from './OverlayControls';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import './NeighborhoodViewer3D.css';

// Camera preset offsets (relative to target building center)
const CAMERA_PRESETS: Record<string, [number, number, number]> = {
  street: [25, 10, 25],
  balcony: [20, 20, 20],
  topDown: [0, 150, 0.1],
};

/**
 * Map construction year to period-appropriate facade color.
 * These match the PRD Section 9.4 period table.
 */
export function getYearColor(year?: number): number {
  if (year == null) return 0xe0e0e0;     // Unknown: light gray
  if (year < 1900) return 0xa0522d;      // Pre-1900: sienna (traditional brick)
  if (year < 1945) return 0xcc7722;      // 1900-1945: warm orange-brown (Amsterdam School)
  if (year < 1975) return 0xc8b87d;      // 1945-1975: sandy yellow (post-war reconstruction)
  if (year < 2000) return 0x9e9e9e;      // 1975-2000: neutral gray (prefab era)
  return 0xb0bec5;                       // 2000+: blue-gray (contemporary)
}

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
  center: { lat: number; lng: number };
  onSunlightAnalysis?: (result: SunlightResult) => void;
  onShadowSnapshots?: (snapshots: ShadowSnapshot[]) => void;
}

function getDateFromPreset(preset: string): Date {
  const year = new Date().getFullYear();
  switch (preset) {
    case 'winter': return new Date(year, 11, 21);
    case 'summer': return new Date(year, 5, 21);
    case 'equinox': return new Date(year, 2, 20);
    default: return new Date();
  }
}

const SHADOW_MAP_SIZE = 2048;
const SUN_DISTANCE = 300;
const GROUND_SIZE = 500;
const FRUSTUM = 200;
const TARGET_COLOR = 0x2563eb;

/**
 * Create a BufferGeometry from LoD 2.2 surfaces.
 * Each surface is a polygon of [dx, dy, z_nap] vertices (RD offsets + NAP height).
 * Converts to Three.js Y-up: [dx, z_nap - minGround, dy].
 * Uses fan triangulation from vertex 0 for each polygon.
 */
function createLod22Geometry(surfaces: number[][][], minGround: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const surface of surfaces) {
    if (surface.length < 3) continue;
    const baseIndex = positions.length / 3;

    for (const vert of surface) {
      // [dx, dy, z_nap] -> Three.js [dx, z_nap - minGround, dy]
      positions.push(vert[0], vert[2] - minGround, vert[1]);
    }

    // Fan triangulation: vertex 0 connects to each consecutive pair
    for (let i = 1; i < surface.length - 1; i++) {
      indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export default function NeighborhoodViewer3D({ buildings, targetPandId, center, onSunlightAnalysis, onShadowSnapshots }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    sunLight: THREE.DirectionalLight;
    buildingMeshes: THREE.Mesh[];
    ground: THREE.Mesh;
    animId: number;
  } | null>(null);

  const [hour, setHour] = useState(12);
  const [datePreset, setDatePreset] = useState('summer'); // Default to summer for reliable sun position
  const sunlightComputed = useRef(false);
  const snapshotsCaptured = useRef(false);

  // Camera tracking refs
  const cameraSetRef = useRef(false);
  const lastFocusedPandId = useRef<string | null>(null);
  const targetCenterRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = Math.min(width * 0.75, 400);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
    camera.position.set(100, 120, 100);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.5);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

    // Ground plane (neutral color, will be replaced by aerial imagery)
    const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d4,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1;

    // Animation loop
    const animate = () => {
      const id = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      sceneRef.current!.animId = id;
    };

    sceneRef.current = {
      scene, camera, renderer, controls, sunLight,
      buildingMeshes: [], ground, animId: 0,
    };

    animate();

    // Resize handler
    const onResize = () => {
      const w = container.clientWidth;
      const h = Math.min(w * 0.75, 400);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(sceneRef.current?.animId ?? 0);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  // Add buildings to scene
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || buildings.length === 0) return;

    // Remove old buildings
    for (const mesh of ctx.buildingMeshes) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    ctx.buildingMeshes = [];

    // Reset camera flag when selecting a new target address
    if (targetPandId && targetPandId !== lastFocusedPandId.current) {
      cameraSetRef.current = false;
      lastFocusedPandId.current = targetPandId;
    }

    // Render ALL buildings from the neighborhood
    const minGround = Math.min(...buildings.map((b) => b.ground_height));

    for (const building of buildings) {
      let geom: THREE.BufferGeometry;
      let useLod22 = false;
      const isTarget = building.pand_id === targetPandId;

      if (building.roof_surfaces && building.roof_surfaces.length > 0) {
        // LoD 2.2: real 3D surfaces from BuildingPart geometry
        geom = createLod22Geometry(building.roof_surfaces, minGround);
        useLod22 = true;
      } else {
        // LoD 0 fallback: extrude 2D footprint
        const shape = new THREE.Shape();
        const fp = building.footprint;
        if (fp.length < 3) continue;

        shape.moveTo(fp[0][0], fp[0][1]);
        for (let i = 1; i < fp.length; i++) {
          shape.lineTo(fp[i][0], fp[i][1]);
        }
        shape.closePath();

        geom = new THREE.ExtrudeGeometry(shape, {
          depth: building.building_height,
          bevelEnabled: false,
        });
      }

      const color = isTarget ? TARGET_COLOR : getYearColor(building.year);
      const mat = new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide, // 3DBAG winding order not guaranteed
      });

      const mesh = new THREE.Mesh(geom, mat);

      if (useLod22) {
        // LoD 2.2: heights baked into vertex data, no rotation needed
        mesh.position.y = 0;
      } else {
        // LoD 0: rotate extrusion Y-up, offset by ground height
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = building.ground_height - minGround;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.pandId = building.pand_id;

      ctx.scene.add(mesh);
      ctx.buildingMeshes.push(mesh);
    }

    // Camera framing: encompass all buildings, prefer target center
    if (!cameraSetRef.current && buildings.length > 0) {
      // Compute bounding box across all building footprints
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

      // Prefer target building center for camera target, fallback to centroid of all
      const targetBuilding = targetPandId ? buildings.find((b) => b.pand_id === targetPandId) : null;
      const focusBuilding = targetBuilding || buildings[0];
      const fp = focusBuilding.footprint;
      const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
      const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
      const targetY = focusBuilding.ground_height - minGround + focusBuilding.building_height / 2;

      targetCenterRef.current.set(cx, targetY, cy);

      // Wider framing for neighborhood context
      const distance = Math.max(maxSpan * 1.5, 30);
      const cameraHeight = Math.max(tallestHeight * 1.2, 15);

      ctx.camera.position.set(cx + distance, cameraHeight, cy + distance);
      ctx.camera.lookAt(cx, targetY, cy);
      ctx.controls.target.set(cx, targetY, cy);
      ctx.camera.updateProjectionMatrix();

      cameraSetRef.current = true;
    }

    sunlightComputed.current = false;
    snapshotsCaptured.current = false;
  }, [buildings, targetPandId]);

  // Update sun position
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const date = getDateFromPreset(datePreset);
    date.setHours(hour, 0, 0, 0);

    const sunPos = SunCalc.getPosition(date, center.lat, center.lng);

    if (sunPos.altitude <= 0) {
      ctx.sunLight.intensity = 0;
      return;
    }

    ctx.sunLight.intensity = 0.8;
    const az = sunPos.azimuth; // 0 = south, positive = west
    const alt = sunPos.altitude;

    // SunCalc: azimuth 0 = south, clockwise positive
    // Three.js: -Z = north, +X = east
    // South direction in Three.js is +Z
    const x = -Math.sin(az) * Math.cos(alt) * SUN_DISTANCE;
    const y = Math.sin(alt) * SUN_DISTANCE;
    const z = Math.cos(az) * Math.cos(alt) * SUN_DISTANCE;

    ctx.sunLight.position.set(x, y, z);
    ctx.sunLight.target.position.set(0, 0, 0);
  }, [hour, datePreset, center.lat, center.lng]);

  // Load PDOK street map as ground texture, aligned to building coordinates
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !center.lat || !center.lng) return;

    const zoom = 18;
    const tile = latLngToTile(center.lat, center.lng, zoom);
    const tileUrl = `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/${zoom}/${tile.x}/${tile.y}.png`;

    // Calculate tile size in meters at this latitude
    // Earth circumference at equator = 40075016.686 meters
    // At zoom 18, there are 2^18 = 262144 tiles around the world
    // Tile width at equator = 40075016.686 / 262144 ≈ 152.87 meters
    // At latitude φ, width = equatorWidth * cos(φ)
    const equatorTileWidth = 40075016.686 / Math.pow(2, zoom);
    const tileWidthMeters = equatorTileWidth * Math.cos((center.lat * Math.PI) / 180);

    // Scale ground plane to match tile size (GROUND_SIZE is 500m, tile is ~150m)
    const scaleFactor = tileWidthMeters / GROUND_SIZE;
    ctx.ground.scale.set(scaleFactor, scaleFactor, 1);

    // Calculate offset from tile center to query point
    // fracX/fracY are 0-1 within tile, center is at 0.5
    // WMTS tile Y increases going SOUTH
    const offsetX = (tile.fracX - 0.5) * tileWidthMeters;
    const offsetY = (tile.fracY - 0.5) * tileWidthMeters; // positive = south of tile center

    // Move ground plane so the query point aligns with scene origin (0,0,0)
    // In Three.js: +X is east, +Z is south (Y is up)
    // Building footprints: +X is east (RD), +Y is north (RD) → maps to +X, -Z in scene
    // So we need: ground X offset = -offsetX (move tile east if query is west of center)
    //             ground Z offset = -offsetY (move tile north if query is south of center)
    ctx.ground.position.set(-offsetX, 0, -offsetY);

    const loader = new THREE.TextureLoader();
    loader.load(
      tileUrl,
      (texture) => {
        if (!ctx.ground) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = ctx.ground.material as THREE.MeshStandardMaterial;
        material.map = texture;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => {
        // Silently fail — ground stays neutral gray
      },
    );
  }, [center.lat, center.lng]);

  // Camera preset handler — positions relative to target building center
  const setCameraPreset = useCallback((preset: string) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const offset = CAMERA_PRESETS[preset];
    if (!offset) return;
    const tc = targetCenterRef.current;
    ctx.camera.position.set(tc.x + offset[0], tc.y + offset[1], tc.z + offset[2]);
    ctx.camera.lookAt(tc.x, tc.y, tc.z);
    ctx.controls.target.set(tc.x, tc.y, tc.z);
    ctx.camera.updateProjectionMatrix();
  }, []);

  // Sunlight analysis (F2c) — compute once when buildings are ready
  const computeSunlight = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx || !onSunlightAnalysis || buildings.length === 0 || !targetPandId) return;
    if (sunlightComputed.current) return;
    sunlightComputed.current = true;

    // Find target building center
    const target = buildings.find((b) => b.pand_id === targetPandId);
    if (!target) return;

    const fp = target.footprint;
    const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
    const cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    const minGround = Math.min(...buildings.map((b) => b.ground_height));
    const targetTop = target.ground_height - minGround + target.building_height;
    const roofCenter = new THREE.Vector3(cx, targetTop + 0.5, cy);

    const raycaster = new THREE.Raycaster();
    const year = new Date().getFullYear();
    // 12-month sampling: 21st of each month (Jan=0 .. Dec=11)
    const monthlyDates = Array.from({ length: 12 }, (_, i) => new Date(year, i, 21));
    const WINTER_IDX = 11; // Dec
    const EQUINOX_IDX = 2; // Mar
    const SUMMER_IDX = 5;  // Jun

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
        const sunDir = new THREE.Vector3(
          -Math.sin(az) * Math.cos(alt),
          Math.sin(alt),
          Math.cos(az) * Math.cos(alt),
        ).normalize();

        raycaster.set(roofCenter, sunDir);
        raycaster.far = SUN_DISTANCE * 2;

        // Check for obstructions (other buildings only)
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
      // Small delay to ensure meshes are added to scene
      const timer = setTimeout(computeSunlight, 100);
      return () => clearTimeout(timer);
    }
  }, [buildings, targetPandId, computeSunlight]);

  // Capture shadow snapshots (F2b) — 3 static views at 9:00/12:00/17:00 on Dec 21
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !onShadowSnapshots || buildings.length === 0 || snapshotsCaptured.current) return;
    snapshotsCaptured.current = true;

    const savedCameraPos = ctx.camera.position.clone();
    const savedSunPos = ctx.sunLight.position.clone();
    const savedSunIntensity = ctx.sunLight.intensity;

    // Top-down view for consistent snapshots
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
        ctx.sunLight.intensity = 0.8;
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

    onShadowSnapshots(snapshots);
  }, [buildings, onShadowSnapshots, center.lat, center.lng]);

  return (
    <div className="viewer-3d">
      <h2 className="viewer-3d__title">{t('viewer3d.title')}</h2>
      <div className="viewer-3d__canvas" ref={containerRef} data-testid="viewer-3d-canvas" />
      <ShadowControls
        hour={hour}
        datePreset={datePreset}
        onHourChange={setHour}
        onDatePresetChange={setDatePreset}
        onCameraPreset={setCameraPreset}
      />
      <OverlayControls />
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
