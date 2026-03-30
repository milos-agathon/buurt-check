import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { setupTestI18n, makeNeighborhood3DResponse, makeNeighborhood3DResponseWithLod22 } from '../test/helpers';
import { resetPrimaryApiBaseTestState, setPrimaryApiBaseTestRuntime } from '../config/apiBase';

// Mock Three.js — jsdom has no WebGL
const mockCanvas = document.createElement('canvas');
mockCanvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
const orbitControlsInstances: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const materialCalls: { args: any; instance: any }[] = [];
const serializeBuildingsMock = vi.hoisted(() => vi.fn(() => []));
const isWorkerSupportedMock = vi.hoisted(() => vi.fn(() => true));
const runSunlightInWorkerMock = vi.hoisted(() => vi.fn());
const fetchWeatherTmyMock = vi.hoisted(() => vi.fn());
const analyzeSunlightMock = vi.hoisted(() => vi.fn());
const isOffscreenCanvasSupportedMock = vi.hoisted(() => vi.fn(() => false));
const runSvfInWorkerMock = vi.hoisted(() => vi.fn());
const sunCalcGetPositionMock = vi.hoisted(() => vi.fn(() => ({ azimuth: 0.5, altitude: 0.8 })));
const sunCalcGetTimesMock = vi.hoisted(() => vi.fn(() => ({
  sunrise: new Date(2026, 0, 1, 8, 0),
  sunset: new Date(2026, 0, 1, 16, 0),
})));

