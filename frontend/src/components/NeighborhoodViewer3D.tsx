import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import SunCalc from 'suncalc';
import gsap from 'gsap';
import ShadowControls from './ShadowControls';
import OverlayControls from './OverlayControls';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import type { OverlayTileType } from '../services/api';
import { getWmsTile } from '../services/api';
import './NeighborhoodViewer3D.css';

// Camera preset offsets (relative to target building center)
const CAMERA_PRESETS: Record<string, [number, number, number]> = {
  street: [25, 10, 25],
  balcony: [20, 20, 20],
  topDown: [0, 150, 0.1],
};

/** Uniform neighbor building color: slate.200 per palette.md */
const NEIGHBOR_COLOR = 0xB4C0CE;
const NEIGHBOR_OPACITY = 0.6;

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
}

function getDateFromPreset(preset: string): Date {
  const year = new Date().getFullYear();
  switch (preset) {
    case 'winter': return new Date(year, 11, 21);
    case 'spring': return new Date(year, 2, 20);
    case 'summer': return new Date(year, 5, 21);
    case 'autumn': return new Date(year, 8, 22);
    default: return new Date();
  }
}

const SHADOW_MAP_SIZE = 4096;
const SUN_DISTANCE = 300;
const GROUND_SIZE = 750;
const FRUSTUM = 300;
const TARGET_COLOR_LIGHT = 0x2EC4B6;
const TARGET_COLOR_DARK = 0x2EC4B6;

/**
 * Create a BufferGeometry from LoD 2.2 surfaces.
 * Each surface is a polygon of [dx, dy, z_nap] vertices (RD offsets + NAP height).
 * Converts to Three.js Y-up: [dx, z_nap - buildingGround, dy].
 * Uses fan triangulation from vertex 0 for each polygon.
 */
