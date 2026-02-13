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

const SHADOW_MAP_SIZE = 2048;
const SUN_DISTANCE = 300;
const GROUND_SIZE = 750;
const FRUSTUM = 300;
const TARGET_COLOR = 0x2EC4B6;

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

export default function NeighborhoodViewer3D({ buildings, targetPandId, center, onSunlightAnalysis, onShadowSnapshots }: Props) {
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
  } | null>(null);

  const basemapMeshesRef = useRef<Mesh[]>([]);
  const sunlightComputed = useRef(false);
  const snapshotsCaptured = useRef(false);

  // Camera tracking refs
  const cameraSetRef = useRef(false);
  const lastFocusedPandId = useRef<string | null>(null);

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
  }, [buildings, targetPandId]);

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
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new HemisphereLight(
      isDarkMode ? 0x6688aa : 0xb1e1ff,
      isDarkMode ? 0x443311 : 0xb97a20,
      isDarkMode ? 0.4 : 0.5,
    );
    scene.add(ambient);

    const sunLight = new DirectionalLight(0xffffff, 0.8);
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
      color: isDarkMode ? 0x0D1620 : 0xF0F3F6,
      roughness: 0.95,
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

    // Animation loop (no FPS monitoring)
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
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Remove old buildings
    for (const mesh of ctx.buildingMeshes) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    ctx.buildingMeshes = [];

    // Reset camera flag when selecting a new target address
    if (targetPandId && targetPandId !== lastFocusedPandId.current) {
      cameraSetRef.current = false;
      lastFocusedPandId.current = targetPandId;
    }

    const neighborGeoms: BufferGeometry[] = [];

    for (const building of buildings) {
      let geom: BufferGeometry;
      const isTarget = building.pand_id === targetPandId;

      if (building.roof_surfaces && building.roof_surfaces.length > 0) {
        geom = createLod22Geometry(building.roof_surfaces, building.ground_height);
      } else {
        const shape = new Shape();
        const fp = building.footprint;
        if (fp.length < 3) continue;

        shape.moveTo(fp[0][0], fp[0][1]);
        for (let i = 1; i < fp.length; i++) {
          shape.lineTo(fp[i][0], fp[i][1]);
        }
        shape.closePath();

        geom = new ExtrudeGeometry(shape, {
          depth: building.building_height,
          bevelEnabled: false,
        });
        const transform = new Matrix4().makeRotationX(-Math.PI / 2);
        transform.setPosition(0, 0, 0);
        geom.applyMatrix4(transform);
        geom.deleteAttribute('uv');
      }

      if (isTarget) {
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
        continue;
      }

      neighborGeoms.push(geom);
    }

    // Merge all neighbor geometries into a single draw call
    const neighborMat = new MeshStandardMaterial({
      color: NEIGHBOR_COLOR,
      transparent: true,
      opacity: NEIGHBOR_OPACITY,
      side: DoubleSide,
    });

    if (neighborGeoms.length > 0) {
      const merged = mergeGeometries(neighborGeoms, false);
      if (merged) {
        for (const g of neighborGeoms) g.dispose();
        const mesh = new Mesh(merged, neighborMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isContext = true;
        ctx.scene.add(mesh);
        ctx.buildingMeshes.push(mesh);
      } else {
        for (const g of neighborGeoms) {
          const mesh = new Mesh(g, neighborMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.isContext = true;
          ctx.scene.add(mesh);
          ctx.buildingMeshes.push(mesh);
        }
      }
    }

    // Camera framing on first load
    if (!cameraSetRef.current && buildings.length > 0) {
      frameCamera();
      cameraSetRef.current = true;
    }

    sunlightComputed.current = false;
    snapshotsCaptured.current = false;
  }, [buildings, targetPandId, frameCamera]);

  // Fix sun to summer noon — static lighting for context card
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const year = new Date().getFullYear();
    const summerNoon = new Date(year, 5, 21, 12, 0, 0);
    const sunPos = SunCalc.getPosition(summerNoon, center.lat, center.lng);

    if (sunPos.altitude <= 0) {
      ctx.sunLight.intensity = 0;
      return;
    }

    ctx.sunLight.intensity = 0.8;
    const az = sunPos.azimuth;
    const alt = sunPos.altitude;

    const x = -Math.sin(az) * Math.cos(alt) * SUN_DISTANCE;
    const y = Math.sin(alt) * SUN_DISTANCE;
    const z = Math.cos(az) * Math.cos(alt) * SUN_DISTANCE;

    ctx.sunLight.position.set(x, y, z);
    ctx.sunLight.target.position.set(0, 0, 0);
  }, [center.lat, center.lng]);

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

    const offsets = [
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
          c.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)';
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
  }, [center.lat, center.lng]);

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

  // Capture shadow snapshots — 3 static views at 9:00/12:00/17:00 on Dec 21
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !onShadowSnapshots || buildings.length === 0 || snapshotsCaptured.current) return;
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
      <div className="viewer-3d__canvas" ref={containerRef} data-testid="viewer-3d-canvas">
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
      </div>
      <p className="viewer-3d__source">{t('viewer3d.source')}</p>
    </div>
  );
}
