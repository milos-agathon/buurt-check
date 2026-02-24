import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { setupTestI18n, makeNeighborhood3DResponse, makeNeighborhood3DResponseWithLod22 } from '../test/helpers';

// Mock Three.js — jsdom has no WebGL
const mockCanvas = document.createElement('canvas');
mockCanvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
const orbitControlsInstances: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const materialCalls: { args: any; instance: any }[] = [];

vi.mock('three', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function Scene(this: any) {
    this.add = vi.fn();
    this.remove = vi.fn();
    this.background = null;
    this.children = [];
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
  function HemisphereLight(this: any) { }
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
  function MockMesh(this: any) {
    this.rotation = { x: 0 };
    this.position = { x: 0, y: 0, z: 0, set: vi.fn() };
    this.scale = { x: 1, y: 1, z: 1, set: vi.fn() };
    this.castShadow = false;
    this.receiveShadow = false;
    this.userData = {};
    this.geometry = { dispose: vi.fn() };
    this.material = {
      dispose: vi.fn(),
      map: null,
      needsUpdate: false,
      color: { setHex: vi.fn() },
    };
  }
  function Shape(this: any) {
    this.moveTo = vi.fn();
    this.lineTo = vi.fn();
    this.closePath = vi.fn();
  }
  function ExtrudeGeometry(this: any) { this.dispose = vi.fn(); this.deleteAttribute = vi.fn(); }
  ExtrudeGeometry.prototype.applyMatrix4 = vi.fn();
  function BufferGeometry(this: any) {
    this.setAttribute = vi.fn();
    this.setIndex = vi.fn();
    this.computeVertexNormals = vi.fn();
    this.dispose = vi.fn();
  }
  function Float32BufferAttribute(this: any) { }
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
    getPosition: vi.fn(() => ({ azimuth: 0.5, altitude: 0.8 })),
    getTimes: vi.fn(() => ({
      sunrise: new Date(2026, 0, 1, 8, 0),
      sunset: new Date(2026, 0, 1, 16, 0),
    })),
  },
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
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
    return ++rafId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { });
});

afterEach(() => {
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
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
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

  it('captures shadow snapshots only after all neighbor chunks are processed', async () => {
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
        expect.objectContaining({ label: 'morning', hour: 9 }),
        expect.objectContaining({ label: 'noon', hour: 12 }),
        expect.objectContaining({ label: 'evening', hour: 17 }),
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

  it('uses dark-mode material values when data-theme is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      renderViewer();
      const neighborCall = materialCalls.find(
        ({ args }) => args?.transparent === true && args?.opacity !== undefined
      );
      expect(neighborCall).toBeDefined();
      expect(neighborCall!.args.color).toBe(0x8A9BB0);
      expect(neighborCall!.args.opacity).toBe(0.65);

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