function createLod22Geometry(surfaces: number[][][], buildingGround: number): THREE.BufferGeometry {
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
    // Coordinate mapping is a rotation (det=1), so winding order is PRESERVED.
    // Use standard order: 0, i, i+1.
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
  const viewerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [activeOverlay, setActiveOverlay] = useState<OverlayTileType | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [, setLocalSunlight] = useState<SunlightResult | null>(null);
  const [lowPerformance, setLowPerformance] = useState(false);
  const lowPerformanceRef = useRef(false);
  const basemapMeshesRef = useRef<THREE.Mesh[]>([]);
  const overlayMeshRef = useRef<THREE.Mesh | null>(null);
  const overlayTextureRef = useRef<THREE.Texture | null>(null);
  const sunlightComputed = useRef(false);
  const snapshotsCaptured = useRef(false);

  // Camera tracking refs
  const cameraSetRef = useRef(false);
  const lastFocusedPandId = useRef<string | null>(null);
  const targetCenterRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Fullscreen toggle — set local state and attempt native fullscreen as side effect
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      const el = viewerRef.current;
      if (!el) return next;
      if (next && el.requestFullscreen) {
        el.requestFullscreen().catch(() => { });
      } else if (!next && document.exitFullscreen) {
        document.exitFullscreen().catch(() => { });
      }
      return next;
    });
  }, []);

  // Sync state when user exits fullscreen via Escape
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
      // Trigger resize so Three.js updates canvas dimensions
      const ctx = sceneRef.current;
      const container = containerRef.current;
      if (ctx && container) {
        const w = container.clientWidth;
        const h = document.fullscreenElement ? window.innerHeight : Math.min(w * 0.75, 400);
        ctx.camera.aspect = w / h;
        ctx.camera.updateProjectionMatrix();
        ctx.renderer.setSize(w, h);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = Math.min(width * 0.75, 400);

    // Detect dark mode from document attribute
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkMode ? 0x0D1620 : 0xF0F3F6);

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
    const ambient = new THREE.HemisphereLight(
      isDarkMode ? 0x6688aa : 0xb1e1ff,
      isDarkMode ? 0x443311 : 0xb97a20,
      isDarkMode ? 0.4 : 0.5,
    );
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

    // Ground plane — match scene background so edges are invisible
    const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isDarkMode ? 0x0D1620 : 0xF0F3F6,
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

    // FPS monitoring for adaptive quality
    let frameCount = 0;
    let lastFpsCheck = performance.now();
    const FPS_CHECK_INTERVAL = 3000;
    const FPS_THRESHOLD = 20;
    let lowFpsStreak = 0;

    // Animation loop
    const animate = () => {
      const id = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      sceneRef.current!.animId = id;

      // FPS tracking
      frameCount++;
      const now = performance.now();
      if (now - lastFpsCheck >= FPS_CHECK_INTERVAL) {
        const fps = (frameCount * 1000) / (now - lastFpsCheck);
        frameCount = 0;
        lastFpsCheck = now;
        if (fps < FPS_THRESHOLD) {
          lowFpsStreak++;
          // Require 2 consecutive low readings before degrading
          if (lowFpsStreak >= 2 && !lowPerformanceRef.current) {
            lowPerformanceRef.current = true;
            renderer.shadowMap.enabled = false;
            renderer.setPixelRatio(1);
            setLowPerformance(true);
          }
        } else {
          lowFpsStreak = 0;
        }
      }
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
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

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

    const neighborGeoms: THREE.BufferGeometry[] = [];

    for (const building of buildings) {
      let geom: THREE.BufferGeometry;
      const isTarget = building.pand_id === targetPandId;

      if (building.roof_surfaces && building.roof_surfaces.length > 0) {
        // LoD 2.2: real 3D surfaces from BuildingPart geometry
        geom = createLod22Geometry(building.roof_surfaces, building.ground_height);
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
        // Normalize LoD0 to world orientation so it can be merged.
        // Flatten to ground: base at y=0 (relative to flat basemap)
        const transform = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        transform.setPosition(0, 0, 0);
        geom.applyMatrix4(transform);
        // Strip uv attribute so LoD 0 can merge with LoD 2.2 (which has no uv)
        geom.deleteAttribute('uv');
      }

      if (isTarget) {
        const mat = new THREE.MeshStandardMaterial({
          color: isDarkMode ? TARGET_COLOR_DARK : TARGET_COLOR_LIGHT,
          emissive: 0x57D4C8,
          emissiveIntensity: 0.15,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.pandId = building.pand_id;
        ctx.scene.add(mesh);
        ctx.buildingMeshes.push(mesh);
        continue;
      }

      neighborGeoms.push(geom);
    }

    // Merge all neighbor geometries into a single draw call with uniform slate color
    const neighborMat = new THREE.MeshStandardMaterial({
      color: NEIGHBOR_COLOR,
      transparent: true,
      opacity: NEIGHBOR_OPACITY,
      side: THREE.DoubleSide,
    });

    if (neighborGeoms.length > 0) {
      const merged = mergeGeometries(neighborGeoms, false);
      if (merged) {
        for (const g of neighborGeoms) g.dispose();
        const mesh = new THREE.Mesh(merged, neighborMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isContext = true;
        ctx.scene.add(mesh);
        ctx.buildingMeshes.push(mesh);
      } else {
        for (const g of neighborGeoms) {
          const mesh = new THREE.Mesh(g, neighborMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.isContext = true;
          ctx.scene.add(mesh);
          ctx.buildingMeshes.push(mesh);
        }
      }
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

  // Load PDOK street map as a 3x3 grid of basemap tiles around the center
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !center.lat || !center.lng) return;

    // Clean up previous basemap meshes
    for (const mesh of basemapMeshesRef.current) {
      ctx.scene.remove(mesh);
      if ((mesh.material as THREE.MeshStandardMaterial).map) {
        (mesh.material as THREE.MeshStandardMaterial).map!.dispose();
      }
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    basemapMeshesRef.current = [];

    const zoom = 16;
    const centerTile = latLngToTile(center.lat, center.lng, zoom);

    // 3x3 grid offsets
    const offsets = [
      { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 0 }, { dx: 0, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
    ];

    const meshes: THREE.Mesh[] = [];
    // Store in ref immediately so cleanup works
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

        let texture: THREE.Texture;
        if (isDark) {
          // Apply invert + hue-rotate via offscreen canvas (same filter as Leaflet dark basemap)
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const c = canvas.getContext('2d')!;
          c.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)';
          c.drawImage(img, 0, 0);
          texture = new THREE.CanvasTexture(canvas);
        } else {
          texture = new THREE.Texture(img);
          texture.needsUpdate = true;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const tileGeom = new THREE.PlaneGeometry(tileWidthMeters, tileWidthMeters);
        const tileMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.95,
          side: THREE.DoubleSide,
        });
        const tileMesh = new THREE.Mesh(tileGeom, tileMat);
        tileMesh.rotation.x = -Math.PI / 2;

        // PDOK tile Y increases SOUTH (Google XYZ) -> Three.js +Z
        const worldX = (dx * tileWidthMeters) - centerOffsetX;
        const worldZ = (dy * tileWidthMeters) - centerOffsetY;

        tileMesh.position.set(worldX, 0.01, worldZ);
        tileMesh.receiveShadow = true;

        sceneRef.current.scene.add(tileMesh);
        meshes.push(tileMesh);
      };
      img.src = url;
    });

    return () => {
      for (const mesh of basemapMeshesRef.current) {
        sceneRef.current?.scene.remove(mesh);
        if ((mesh.material as THREE.MeshStandardMaterial).map) {
          (mesh.material as THREE.MeshStandardMaterial).map!.dispose();
        }
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      basemapMeshesRef.current = [];
    };
  }, [center.lat, center.lng]);

  // Camera preset handler — smooth GSAP tween to target position
  const setCameraPreset = useCallback((preset: string) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const offset = CAMERA_PRESETS[preset];
    if (!offset) return;
    const tc = targetCenterRef.current;

    gsap.to(ctx.camera.position, {
      x: tc.x + offset[0],
      y: tc.y + offset[1],
      z: tc.z + offset[2],
      duration: 0.3,
      ease: 'power2.inOut',
      onUpdate: () => {
        ctx.camera.lookAt(tc.x, tc.y, tc.z);
        ctx.controls.target.set(tc.x, tc.y, tc.z);
      },
    });
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

    const result: SunlightResult = {
      winter: monthlyHours[WINTER_IDX],
      equinox: monthlyHours[EQUINOX_IDX],
      summer: monthlyHours[SUMMER_IDX],
      annualAverage,
      analysisYear: year,
    };
    setLocalSunlight(result);
    onSunlightAnalysis(result);
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

  // Clean up overlay mesh helper
  const disposeOverlay = useCallback(() => {
    const ctx = sceneRef.current;
    if (overlayMeshRef.current) {
      ctx?.scene.remove(overlayMeshRef.current);
      overlayMeshRef.current.geometry.dispose();
      (overlayMeshRef.current.material as THREE.Material).dispose();
      overlayMeshRef.current = null;
    }
    if (overlayTextureRef.current) {
      overlayTextureRef.current.dispose();
      overlayTextureRef.current = null;
    }
  }, []);

  // Clear overlay on address change
  useEffect(() => {
    return () => {
      disposeOverlay();
      setActiveOverlay(null);
    };
  }, [buildings, disposeOverlay]);

  // Handle overlay toggle
  const handleOverlayChange = useCallback((type: OverlayTileType | null) => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    // Remove old overlay
    disposeOverlay();

    if (type === null) {
      setActiveOverlay(null);
      return;
    }

    setActiveOverlay(type);
    setOverlayLoading(true);

    void (async () => {
      try {
        const blob = await getWmsTile(type, center.rd_x, center.rd_y);
        const url = URL.createObjectURL(blob);

        const texture = new THREE.TextureLoader().load(url, () => {
          URL.revokeObjectURL(url);
        });
        overlayTextureRef.current = texture;

        const planeGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
        const planeMat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(planeGeom, planeMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.2; // Just above ground plane
        overlayMeshRef.current = mesh;
        ctx.scene.add(mesh);
      } catch {
        setActiveOverlay(null);
      } finally {
        setOverlayLoading(false);
      }
    })();
  }, [center.rd_x, center.rd_y, disposeOverlay]);

  // Update overlay opacity in real time
  useEffect(() => {
    if (overlayMeshRef.current) {
      (overlayMeshRef.current.material as THREE.MeshBasicMaterial).opacity = overlayOpacity / 100;
    }
  }, [overlayOpacity]);

  return (
    <div className={`viewer-3d${isFullscreen ? ' viewer-3d--fullscreen' : ''}`} ref={viewerRef}>
      <h2 className="viewer-3d__title">{t('viewer3d.title')}</h2>
      <div className="viewer-3d__canvas" ref={containerRef} data-testid="viewer-3d-canvas">
        <button
          className="viewer-3d__fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label={t(isFullscreen ? 'viewer3d.exitFullscreen' : 'viewer3d.fullscreen')}
          title={t(isFullscreen ? 'viewer3d.exitFullscreen' : 'viewer3d.fullscreen')}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {isFullscreen ? (
              <path d="M4 12L12 4M4 4l8 8" />
            ) : (
              <>
                <polyline points="1,5 1,1 5,1" />
                <polyline points="11,1 15,1 15,5" />
                <polyline points="15,11 15,15 11,15" />
                <polyline points="5,15 1,15 1,11" />
              </>
            )}
          </svg>
        </button>
        <div className="viewer-3d__camera-cluster">
          {(['street', 'balcony', 'topDown'] as const).map((preset) => (
            <button
              key={preset}
              className="viewer-3d__camera-btn"
              onClick={() => setCameraPreset(preset)}
              aria-label={t(`viewer3d.camera.${preset}`)}
              title={t(`viewer3d.camera.${preset}`)}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {preset === 'street' ? (
                  /* Eye icon — street-level view */
                  <>
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5" />
                    <circle cx="8" cy="8" r="2" />
                  </>
                ) : preset === 'balcony' ? (
                  /* Building icon — balcony view */
                  <>
                    <rect x="3" y="2" width="10" height="12" rx="1" />
                    <line x1="6" y1="5" x2="6" y2="7" />
                    <line x1="10" y1="5" x2="10" y2="7" />
                    <line x1="6" y1="9" x2="6" y2="11" />
                    <line x1="10" y1="9" x2="10" y2="11" />
                  </>
                ) : (
                  /* Arrow-down icon — top-down view */
                  <>
                    <line x1="8" y1="2" x2="8" y2="13" />
                    <polyline points="4,9 8,13 12,9" />
                  </>
                )}
              </svg>
            </button>
          ))}
        </div>
        <div className="viewer-3d__sunlight-badge" data-testid="time-badge">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="8" cy="8" r="3" />
            <line x1="8" y1="1" x2="8" y2="3" /><line x1="8" y1="13" x2="8" y2="15" />
            <line x1="1" y1="8" x2="3" y2="8" /><line x1="13" y1="8" x2="15" y2="8" />
            <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" /><line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
            <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" /><line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
          </svg>
          {` ${hour.toString().padStart(2, '0')}:00`}
        </div>
        {lowPerformance && (
          <div className="viewer-3d__perf-banner" data-testid="performance-banner">
            {t('viewer3d.simplifiedView')}
          </div>
        )}
      </div>
      <ShadowControls
        hour={hour}
        datePreset={datePreset}
        onHourChange={setHour}
        onDatePresetChange={setDatePreset}
      />
      <OverlayControls
        activeOverlay={activeOverlay}
        onOverlayChange={handleOverlayChange}
        loading={overlayLoading}
        opacity={overlayOpacity}
        onOpacityChange={setOverlayOpacity}
      />
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
