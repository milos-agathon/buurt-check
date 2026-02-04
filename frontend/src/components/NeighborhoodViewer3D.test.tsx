import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { setupTestI18n, makeNeighborhood3DResponse } from '../test/helpers';

// Mock Three.js — jsdom has no WebGL
const mockCanvas = document.createElement('canvas');
mockCanvas.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

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
  function AmbientLight(this: any) {}
  function DirectionalLight(this: any) {
    this.castShadow = false;
    this.intensity = 0;
    this.position = { set: vi.fn(), clone: vi.fn(() => ({ copy: vi.fn() })), copy: vi.fn() };
    this.target = { position: { set: vi.fn() } };
    this.shadow = {
      mapSize: { width: 0, height: 0 },
      camera: { left: 0, right: 0, top: 0, bottom: 0, far: 0, near: 0 },
    };
  }
  function PlaneGeometry(this: any) {}
  function MeshStandardMaterial(this: any) { this.dispose = vi.fn(); }
  function MockMesh(this: any) {
    this.rotation = { x: 0 };
    this.position = { y: 0 };
    this.castShadow = false;
    this.receiveShadow = false;
    this.userData = {};
    this.geometry = { dispose: vi.fn() };
    this.material = { dispose: vi.fn() };
  }
  function Shape(this: any) {
    this.moveTo = vi.fn();
    this.lineTo = vi.fn();
    this.closePath = vi.fn();
  }
  function ExtrudeGeometry(this: any) { this.dispose = vi.fn(); }
  function Color(this: any) {}
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
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight,
    PlaneGeometry, MeshStandardMaterial, Mesh: MockMesh, Shape, ExtrudeGeometry,
    Color, PCFSoftShadowMap: 2, Vector3: Vec3, Raycaster,
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function OrbitControls(this: any) {
    this.enableDamping = false;
    this.maxPolarAngle = 0;
    this.update = vi.fn();
    this.dispose = vi.fn();
  }
  return { OrbitControls };
});

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
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
    return ++rafId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
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

  it('renders shadow controls', () => {
    renderViewer();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('renders source text', () => {
    renderViewer();
    expect(screen.getByText(/3DBAG \+ SunCalc/)).toBeInTheDocument();
  });

  it('renders camera preset buttons', () => {
    renderViewer();
    expect(screen.getByText('Street level')).toBeInTheDocument();
    expect(screen.getByText('Balcony level')).toBeInTheDocument();
    expect(screen.getByText('Top-down')).toBeInTheDocument();
  });

  it('renders overlay controls', () => {
    renderViewer();
    expect(screen.getByText('Data overlays')).toBeInTheDocument();
  });

  it('snapshot capture restores sun state', () => {
    const onSnapshots = vi.fn();
    renderViewer({ onShadowSnapshots: onSnapshots });
    expect(screen.getByTestId('viewer-3d-canvas')).toBeInTheDocument();
  });
});
