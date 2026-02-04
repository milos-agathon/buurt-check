import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import SunCalc from 'suncalc';
import ShadowControls from './ShadowControls';
import OverlayControls from './OverlayControls';
import type { BuildingBlock, SunlightResult, ShadowSnapshot } from '../types/api';
import './NeighborhoodViewer3D.css';

const CAMERA_PRESETS: Record<string, [number, number, number]> = {
  street: [40, 15, 40],
  balcony: [30, 30, 30],
  topDown: [0, 200, 0.1],
};

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
const OTHER_COLOR = 0xcccccc;

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
  const [datePreset, setDatePreset] = useState('today');
  const sunlightComputed = useRef(false);
  const snapshotsCaptured = useRef(false);

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
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
    scene.add(sunLight);

    // Ground plane
    const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
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

    // Find min ground height to use as base
    const minGround = Math.min(...buildings.map((b) => b.ground_height));

    for (const building of buildings) {
      const shape = new THREE.Shape();
      const fp = building.footprint;
      if (fp.length < 3) continue;

      shape.moveTo(fp[0][0], fp[0][1]);
      for (let i = 1; i < fp.length; i++) {
        shape.lineTo(fp[i][0], fp[i][1]);
      }
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: building.building_height,
        bevelEnabled: false,
      });

      const isTarget = building.pand_id === targetPandId;
      const mat = new THREE.MeshStandardMaterial({
        color: isTarget ? TARGET_COLOR : OTHER_COLOR,
        transparent: !isTarget,
        opacity: isTarget ? 1.0 : 0.7,
      });

      const mesh = new THREE.Mesh(geom, mat);
      // Rotate so extrusion goes Y-up (Shape is in XY, extrude along Z, rotate -90 around X)
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = building.ground_height - minGround;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.pandId = building.pand_id;

      ctx.scene.add(mesh);
      ctx.buildingMeshes.push(mesh);
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

  // Camera preset handler
  const setCameraPreset = useCallback((preset: string) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const pos = CAMERA_PRESETS[preset];
    if (!pos) return;
    ctx.camera.position.set(pos[0], pos[1], pos[2]);
    ctx.camera.lookAt(0, 0, 0);
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