vi.mock('three', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function Scene(this: any) {
    this.add = vi.fn();
    this.remove = vi.fn();
    this.background = null;
    this.children = [];
    this.traverse = vi.fn();
  }
  function PerspectiveCamera(this: any) {
    this.position = { set: vi.fn(), clone: vi.fn(() => ({ copy: vi.fn() })), copy: vi.fn() };
    this.lookAt = vi.fn();
    this.aspect = 1;
    this.updateProjectionMatrix = vi.fn();
  }
  function WebGLRenderer(this: any) {
    this.setSize = vi.fn();
    this.setPixelRatio = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
    this.domElement = mockCanvas;
    this.shadowMap = { enabled: false, type: null };
  }
  function HemisphereLight(this: any, skyColor?: number, groundColor?: number, intensity?: number) {
    this.color = { getHex: vi.fn(() => skyColor ?? 0), setHex: vi.fn() };
    this.groundColor = { getHex: vi.fn(() => groundColor ?? 0), setHex: vi.fn() };
    this.intensity = intensity ?? 0;
  }
  function DirectionalLight(this: any) {
    this.castShadow = false;
    this.intensity = 0;
    this.position = { set: vi.fn(), clone: vi.fn(() => ({ copy: vi.fn() })), copy: vi.fn() };
    this.target = { position: { set: vi.fn() } };
    this.shadow = {
      mapSize: { width: 0, height: 0 },
      camera: { left: 0, right: 0, top: 0, bottom: 0, far: 0, near: 0 },
      bias: 0,
      normalBias: 0,
    };
  }
  function PlaneGeometry(this: any) { }
  function MeshStandardMaterial(this: any, opts?: any) {
    materialCalls.push({ args: opts, instance: this });
    this.dispose = vi.fn();
    this.map = null;
    this.needsUpdate = false;
    this.color = { setHex: vi.fn() };
    this.copy = vi.fn(() => this);
    this.clone = vi.fn(() => new (MeshStandardMaterial as any)(opts));
  }
  function makeAttribute(values: number[], itemSize = 3) {
    return {
      itemSize,
      count: Math.floor(values.length / itemSize),
      getX: vi.fn((i: number) => values[(i * itemSize)] ?? 0),
      getY: vi.fn((i: number) => values[(i * itemSize) + 1] ?? 0),
      getZ: vi.fn((i: number) => values[(i * itemSize) + 2] ?? 0),
      setXYZ: vi.fn((i: number, x: number, y: number, z: number) => {
        values[(i * itemSize)] = x;
        values[(i * itemSize) + 1] = y;
        values[(i * itemSize) + 2] = z;
      }),
    };
  }
  function attachGeometryAttributes(instance: any) {
    instance.__attrs = {
      position: makeAttribute([0, 10, 0, 5, 10, 0, 5, 10, -5, 0, 10, -5]),
      normal: makeAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    };
    instance.getAttribute = vi.fn((name: string) => instance.__attrs[name]);
    instance.setAttribute = vi.fn((name: string, value: unknown) => {
      instance.__attrs[name] = value;
      return instance;
    });
    instance.deleteAttribute = vi.fn((name: string) => {
      delete instance.__attrs[name];
    });
  }
  function MockMesh(this: any, geometry?: any, material?: any) {
    this.rotation = { x: 0 };
    this.position = { x: 0, y: 0, z: 0, set: vi.fn() };
    this.scale = { x: 1, y: 1, z: 1, set: vi.fn() };
    this.castShadow = false;
    this.receiveShadow = false;
    this.userData = {};
    this.geometry = geometry ?? { dispose: vi.fn() };
    this.material = material ?? {
      dispose: vi.fn(),
      map: null,
      needsUpdate: false,
      color: { setHex: vi.fn() },
      clone: vi.fn(),
      copy: vi.fn(),
    };
  }
  function Shape(this: any) {
    this.moveTo = vi.fn();
    this.lineTo = vi.fn();
    this.closePath = vi.fn();
  }
  function ExtrudeGeometry(this: any) {
    this.dispose = vi.fn();
    this.applyMatrix4 = vi.fn();
    attachGeometryAttributes(this);
  }
  function BufferGeometry(this: any) {
    attachGeometryAttributes(this);
    this.setIndex = vi.fn();
    this.computeVertexNormals = vi.fn();
    this.dispose = vi.fn();
  }
  function Float32BufferAttribute(this: any, arrayOrLength: number[] | number, itemSize: number) {
    const values = Array.isArray(arrayOrLength)
      ? [...arrayOrLength]
      : new Array(arrayOrLength).fill(0);
    this.array = values;
    this.itemSize = itemSize;
    this.count = Math.floor(values.length / itemSize);
    this.getX = vi.fn((i: number) => values[(i * itemSize)] ?? 0);
    this.getY = vi.fn((i: number) => values[(i * itemSize) + 1] ?? 0);
    this.getZ = vi.fn((i: number) => values[(i * itemSize) + 2] ?? 0);
    this.setXYZ = vi.fn((i: number, x: number, y: number, z: number) => {
      values[(i * itemSize)] = x;
      values[(i * itemSize) + 1] = y;
      values[(i * itemSize) + 2] = z;
    });
  }
  function Color(this: any) { }
  function Vec3(this: any) {
    this.set = vi.fn().mockReturnThis();
    this.normalize = vi.fn().mockReturnThis();
    this.clone = vi.fn(() => new (Vec3 as any)());
    this.copy = vi.fn().mockReturnThis();
    this.x = 0; this.y = 0; this.z = 0;
  }
  function Raycaster(this: any) {
    this.set = vi.fn();
    this.far = 0;
    this.intersectObjects = vi.fn(() => []);
  }
  function TextureLoader(this: any) {
    this.load = vi.fn((_url, onLoad) => {
      // Simulate successful texture load with mock texture
      const mockTexture = { colorSpace: null, dispose: vi.fn() };
      setTimeout(() => onLoad?.(mockTexture), 0);
      return mockTexture;
    });
  }
  function MeshBasicMaterial(this: any) {
    this.dispose = vi.fn();
    this.map = null;
    this.transparent = false;
    this.opacity = 1;
    this.depthWrite = true;
  }
  function Matrix4(this: any) {
    this.makeRotationX = vi.fn().mockReturnThis();
    this.setPosition = vi.fn().mockReturnThis();
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight,
    PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Mesh: MockMesh,
    Shape, ExtrudeGeometry, BufferGeometry, Float32BufferAttribute,
    Color, Matrix4, PCFSoftShadowMap: 2, Vector3: Vec3, Raycaster, TextureLoader,
    DoubleSide: 2, SRGBColorSpace: 'srgb', LinearFilter: 1006,
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function OrbitControls(this: any) {
    this.enableDamping = false;
    this.maxPolarAngle = 0;
    this.update = vi.fn();
    this.dispose = vi.fn();
    this.target = { set: vi.fn() };
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
    orbitControlsInstances.push(this);
  }
  return { OrbitControls };
});

vi.mock('three/addons/utils/BufferGeometryUtils.js', () => ({
  mergeGeometries: vi.fn((geometries: unknown[]) => geometries[0] ?? null),
}));

vi.mock('suncalc', () => ({
  default: {
    getPosition: sunCalcGetPositionMock,
    getTimes: sunCalcGetTimesMock,
  },
}));

vi.mock('../workers/geometrySerialization', () => ({
  serializeBuildings: serializeBuildingsMock,
}));

vi.mock('../workers/sunlightBridge', () => ({
  isWorkerSupported: isWorkerSupportedMock,
  runSunlightInWorker: runSunlightInWorkerMock,
}));

vi.mock('../services/api', () => ({
  fetchWeatherTmy: fetchWeatherTmyMock,
}));

vi.mock('../workers/svfBridge', () => ({
  isOffscreenCanvasSupported: isOffscreenCanvasSupportedMock,
  runSvfInWorker: runSvfInWorkerMock,
}));

vi.mock('../utils/sunlightAnalysis', () => ({
  analyzeSunlight: analyzeSunlightMock,
}));

// Must import after mocks
import NeighborhoodViewer3D from './NeighborhoodViewer3D';

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

// Mock requestAnimationFrame / cancelAnimationFrame
let rafId = 0;
beforeEach(() => {
  rafId = 0;
  orbitControlsInstances.length = 0;
  materialCalls.length = 0;
  serializeBuildingsMock.mockReset();
  serializeBuildingsMock.mockReturnValue([]);
  isWorkerSupportedMock.mockReset();
  isWorkerSupportedMock.mockReturnValue(true);
  runSunlightInWorkerMock.mockReset();
  runSunlightInWorkerMock.mockResolvedValue({
    winter: 2.4,
    equinox: 5.8,
    summer: 9.7,
    annualAverage: 5.9,
    analysisYear: 2026,
    roofGridPoints: [[0, 10, 0], [5, 10, -5]],
    perPointAnnual: [4.2, 7.6],
    analysisMethod: 'cpu-raycast-worker',
  });
  fetchWeatherTmyMock.mockReset();
  fetchWeatherTmyMock.mockResolvedValue(null);
  analyzeSunlightMock.mockReset();
  isOffscreenCanvasSupportedMock.mockReset();
  isOffscreenCanvasSupportedMock.mockReturnValue(false);
  runSvfInWorkerMock.mockReset();
  sunCalcGetPositionMock.mockClear();
  sunCalcGetTimesMock.mockClear();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
    return ++rafId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetPrimaryApiBaseTestState();
  vi.restoreAllMocks();
});

const n3d = makeNeighborhood3DResponse();

function renderViewer(overrides = {}) {
  const props = {
    buildings: n3d.buildings,
    targetPandId: n3d.target_pand_id ?? undefined,
    center: n3d.center,
    onSunlightAnalysis: vi.fn(),
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <NeighborhoodViewer3D {...props} />
    </I18nextProvider>,
  );
}

describe('NeighborhoodViewer3D', () => {
  it('renders title', () => {
    renderViewer();
    expect(screen.getByText('3D Neighborhood')).toBeInTheDocument();
  });

  it('renders canvas container', () => {
    renderViewer();
    expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
  });

  it('renders source text', () => {
    renderViewer();
    expect(screen.getByText(/3DBAG.*SunCalc/)).toBeInTheDocument();
  });

  it('renders a localized degraded-state message when provided', () => {
    renderViewer({ statusMessage: '3D context is partial because some surrounding buildings could not be loaded.' });
    expect(screen.getByText('3D context is partial because some surrounding buildings could not be loaded.')).toBeInTheDocument();
  });

  it('snapshot capture restores sun state', () => {
    const onSnapshots = vi.fn();
    renderViewer({ onShadowSnapshots: onSnapshots });
    expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
  });

  it('renders with LoD 2.2 surfaces when present', () => {
    const lod22Data = makeNeighborhood3DResponseWithLod22();
    renderViewer({
      buildings: lod22Data.buildings,
      targetPandId: lod22Data.target_pand_id,
    });
    expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
  });

  it('renders LoD 0 fallback when roof_surfaces is absent', () => {
    // Default makeNeighborhood3DResponse has no roof_surfaces
    renderViewer();
    expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
  });

  // New tests for simplified viewer
  it('renders reset button with accessible label', () => {
    renderViewer();
    expect(screen.getByRole('button', { name: /reset view/i })).toBeInTheDocument();
  });

  it('wires OrbitControls listeners for on-demand rendering', () => {
    renderViewer();
    const controls = orbitControlsInstances[0];
    expect(controls.addEventListener).toHaveBeenCalledWith('start', expect.any(Function));
    expect(controls.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(controls.addEventListener).toHaveBeenCalledWith('end', expect.any(Function));
  });

  it('reset button is keyboard-activatable', () => {
    renderViewer();
    const resetBtn = screen.getByRole('button', { name: /reset view/i });
    resetBtn.focus();
    expect(resetBtn).toHaveFocus();
  });

  it('does not render fullscreen button', () => {
    renderViewer();
    expect(screen.queryByRole('button', { name: /fullscreen/i })).not.toBeInTheDocument();
  });

  it('does not render shadow controls (time slider)', () => {
    renderViewer();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('does not render overlay controls', () => {
    renderViewer();
    expect(screen.queryByRole('button', { name: /layers/i })).not.toBeInTheDocument();
  });

  it('shows skeleton overlay when loading=true', () => {
    renderViewer({ loading: true });
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });

  it('hides reset button when loading=true', () => {
    renderViewer({ loading: true });
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });

  it('shows reset button when loading=false', () => {
    renderViewer({ loading: false });
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('invokes onSunlightAnalysis when worker analysis completes', async () => {
    const target = n3d.buildings.find((building) => building.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    const onSunlightAnalysis = vi.fn();

    renderViewer({
      buildings: [target],
      targetPandId: target.pand_id,
      onSunlightAnalysis,
    });

    await waitFor(() => {
      expect(onSunlightAnalysis).toHaveBeenCalledTimes(1);
    });
    expect(onSunlightAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        winter: expect.any(Number),
        annualAverage: expect.any(Number),
      }),
    );
  });

  it('passes labeled facade and ground extra evaluation points to Worker analysis', async () => {
    const target = n3d.buildings.find((building) => building.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];

    renderViewer({
      buildings: [target],
      targetPandId: target.pand_id,
    });

    await waitFor(() => {
      expect(runSunlightInWorkerMock).toHaveBeenCalled();
    });

    const workerInput = runSunlightInWorkerMock.mock.calls[0][0] as {
      emitPerTimestep?: boolean;
      extraEvalPoints?: { points: [number, number, number][]; labels: string[]; skipSelfShadow: boolean };
    };
    expect(workerInput.emitPerTimestep).toBe(true);
    expect(workerInput.extraEvalPoints).toBeDefined();
    expect(workerInput.extraEvalPoints?.points.length).toBe(16);
    expect(workerInput.extraEvalPoints?.labels.some((label) => label.startsWith('facade:'))).toBe(true);
    expect(workerInput.extraEvalPoints?.labels.some((label) => label.startsWith('ground:ring:'))).toBe(true);
    expect(workerInput.extraEvalPoints?.skipSelfShadow).toBe(false);
  });

  it('shows heatmap legend when heatmap is enabled and per-point data exists', async () => {
    const target = n3d.buildings.find((building) => building.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];

    renderViewer({
      buildings: [target],
      targetPandId: target.pand_id,
      showHeatmap: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId('heatmap-legend')).toBeInTheDocument();
    });
    expect(screen.getByText('Roof sun-hours heatmap')).toBeInTheDocument();
  });

  it('uses sunDateTime prop when computing sun direction override', async () => {
    const sliderDate = new Date('2026-12-21T09:00:00.000Z');
    renderViewer({ sunDateTime: sliderDate });

    await waitFor(() => {
      const hasSliderCall = sunCalcGetPositionMock.mock.calls.some((call) => {
        const [date, lat, lng] = call as unknown as [Date, number, number];
        return (
          date instanceof Date
          && date.getTime() === sliderDate.getTime()
          && lat === n3d.center.lat
          && lng === n3d.center.lng
        );
      });
      expect(hasSliderCall).toBe(true);
    });
  });

  it('captures winter, equinox, and summer noon snapshots only after all neighbor chunks are processed', async () => {
    // Collect rAF callbacks so we can control when chunks execute
    const rafCallbacks: (() => void)[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb as () => void);
      return ++rafId;
    });

    const onSnapshots = vi.fn();
    renderViewer({ onShadowSnapshots: onSnapshots });

    // At this point, the target building is added synchronously.
    // Neighbor chunks are scheduled via rAF but haven't executed.
    // Snapshots should NOT have been captured yet.
    expect(onSnapshots).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0);
    });

    // Execute all pending rAF callbacks (building chunks + final snapshot trigger)
    let safety = 0;
    while (rafCallbacks.length > 0 && safety < 50) {
      const cb = rafCallbacks.shift()!;
      await act(async () => {
        cb();
        await Promise.resolve();
      });
      safety++;
    }

    // Now snapshots should have been captured
    await waitFor(() => {
      expect(onSnapshots).toHaveBeenCalledTimes(1);
    });
    expect(onSnapshots).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'winter', hour: 12, viewpoint: 'top' }),
        expect.objectContaining({ label: 'equinox', hour: 12, viewpoint: 'top' }),
        expect.objectContaining({ label: 'summer', hour: 12, viewpoint: 'top' }),
      ])
    );
  });

  it('creates neighbor material with contrast-passing color and opacity', () => {
    renderViewer();
    const neighborCall = materialCalls.find(
      ({ args }) => args?.transparent === true && args?.opacity !== undefined
    );
    expect(neighborCall).toBeDefined();
    expect(neighborCall!.args.color).toBe(0x556E85);
    expect(neighborCall!.args.opacity).toBe(0.90);
  });

  it('creates target material with theme-aware emissive intensity', () => {
    renderViewer();
    const targetCall = materialCalls.find(
      ({ args }) => args?.emissive !== undefined && !args?.transparent
    );
    expect(targetCall).toBeDefined();
    expect(targetCall!.args.color).toBe(0x2EC4B6);
    expect(targetCall!.args.emissiveIntensity).toBe(0.40); // light mode (jsdom default)
  });

  it('falls back to main-thread analysis with 64 points at 2m spacing when Worker unsupported', async () => {
    isWorkerSupportedMock.mockReturnValue(false);
    runSunlightInWorkerMock.mockReset(); // Should not be called

    const fallbackResult = {
      winter: 1.5,
      equinox: 4.0,
      summer: 8.0,
      annualAverage: 4.5,
      analysisYear: 2026,
      roofGridPoints: [[0, 10, 0], [5, 10, -5]] as [number, number, number][],
      perPointAnnual: [3.0, 6.0],
      analysisMethod: 'cpu-raycast-main' as const,
    };
    analyzeSunlightMock.mockResolvedValue(fallbackResult);

    const target = n3d.buildings.find((b) => b.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    const onSunlightAnalysis = vi.fn();

    renderViewer({
      buildings: [target],
      targetPandId: target.pand_id,
      onSunlightAnalysis,
    });

    await waitFor(() => {
      expect(analyzeSunlightMock).toHaveBeenCalled();
    });

    // Worker bridge should NOT have been called
    expect(runSunlightInWorkerMock).not.toHaveBeenCalled();

    // Fallback path must use low-density defaults (64 points, 2m spacing)
    const callArgs = analyzeSunlightMock.mock.calls[0][0] as {
      gridSpacingMeters?: number;
      maxPoints?: number;
    };
    expect(callArgs.gridSpacingMeters).toBe(2);
    expect(callArgs.maxPoints).toBe(64);
  });

  it('applies heatmap with 256 evaluation points producing valid color buffer', async () => {
    const pointCount = 256;
    const roofGridPoints: [number, number, number][] = Array.from(
      { length: pointCount },
      (_, i) => [i % 16, 10, -Math.floor(i / 16)],
    );
    const perPointAnnual = Array.from({ length: pointCount }, (_, i) => (i / pointCount) * 8);

    runSunlightInWorkerMock.mockResolvedValue({
      winter: 2.0,
      equinox: 5.0,
      summer: 9.0,
      annualAverage: 5.3,
      analysisYear: 2026,
      roofGridPoints,
      perPointAnnual,
      analysisMethod: 'cpu-raycast-worker',
    });

    const target = n3d.buildings.find((b) => b.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    const onSunlightAnalysis = vi.fn();

    renderViewer({
      buildings: [target],
      targetPandId: target.pand_id,
      onSunlightAnalysis,
      showHeatmap: true,
    });

    await waitFor(() => {
      expect(onSunlightAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          perPointAnnual: expect.arrayContaining([expect.any(Number)]),
          roofGridPoints: expect.arrayContaining([expect.any(Array)]),
        }),
      );
    });

    // Verify heatmap data was processed — the Worker result with 256 points
    // should have been passed through without error
    const result = onSunlightAnalysis.mock.calls[0][0];
    expect(result.perPointAnnual).toHaveLength(pointCount);
    expect(result.roofGridPoints).toHaveLength(pointCount);
  });

  it('fetches weather data for irradiance when SVF and per-timestep visibility are available', async () => {
    isOffscreenCanvasSupportedMock.mockReturnValue(true);
    runSvfInWorkerMock.mockResolvedValue(0.6);
    fetchWeatherTmyMock.mockResolvedValue([
      { date: '2005-01-21T08:00:00Z', minuteOfDay: 480, dni_w_m2: 400, dhi_w_m2: 120 },
      { date: '2005-01-21T08:30:00Z', minuteOfDay: 510, dni_w_m2: 420, dhi_w_m2: 130 },
      { date: '2005-01-21T09:00:00Z', minuteOfDay: 540, dni_w_m2: 450, dhi_w_m2: 140 },
    ]);
    runSunlightInWorkerMock.mockResolvedValue({
      winter: 2.4,
      equinox: 5.8,
      summer: 9.7,
      annualAverage: 5.9,
      analysisYear: 2026,
      roofGridPoints: [[0, 10, 0], [5, 10, -5]],
      perPointAnnual: [4.2, 7.6],
      perTimestepVisibility: [[1, 1, 1], [1, 1, 1]],
      timestepMeta: [
        { date: '2026-01-21T08:00:00.000Z', minuteOfDay: 480 },
        { date: '2026-01-21T08:30:00.000Z', minuteOfDay: 510 },
        { date: '2026-01-21T09:00:00.000Z', minuteOfDay: 540 },
      ],
      analysisMethod: 'cpu-raycast-worker',
    });

    const target = n3d.buildings.find((b) => b.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    const onSunlightAnalysis = vi.fn();
    renderViewer({
      addressId: '0363010000696734',
      reportId: 'report-123',
      buildings: [target],
      targetPandId: target.pand_id,
      onSunlightAnalysis,
    });

    await waitFor(() => {
      expect(onSunlightAnalysis).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchWeatherTmyMock).toHaveBeenCalledWith(
        '0363010000696734',
        n3d.center.lat,
        n3d.center.lng,
        expect.any(Object),
        'report-123',
      );
    });

    await waitFor(() => {
      expect(onSunlightAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          irradianceKwhM2: expect.any(Number),
          irradianceDirectKwhM2: expect.any(Number),
          irradianceDiffuseKwhM2: expect.any(Number),
        }),
      );
    });
  });

  it('skips weather fetch when reportId is missing', async () => {
    isOffscreenCanvasSupportedMock.mockReturnValue(true);
    runSvfInWorkerMock.mockResolvedValue(0.6);
    fetchWeatherTmyMock.mockResolvedValue([
      { date: '2005-01-21T08:00:00Z', minuteOfDay: 480, dni_w_m2: 400, dhi_w_m2: 120 },
      { date: '2005-01-21T08:30:00Z', minuteOfDay: 510, dni_w_m2: 420, dhi_w_m2: 130 },
      { date: '2005-01-21T09:00:00Z', minuteOfDay: 540, dni_w_m2: 450, dhi_w_m2: 140 },
    ]);
    runSunlightInWorkerMock.mockResolvedValue({
      winter: 2.4,
      equinox: 5.8,
      summer: 9.7,
      annualAverage: 5.9,
      analysisYear: 2026,
      roofGridPoints: [[0, 10, 0], [5, 10, -5]],
      perPointAnnual: [4.2, 7.6],
      perTimestepVisibility: [[1, 1, 1], [1, 1, 1]],
      timestepMeta: [
        { date: '2026-01-21T08:00:00.000Z', minuteOfDay: 480 },
        { date: '2026-01-21T08:30:00.000Z', minuteOfDay: 510 },
        { date: '2026-01-21T09:00:00.000Z', minuteOfDay: 540 },
      ],
      analysisMethod: 'cpu-raycast-worker',
    });

    const target = n3d.buildings.find((b) => b.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    const onSunlightAnalysis = vi.fn();
    renderViewer({
      addressId: '0363010000696734',
      buildings: [target],
      targetPandId: target.pand_id,
      onSunlightAnalysis,
    });

    await waitFor(() => {
      expect(onSunlightAnalysis).toHaveBeenCalledTimes(1);
    });
    expect(fetchWeatherTmyMock).not.toHaveBeenCalled();
    expect(onSunlightAnalysis).not.toHaveBeenCalledWith(
      expect.objectContaining({
        irradianceKwhM2: expect.any(Number),
      }),
    );
  });

  it('routes hosted-web orthophoto tiles through same-origin /api when VITE_API_BASE is cross-origin', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://buurt-check.onrender.com/api');
    setPrimaryApiBaseTestRuntime({
      protocol: 'https:',
      hostname: 'app.buurt-check.nl',
      origin: 'https://app.buurt-check.nl',
    });

    const requestedUrls: string[] = [];
    class MockImage {
      crossOrigin = '';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      private _src = '';

      get src(): string {
        return this._src;
      }

      set src(value: string) {
        this._src = value;
        requestedUrls.push(value);
      }
    }
    vi.stubGlobal('Image', MockImage);

    const target = n3d.buildings.find((b) => b.pand_id === n3d.target_pand_id) ?? n3d.buildings[0];
    renderViewer({
      reportId: 'report-123',
      buildings: [target],
      targetPandId: target.pand_id,
    });

    await waitFor(() => {
      expect(requestedUrls[0]).toContain('/api/address/wms-tile?');
    });
    expect(requestedUrls[0]).toContain('report_id=report-123');
    expect(requestedUrls[0]).not.toContain('buurt-check.onrender.com');
  });

  it('uses dark-mode material values when data-theme is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      renderViewer();
      const neighborCall = materialCalls.find(
        ({ args }) => args?.transparent === true && args?.opacity !== undefined
      );
      expect(neighborCall).toBeDefined();
      expect(neighborCall!.args.color).toBe(0x8A9BB0);
      expect(neighborCall!.args.opacity).toBe(0.80);

      const targetCall = materialCalls.find(
        ({ args }) => args?.emissive !== undefined && !args?.transparent
      );
      expect(targetCall).toBeDefined();
      expect(targetCall!.args.emissiveIntensity).toBe(0.20);
    } finally {
      document.documentElement.removeAttribute('data-theme');
    }
  });
});
