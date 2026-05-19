import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { I18nextProvider } from 'react-i18next';
import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import L from 'leaflet';
import NeighborhoodDetail from '../components/match-first/NeighborhoodDetail';
import ResultsMap from '../components/match-first/ResultsMap';
import { getMatchResultsMapStateStorageKey } from '../services/matchSessionStorage';
import { setupTestI18n } from './helpers';
import type {
  MatchNeighborhoodAmenityTag,
  MatchNeighborhoodBuildingFeature,
  MatchNeighborhoodRecommendation,
  MatchResultsResponse,
} from '../types/matchFirst';

const threeRendererStats = vi.hoisted(() => ({
  renderCount: 0,
  setSizeCalls: [] as Array<[number, number, boolean?]>,
  disposed: 0,
  bufferGeometryCalls: 0,
  extrudeGeometryCalls: 0,
  float32BufferAttributeCalls: 0,
  bufferAttributePositions: [] as number[][],
  cameraPositions: [] as Array<[number, number, number]>,
  cameraLookAts: [] as Array<[number, number, number]>,
  cameraTypes: [] as string[],
  meshStandardMaterials: [] as Array<Record<string, unknown>>,
  rendererOptions: [] as Array<Record<string, unknown>>,
  failRendererWhenPreservingDrawingBuffer: false,
  orbitControls: [] as Array<{
    enableZoom?: boolean;
    enablePan?: boolean;
    enableRotate?: boolean;
    minDistance?: number;
    maxDistance?: number;
  }>,
  orbitTargets: [] as Array<[number, number, number]>,
  orbitUpdateCount: 0,
  orbitDisposals: 0,
  nextRaycastBuildingId: null as string | null,
}));

vi.mock('three', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function Scene(this: any) {
    this.children = [];
    this.background = null;
    this.add = vi.fn((...items: unknown[]) => {
      this.children.push(...items);
    });
    this.remove = vi.fn();
  }
  function PerspectiveCamera(this: any) {
    threeRendererStats.cameraTypes.push('perspective');
    this.position = {
      set: vi.fn((x: number, y: number, z: number) => {
        threeRendererStats.cameraPositions.push([x, y, z]);
      }),
    };
    this.lookAt = vi.fn((x: number, y: number, z: number) => {
      threeRendererStats.cameraLookAts.push([x, y, z]);
    });
    this.aspect = 1;
    this.updateProjectionMatrix = vi.fn();
  }
  function OrthographicCamera(this: any) {
    threeRendererStats.cameraTypes.push('orthographic');
    this.position = {
      set: vi.fn((x: number, y: number, z: number) => {
        threeRendererStats.cameraPositions.push([x, y, z]);
      }),
    };
    this.up = {
      set: vi.fn(),
    };
    this.lookAt = vi.fn((x: number, y: number, z: number) => {
      threeRendererStats.cameraLookAts.push([x, y, z]);
    });
    this.left = 0;
    this.right = 0;
    this.top = 0;
    this.bottom = 0;
    this.zoom = 1;
    this.updateProjectionMatrix = vi.fn();
  }
  function WebGLRenderer(this: any, options?: { canvas?: HTMLCanvasElement; preserveDrawingBuffer?: boolean }) {
    threeRendererStats.rendererOptions.push(options ?? {});
    if (threeRendererStats.failRendererWhenPreservingDrawingBuffer && options?.preserveDrawingBuffer) {
      throw new Error('preserveDrawingBuffer context rejected');
    }
    if ((options?.canvas as (HTMLCanvasElement & { __contextType?: string }) | undefined)?.__contextType === '2d') {
      throw new Error('visible canvas already has a 2D context');
    }
    this.domElement = options?.canvas ?? document.createElement('canvas');
    (this.domElement as HTMLCanvasElement & { __contextType?: string }).__contextType = 'webgl';
    this.setPixelRatio = vi.fn();
    this.setClearColor = vi.fn();
    this.setSize = vi.fn((width: number, height: number, updateStyle?: boolean) => {
      threeRendererStats.setSizeCalls.push([width, height, updateStyle]);
    });
    this.render = vi.fn(() => {
      threeRendererStats.renderCount += 1;
    });
    this.dispose = vi.fn(() => {
      threeRendererStats.disposed += 1;
    });
  }
  function Shape(this: any) {
    this.moveTo = vi.fn();
    this.lineTo = vi.fn();
    this.closePath = vi.fn();
  }
  function ExtrudeGeometry(this: any) {
    threeRendererStats.extrudeGeometryCalls += 1;
    this.rotateX = vi.fn();
    this.dispose = vi.fn();
  }
  function BufferGeometry(this: any) {
    threeRendererStats.bufferGeometryCalls += 1;
    this.setAttribute = vi.fn();
    this.setIndex = vi.fn();
    this.computeVertexNormals = vi.fn();
    this.dispose = vi.fn();
  }
  function Float32BufferAttribute(this: any, positions?: number[]) {
    threeRendererStats.float32BufferAttributeCalls += 1;
    if (Array.isArray(positions)) {
      threeRendererStats.bufferAttributePositions.push([...positions]);
    }
  }
  function PlaneGeometry(this: any) {
    this.dispose = vi.fn();
  }
  function MeshStandardMaterial(this: any, options?: Record<string, unknown>) {
    this.options = options;
    threeRendererStats.meshStandardMaterials.push(options ?? {});
    this.dispose = vi.fn();
  }
  function MeshBasicMaterial(this: any, options?: Record<string, unknown>) {
    this.options = options;
    this.dispose = vi.fn();
  }
  function Mesh(this: any, geometry?: unknown, material?: unknown) {
    this.geometry = geometry;
    this.material = material;
    this.rotation = { x: 0 };
    this.position = { set: vi.fn() };
    this.userData = {};
    this.castShadow = false;
    this.receiveShadow = false;
  }
  function AmbientLight(this: any) {}
  function DirectionalLight(this: any) {
    this.position = { set: vi.fn() };
  }
  function Color(this: any, value: number) {
    this.value = value;
  }
  function Vector2(this: any) {
    this.set = vi.fn();
  }
  function Raycaster(this: any) {
    this.setFromCamera = vi.fn();
    this.intersectObjects = vi.fn((objects: Array<{ userData?: Record<string, unknown> }>) => {
      if (!threeRendererStats.nextRaycastBuildingId) return [];
      const object = objects.find((item) => item.userData?.buildingId === threeRendererStats.nextRaycastBuildingId)
        ?? objects[0];
      return object ? [{ object }] : [];
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    AmbientLight,
    BufferGeometry,
    Color,
    DirectionalLight,
    DoubleSide: 2,
    ExtrudeGeometry,
    Float32BufferAttribute,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    OrthographicCamera,
    PerspectiveCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    Shape,
    Vector2,
    WebGLRenderer,
  };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => {
  function OrbitControls(this: {
    target: { set: (x: number, y: number, z: number) => void };
    enableZoom?: boolean;
    enablePan?: boolean;
    enableRotate?: boolean;
    minDistance?: number;
    maxDistance?: number;
    maxPolarAngle?: number;
    addEventListener: (type: string, callback: () => void) => void;
    removeEventListener: (type: string, callback: () => void) => void;
    update: () => void;
    dispose: () => void;
  }) {
    this.target = {
      set: vi.fn((x: number, y: number, z: number) => {
        threeRendererStats.orbitTargets.push([x, y, z]);
      }),
    };
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
    this.update = vi.fn(() => {
      threeRendererStats.orbitUpdateCount += 1;
    });
    this.dispose = vi.fn(() => {
      threeRendererStats.orbitDisposals += 1;
    });
    threeRendererStats.orbitControls.push(this);
  }
  return { OrbitControls };
});

let i18n: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18n = await setupTestI18n('en');
});

beforeEach(async () => {
  vi.restoreAllMocks();
  threeRendererStats.renderCount = 0;
  threeRendererStats.setSizeCalls = [];
  threeRendererStats.disposed = 0;
  threeRendererStats.bufferGeometryCalls = 0;
  threeRendererStats.extrudeGeometryCalls = 0;
  threeRendererStats.float32BufferAttributeCalls = 0;
  threeRendererStats.bufferAttributePositions = [];
  threeRendererStats.cameraPositions = [];
  threeRendererStats.cameraLookAts = [];
  threeRendererStats.cameraTypes = [];
  threeRendererStats.meshStandardMaterials = [];
  threeRendererStats.rendererOptions = [];
  threeRendererStats.failRendererWhenPreservingDrawingBuffer = false;
  threeRendererStats.orbitControls = [];
  threeRendererStats.orbitTargets = [];
  threeRendererStats.orbitUpdateCount = 0;
  threeRendererStats.orbitDisposals = 0;
  threeRendererStats.nextRaycastBuildingId = null;
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-test-reduced-motion');
  window.history.replaceState({}, '', '/');
  await i18n.changeLanguage('en');
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    value: 640,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    value: 360,
  });
  const context2d = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    set fillStyle(_value: string) {},
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
  } as unknown as CanvasRenderingContext2D;
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
    mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  };
  getContextSpy.mockImplementation(function getContextMock(this: HTMLCanvasElement, contextId) {
    if (contextId === '2d') {
      (this as HTMLCanvasElement & { __contextType?: string }).__contextType = '2d';
      return context2d;
    }
    return null;
  });
});

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function recommendation(overrides: Partial<MatchNeighborhoodRecommendation> = {}): MatchNeighborhoodRecommendation {
  const rank = overrides.rank ?? 1;
  const neighborhoodId = overrides.neighborhood_id ?? 'nh_amsterdam_ijburg';
  return {
    rank,
    recommendation_id: overrides.recommendation_id ?? `rec_${rank}`,
    neighborhood_id: neighborhoodId,
    name: overrides.name ?? 'IJburg',
    municipality: overrides.municipality ?? 'Amsterdam',
    fit_score: overrides.fit_score ?? 84,
    fit_label_key: overrides.fit_label_key ?? 'matchFirst.results.fitLabel.strong',
    category: overrides.category ?? 'top',
    eligibility_status: overrides.eligibility_status ?? 'eligible',
    confidence: overrides.confidence ?? {
      score: 72,
      level: 'medium',
      reasons: ['match.results.confidence.mock_source_data'],
    },
    reason_codes: overrides.reason_codes ?? [
      'match.results.reasons.green_access_match',
      'match.results.reasons.mobility_match',
      'match.results.reasons.family_fit_match',
    ],
    tradeoffs: overrides.tradeoffs ?? ['match.results.tradeoffs.review_source_limitations'],
    component_scores: overrides.component_scores ?? {},
    failed_filters: overrides.failed_filters ?? [],
    source_refs: overrides.source_refs ?? ['seed_match_source'],
    source_metadata: overrides.source_metadata ?? [],
    limitations: overrides.limitations ?? ['match.results.limitations.mock_data'],
    freshness_status: overrides.freshness_status ?? 'mock',
    geometry_ref: overrides.geometry_ref ?? {
      centroid_rd: { x: 126250, y: 486800 },
      bounds_rd: [125450, 486000, 127050, 487600],
      display_centroid_wgs84: { lat: 52.355, lng: 5.0 },
      display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
      boundary_ref: `boundary_${neighborhoodId}`,
    },
    ...overrides,
  };
}

function resultsResponse(overrides: Partial<MatchResultsResponse> = {}): MatchResultsResponse {
  const rankedResults = overrides.ranked_results ?? [recommendation()];
  return {
    session_id: 'match-detail',
    job_id: 'match_job_detail',
    result_set_id: 'mrs_detail',
    preference_vector_version: 'pv_v1_detail',
    status: 'completed',
    generated_at: '2026-05-16T12:00:01Z',
    runtime_ms: 1900,
    model_mode: 'weighted_scoring',
    model_version: 'match-score-v1',
    scoring_version: 'match-score-v1',
    data_version: 'match-seed-v1',
    evaluation_status: 'not_validated_no_labels',
    predictive_probability_available: false,
    fallback_used: false,
    fallback_reason_code: null,
    normal_recommendation_count: rankedResults.length,
    candidate_count: rankedResults.length,
    scored_candidate_count: rankedResults.length,
    ranked_results: rankedResults,
    recommendations: rankedResults,
    stretch_matches: [],
    near_misses: [],
    empty_state_code: null,
    map_center: { lat: 52.2, lng: 5.3 },
    bbox: [3.2, 50.7, 7.3, 53.6],
    map: { type: 'FeatureCollection', display_bounds_wgs84: [3.2, 50.7, 7.3, 53.6], features: [] },
    ...overrides,
  };
}

function amenityTags(): MatchNeighborhoodAmenityTag[] {
  return [
    'transit',
    'schools',
    'childcare',
    'parks_green',
    'sports_fields',
  ].map((amenity_key, index) => ({
    amenity_key,
    label_key: `matchFirst.amenity.${amenity_key}`,
    reason_code: index < 2 ? 'must_have_match' : 'default_context',
    source_refs: ['seed_match_source'],
    relevance: 95 - index,
  }));
}

function basemapConfig(overrides: Record<string, unknown> = {}) {
  return {
    source_id: 'pdok_brt_achtergrondkaart',
    source_name: 'PDOK BRT Achtergrondkaart',
    service_type: 'wmts_raster',
    theme: 'standaard',
    tile_matrix_set: 'EPSG:3857',
    tile_url_template: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
    attribution: 'PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)',
    min_zoom: 0,
    max_zoom: 19,
    ...overrides,
  };
}

function amenityPoints(): unknown[] {
  return [
    {
      point_id: 'amenity_nh_amsterdam_ijburg_transit_1',
      amenity_key: 'transit',
      category_key: 'transit',
      label_key: 'matchFirst.amenity.transit',
      name: 'IJburglaan tram stop',
      emoji: '🚉',
      display_lat: 52.36683,
      display_lng: 4.97104,
      display_coordinate_system: 'WGS84',
      source_name: 'NDOV / REISinformatiegroep GTFS stops',
      source_record_id: null,
      freshness_date: '2026-05-01',
      loaded_at: '2026-05-19T08:00:00Z',
      source_coordinate_system: 'EPSG:4326',
      source_geometry: { type: 'Point', coordinates: [4.97104, 52.36683] },
      source_geometry_coordinate_system: 'EPSG:4326',
      source_refs: ['ndov_gtfs_stops'],
      relevance: 95,
    },
    {
      point_id: 'amenity_nh_amsterdam_ijburg_schools_1',
      amenity_key: 'schools',
      category_key: 'schools',
      label_key: 'matchFirst.amenity.schools',
      display_lat: 52.36504,
      display_lng: 4.97412,
      display_coordinate_system: 'WGS84',
      name: 'Laterna Magica',
      emoji: '🏫',
      source_name: 'DUO Open Onderwijsdata school vestigingen matched to BAG',
      source_record_id: null,
      freshness_date: '2026-05-01',
      loaded_at: '2026-05-19T08:00:00Z',
      source_coordinate_system: 'EPSG:4326',
      source_geometry: { type: 'Point', coordinates: [4.97412, 52.36504] },
      source_geometry_coordinate_system: 'EPSG:4326',
      source_refs: ['duo_open_onderwijsdata_bag'],
      relevance: 84,
    },
    {
      point_id: 'amenity_nh_amsterdam_ijburg_childcare_1',
      amenity_key: 'childcare',
      category_key: 'childcare',
      label_key: 'matchFirst.amenity.childcare',
      display_lat: 52.3659,
      display_lng: 4.97088,
      display_coordinate_system: 'WGS84',
      name: 'Kindergarden Amsterdam IJburg',
      emoji: '🧸',
      source_name: 'Landelijk Register Kinderopvang matched to BAG',
      source_record_id: null,
      freshness_date: '2026-05-01',
      loaded_at: '2026-05-19T08:00:00Z',
      source_coordinate_system: 'EPSG:4326',
      source_geometry: { type: 'Point', coordinates: [4.97088, 52.3659] },
      source_geometry_coordinate_system: 'EPSG:4326',
      source_refs: ['lrk_bag_locations'],
      relevance: 83,
    },
    {
      point_id: 'amenity_nh_amsterdam_ijburg_parks_green_1',
      amenity_key: 'parks_green',
      category_key: 'parks_green',
      label_key: 'matchFirst.amenity.parks_green',
      display_lat: 52.36574,
      display_lng: 4.96083,
      display_coordinate_system: 'WGS84',
      name: 'Theo van Goghpark',
      emoji: '🌳',
      source_name: 'PDOK BGT/BRT green-space geometry',
      source_record_id: null,
      freshness_date: '2026-05-01',
      loaded_at: '2026-05-19T08:00:00Z',
      source_coordinate_system: 'EPSG:4326',
      source_geometry: { type: 'Polygon', coordinates: [] },
      source_geometry_coordinate_system: 'EPSG:4326',
      source_refs: ['pdok_bgt_brt_green'],
      relevance: 82,
    },
    {
      point_id: 'amenity_nh_amsterdam_ijburg_sports_fields_1',
      amenity_key: 'sports_fields',
      category_key: 'sports_fields',
      label_key: 'matchFirst.amenity.sports_fields',
      display_lat: 52.36192,
      display_lng: 4.9736,
      display_coordinate_system: 'WGS84',
      name: 'Sportpark IJburg',
      emoji: '⚽',
      source_name: 'PDOK BGT sportterrein and BAG sportfunctie geometry',
      source_record_id: null,
      freshness_date: '2026-05-01',
      loaded_at: '2026-05-19T08:00:00Z',
      source_coordinate_system: 'EPSG:4326',
      source_geometry: { type: 'Polygon', coordinates: [] },
      source_geometry_coordinate_system: 'EPSG:4326',
      source_refs: ['pdok_bgt_bag_sports'],
      relevance: 81,
    },
  ];
}

interface MockNeighborhoodDetailFetchOptions {
  failAmenities?: boolean;
  allowedBoundsRd?: [number, number, number, number];
  amenityPoints?: unknown[];
  buildings?: MatchNeighborhoodBuildingFeature[];
  buildingLayerAvailable?: boolean;
  buildingLayerFallbackReasonCode?: string | null;
  buildingResponseFallbackReasonCode?: string | null;
  dossierBridgeStatus?: 'resolved' | 'unavailable' | 'candidates' | 'manual_required';
  dossierBridgeError?: string;
  dossierBridgeStatusCode?: number;
  dossierBridgeRoute?: string;
  dossierBridgeResponses?: Array<{ status?: number; body: unknown }>;
}

function boundsFromFetchCall(call: Parameters<typeof fetch> | undefined): number[] {
  expect(call).toBeDefined();
  const url = new URL(String(call?.[0]), 'http://localhost');
  return (url.searchParams.get('bounds_rd') ?? '').split(',').map(Number);
}

function enableWebGlCanvasMock() {
  const context2d = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    set fillStyle(_value: string) {},
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
  } as unknown as CanvasRenderingContext2D;
  const webglContext = {
    getExtension: vi.fn(),
    canvas: document.createElement('canvas'),
  } as unknown as WebGLRenderingContext;
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
    mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  };
  getContextSpy.mockImplementation(function getContextMock(this: HTMLCanvasElement, contextId) {
    const canvasWithContext = this as HTMLCanvasElement & { __contextType?: string };
    if (contextId === '2d') {
      canvasWithContext.__contextType = '2d';
      return context2d;
    }
    if (contextId === 'webgl' || contextId === 'experimental-webgl') {
      if (canvasWithContext.__contextType === '2d') return null;
      canvasWithContext.__contextType = 'webgl';
      return webglContext;
    }
    return null;
  });
}

function mockNeighborhoodDetailFetches(
  results = resultsResponse(),
  options: MockNeighborhoodDetailFetchOptions = {},
) {
  const allowedBoundsRd = options.allowedBoundsRd ?? [125450, 486000, 127050, 487600];
  const buildings = options.buildings ?? [];
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const neighborhoodId = results.ranked_results[0]?.neighborhood_id ?? 'nh_amsterdam_ijburg';
    if (url.endsWith('/api/match/results-basemap')) {
      return new Response(JSON.stringify(basemapConfig()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/sessions/${results.session_id}/results`)) {
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith(`/api/match/neighborhoods/${neighborhoodId}`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        name: 'IJburg',
        municipality: 'Amsterdam',
        centroid_rd: { x: 126250, y: 486800 },
        bounds_rd: allowedBoundsRd,
        display_centroid_wgs84: { lat: 52.355, lng: 5 },
        display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
        boundary_ref: `boundary_${neighborhoodId}`,
        source_refs: ['seed_match_source'],
        freshness_status: 'mock',
        limitations: ['match.results.limitations.mock_data'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/map-layers`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        allowed_bounds_rd: allowedBoundsRd,
        display_bounds_wgs84: [4.988, 52.347, 5.012, 52.363],
        boundary: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { neighborhood_id: neighborhoodId },
        },
        building_layer: {
          available: options.buildingLayerAvailable ?? buildings.length > 0,
          endpoint: `/api/match/neighborhoods/${neighborhoodId}/buildings`,
          fallback_reason_code: options.buildingLayerFallbackReasonCode === undefined
            ? buildings.length > 0 ? null : 'matchFirst.neighborhood.missing3d'
            : options.buildingLayerFallbackReasonCode,
        },
        amenity_layer: { endpoint: `/api/match/neighborhoods/${neighborhoodId}/amenities` },
        fallback_2d_available: true,
        source_refs: ['seed_match_source'],
        limitations: ['match.results.limitations.mock_data'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/amenities`)) {
      if (options.failAmenities) {
        return new Response(JSON.stringify({ detail: 'amenities unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        tags: amenityTags(),
        points: options.amenityPoints ?? [],
        source_refs: ['seed_match_source'],
        limitations: [],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes(`/api/match/neighborhoods/${neighborhoodId}/buildings`)) {
      return new Response(JSON.stringify({
        neighborhood_id: neighborhoodId,
        session_id: results.session_id,
        result_set_id: results.result_set_id,
        bounds_rd: allowedBoundsRd,
        clipped_to_neighborhood: true,
        buildings,
        fallback_reason_code: options.buildingResponseFallbackReasonCode === undefined
          ? 'matchFirst.neighborhood.missing3d'
          : options.buildingResponseFallbackReasonCode,
        data_version: 'match-seed-v1',
        source_refs: ['seed_match_source'],
        limitations: ['match.results.limitations.source_metadata_unavailable'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/api/match/dossier/from-building')) {
      if (options.dossierBridgeResponses?.length) {
        const next = options.dossierBridgeResponses.shift();
        return new Response(JSON.stringify(next?.body ?? { detail: 'unexpected bridge call' }), {
          status: next?.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (options.dossierBridgeError) {
        return new Response(JSON.stringify({ detail: options.dossierBridgeError }), {
          status: options.dossierBridgeStatusCode ?? 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const status = options.dossierBridgeStatus ?? 'resolved';
      const body = status === 'resolved'
        ? {
          status: 'resolved',
          route: options.dossierBridgeRoute
            ?? '#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail',
          vbo_id: '0363010000123456',
          lookup_id: 'adr-abc123',
          address_candidate: {
            address_id: '0363010000123456',
            vbo_id: '0363010000123456',
            lookup_id: 'adr-abc123',
            reliability: 'resolved',
          },
          fallback_reason_code: null,
        }
        : status === 'manual_required'
          ? {
            status: 'manual_required',
            route: null,
            vbo_id: null,
            lookup_id: null,
            address_candidate: {
              address_id: null,
              vbo_id: null,
              lookup_id: null,
              reliability: 'unavailable',
            },
            candidate_addresses: [],
            fallback_reason_code: 'match.neighborhood.manual_address_required',
          }
          : {
          status: 'unavailable',
          route: null,
          vbo_id: null,
          lookup_id: null,
          address_candidate: {
            address_id: null,
            vbo_id: null,
            lookup_id: null,
            reliability: 'unavailable',
          },
          fallback_reason_code: 'match.neighborhood.no_reliable_address',
        };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ detail: 'unexpected' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function buildingCandidate(overrides: Partial<MatchNeighborhoodBuildingFeature> = {}): MatchNeighborhoodBuildingFeature {
  return {
    building_id: overrides.building_id ?? 'bldg_nh_amsterdam_ijburg_001',
    vbo_id: overrides.vbo_id === undefined ? '0363010000123456' : overrides.vbo_id,
    address_id: overrides.address_id === undefined ? '0363010000123456' : overrides.address_id,
    lookup_id: overrides.lookup_id === undefined ? 'adr-abc123' : overrides.lookup_id,
    footprint: overrides.footprint ?? {
      type: 'Polygon',
      coordinates: [[
        [4.999, 52.354],
        [5.001, 52.354],
        [5.001, 52.356],
        [4.999, 52.356],
        [4.999, 52.354],
      ]],
    },
    height_m: overrides.height_m ?? 11,
    source_refs: overrides.source_refs ?? ['seed_match_source'],
    address_resolution: overrides.address_resolution ?? 'resolved',
    address_candidate_count: overrides.address_candidate_count ?? 1,
    fallback_label_key: overrides.fallback_label_key ?? 'matchFirst.neighborhood.addressCandidate',
  };
}

function lod22BuildingCandidate(): MatchNeighborhoodBuildingFeature {
  return {
    ...buildingCandidate({
      building_id: 'bag_pand_0363100012253924',
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      height_m: 8.5,
      source_refs: ['3dbag_lod22'],
      address_resolution: 'candidate',
      address_candidate_count: 3,
    }),
    geometry_source: '3dbag_lod22',
    lod: '2.2',
    center_rd: { x: 126250, y: 486800 },
    footprint_rd: [
      [-15, -10],
      [12, -10],
      [12, 9],
      [-15, 9],
      [-15, -10],
    ],
    ground_height_m: 1.25,
    roof_surfaces: [
      [
        [-15, -10, 1.25],
        [12, -10, 1.25],
        [12, 9, 9.75],
        [-15, 9, 9.75],
      ],
      [
        [-15, -10, 1.25],
        [-15, 9, 9.75],
        [-15, 9, 1.25],
      ],
    ],
    orientation_deg: 90,
  } as MatchNeighborhoodBuildingFeature;
}

function offsetLod22BuildingCandidate(): MatchNeighborhoodBuildingFeature {
  return {
    ...lod22BuildingCandidate(),
    building_id: 'bag_pand_0363100012253999',
    footprint_rd: [
      [440, 340],
      [470, 340],
      [470, 370],
      [440, 370],
      [440, 340],
    ],
    roof_surfaces: [
      [
        [440, 340, 1.25],
        [470, 340, 1.25],
        [470, 370, 9.75],
        [440, 370, 9.75],
      ],
    ],
  } as MatchNeighborhoodBuildingFeature;
}

function tinyLod22BuildingCandidate(): MatchNeighborhoodBuildingFeature {
  return {
    ...lod22BuildingCandidate(),
    building_id: 'bag_pand_0363100012254001',
    footprint_rd: [
      [0, 0],
      [0.4, 0],
      [0.4, 0.4],
      [0, 0.4],
      [0, 0],
    ],
    roof_surfaces: [
      [
        [0, 0, 1.25],
        [0.4, 0, 1.25],
        [0.4, 0.4, 3.25],
        [0, 0.4, 3.25],
      ],
    ],
  } as MatchNeighborhoodBuildingFeature;
}

async function expectNoSeriousA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  const severe = results.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(severe).toHaveLength(0);
}

const HOUSE_FOOTPRINT_HIT_POINT = { clientX: 0, clientY: 0 };
const HOUSE_FOOTPRINT_HIT_POINT_UP = { clientX: 2, clientY: 1 };
const CENTRAL_MAP_POINT = { clientX: 320, clientY: 180 };
const CENTRAL_MAP_POINT_UP = { clientX: 322, clientY: 181 };

async function openHousePreviewAndView(_user: ReturnType<typeof userEvent.setup>, index = 1) {
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).not.toHaveAttribute('data-canvas-state', 'pending');
  });
  threeRendererStats.nextRaycastBuildingId ??= 'bag_pand_0363100012253924';
  const canvas = await screen.findByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { button: 0, ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { button: 0, ...HOUSE_FOOTPRINT_HIT_POINT_UP, pointerId: 1 });
  expect(await screen.findByRole('dialog', { name: `Selected house ${index}` })).toBeInTheDocument();
  await _user.click(screen.getByRole('button', { name: 'View house' }));
}

it('opens selected-neighborhood detail from a result card without rerunning matching', async () => {
  const user = userEvent.setup();
  const onOpenNeighborhood = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  renderWithI18n(
    <ResultsMap
      sessionId="match-detail"
      initialResults={resultsResponse()}
      onBackToSurvey={() => {}}
      onOpenNeighborhood={onOpenNeighborhood}
    />,
  );

  await user.click(within(screen.getByTestId('recommendation-card-rec_1')).getByRole('button', { name: 'View neighborhood' }));

  expect(onOpenNeighborhood).toHaveBeenCalledWith(expect.objectContaining({
    neighborhood_id: 'nh_amsterdam_ijburg',
  }));
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
  expect(stored).toMatchObject({
    selectedRecommendationId: 'rec_1',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    mapCenter: [52.355, 5],
    mapZoom: 12,
  });
});

it('loads boundary, scoped buildings, capped amenities, and missing-3D fallback for selected detail', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches();
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Selected neighborhood map' })).toHaveAttribute('data-boundary-ref', 'boundary_nh_amsterdam_ijburg');
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual([125450, 486000, 127050, 487600]);
  expect(await screen.findByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).toBeInTheDocument();
  expect(screen.getByTestId('amenity-tags').querySelectorAll('li')).toHaveLength(5);
  expect(screen.queryByTestId('house-selection-panel')).not.toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
});

it('renders a scoped Three.js building mode when selected-neighborhood footprints exist', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [buildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const layer = screen.getByTestId('neighborhood-building-layer');
  expect(layer).toHaveAttribute('data-render-mode', '3d');
  expect(layer).toHaveAttribute('data-rendered-buildings', '1');
  expect(screen.queryByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).not.toBeInTheDocument();
  expect(threeRendererStats.renderCount).toBeGreaterThan(0);

  const buildingCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes('/buildings'));
  expect(buildingCalls).toHaveLength(1);
  expect(String(buildingCalls[0]?.[0])).toContain('/api/match/neighborhoods/nh_amsterdam_ijburg/buildings');
  expect(boundsFromFetchCall(buildingCalls[0])).toEqual([125450, 486000, 127050, 487600]);
  expect(String(buildingCalls[0]?.[0])).not.toContain('0,300000,300000,650000');
  expect(String(buildingCalls[0]?.[0])).not.toContain('3.2,50.7,7.3,53.6');
});

it('renders selected-neighborhood 3DBAG LoD 2.2 surfaces instead of seed footprint extrusions', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const layer = screen.getByTestId('neighborhood-building-layer');
  expect(layer).toHaveAttribute('data-render-mode', '3d');
  expect(layer).toHaveAttribute('data-lod22-buildings', '1');
  expect(layer).toHaveAttribute('data-geometry-source', '3dbag_lod22');
  expect(threeRendererStats.bufferGeometryCalls).toBeGreaterThan(0);
  expect(threeRendererStats.float32BufferAttributeCalls).toBeGreaterThan(0);
  expect(threeRendererStats.extrudeGeometryCalls).toBe(0);
  expect(screen.queryByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).not.toBeInTheDocument();
});

it('renders scoped houses with the UX copper material instead of low-contrast teal', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  expect(threeRendererStats.meshStandardMaterials).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        color: 0xc36d4b,
        opacity: expect.any(Number),
      }),
    ]),
  );
});

it('retries selected-neighborhood 3D with a lighter WebGL context before falling back to 2D', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  threeRendererStats.failRendererWhenPreservingDrawingBuffer = true;
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const layer = screen.getByTestId('neighborhood-building-layer');
  expect(layer).toHaveAttribute('data-render-mode', '3d');
  expect(layer).toHaveAttribute('data-fallback-reason', 'none');
  expect(screen.queryByText('3D view is unavailable right now, so we are showing the neighborhood in 2D.')).not.toBeInTheDocument();
  expect(threeRendererStats.rendererOptions).toEqual([
    expect.objectContaining({ preserveDrawingBuffer: true }),
    expect.objectContaining({ preserveDrawingBuffer: false }),
  ]);
});

it('projects 3DBAG RD offsets through exact RD New coordinates before using the basemap', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  const projectedLatLngs: Array<[number, number]> = [];
  const originalLatLngToContainerPoint = L.Map.prototype.latLngToContainerPoint;
  vi.spyOn(L.Map.prototype, 'latLngToContainerPoint').mockImplementation(function latLngToContainerPointMock(
    this: L.Map,
    latlng: L.LatLngExpression,
  ) {
    const normalized = L.latLng(latlng);
    projectedLatLngs.push([normalized.lat, normalized.lng]);
    return originalLatLngToContainerPoint.call(this, latlng);
  });
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [offsetLod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  expect(projectedLatLngs.some(([lat, lng]) => (
    Math.abs(lat - 52.3714093) < 0.000001
    && Math.abs(lng - 4.9715075) < 0.000001
  ))).toBe(true);
});

it('keeps tiny projected 3DBAG houses at an inspectable screen size', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [tinyLod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const projectedPositions = threeRendererStats.bufferAttributePositions.find((positions) => positions.length === 12);
  expect(projectedPositions).toBeDefined();
  const xs = (projectedPositions ?? []).filter((_, index) => index % 3 === 0);
  const zs = (projectedPositions ?? []).filter((_, index) => index % 3 === 2);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(10);
  expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThanOrEqual(10);
});

it('projects scoped 3D buildings and amenity markers through the street basemap and routes wheel zoom to it', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  const zoomInSpy = vi.spyOn(L.Map.prototype, 'zoomIn');
  const zoomOutSpy = vi.spyOn(L.Map.prototype, 'zoomOut');
  const panBySpy = vi.spyOn(L.Map.prototype, 'panBy');
  const setMaxBoundsSpy = vi.spyOn(L.Map.prototype, 'setMaxBounds');
  mockNeighborhoodDetailFetches(resultsResponse(), {
    amenityPoints: amenityPoints(),
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [offsetLod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const layer = screen.getByTestId('neighborhood-building-layer');
  expect(layer).toHaveAttribute('data-overlay-projection', 'leaflet');
  expect(layer).toHaveAttribute('data-zoom-owner', 'basemap');
  expect(threeRendererStats.cameraTypes).toContain('orthographic');
  expect(threeRendererStats.orbitControls).toHaveLength(0);
  const cameraTarget = threeRendererStats.cameraLookAts[0];
  expect(cameraTarget).toBeDefined();
  expect(Math.abs(cameraTarget?.[0] ?? 0)).toBeLessThan(5);
  expect(Math.abs(cameraTarget?.[2] ?? 0)).toBeLessThan(5);
  expect(await screen.findByLabelText('Transit amenity marker')).toHaveAttribute('data-projection', 'leaflet');

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.wheel(canvas, { deltaY: -120 });
  expect(zoomInSpy).toHaveBeenCalledWith(0.5, { animate: true });
  fireEvent.wheel(canvas, { deltaY: 120 });
  expect(zoomOutSpy).toHaveBeenCalledWith(0.5, { animate: true });
  fireEvent.pointerDown(canvas, { clientX: 260, clientY: 180, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 218, clientY: 204, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 218, clientY: 204, pointerId: 1 });
  expect(panBySpy).toHaveBeenCalledWith([42, -24], { animate: false });
  expect(setMaxBoundsSpy).not.toHaveBeenCalled();
});

it('opens a house preview before the map CTA runs the Dossier bridge', async () => {
  const user = userEvent.setup();
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  threeRendererStats.nextRaycastBuildingId = 'bag_pand_0363100012253924';
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 8, clientY: 1, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 8, clientY: 1, pointerId: 1 });

  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);

  fireEvent.pointerDown(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT_UP, pointerId: 1 });

  expect(await screen.findByRole('dialog', { name: 'Selected house 1' })).toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);

  await user.click(screen.getByRole('button', { name: 'View house' }));

  await waitFor(() => {
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(true);
  });
});

it('removes the loaded-houses panel and instructs users to click houses on the map', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  threeRendererStats.nextRaycastBuildingId = 'bag_pand_0363100012253924';
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate(), offsetLod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  expect(screen.queryByText('Loaded houses')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Show house \d+ on map/ })).not.toBeInTheDocument();
  expect(screen.getByText('Click a house on the map to view details.')).toBeInTheDocument();

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT_UP, pointerId: 1 });

  expect(await screen.findByRole('dialog', { name: 'Selected house 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View house' })).toBeInTheDocument();
});

it('does not select an arbitrary house when clicking empty basemap space', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate(), offsetLod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { clientX: 620, clientY: 340, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 620, clientY: 340, pointerId: 1 });

  expect(screen.queryByRole('dialog', { name: /Selected house/ })).not.toBeInTheDocument();
});

it('does not select an arbitrary house when clicking central basemap space away from footprints', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [{
      ...lod22BuildingCandidate(),
      footprint: {
        type: 'Polygon',
        coordinates: [[
          [4.989, 52.354],
          [4.99, 52.354],
          [4.99, 52.355],
          [4.989, 52.355],
          [4.989, 52.354],
        ]],
      },
    }],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { ...CENTRAL_MAP_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { ...CENTRAL_MAP_POINT_UP, pointerId: 1 });

  expect(screen.queryByRole('dialog', { name: /Selected house/ })).not.toBeInTheDocument();
});

it('zooms the basemap to the selected house after a real map house click', async () => {
  document.documentElement.setAttribute('data-test-reduced-motion', 'false');
  enableWebGlCanvasMock();
  threeRendererStats.nextRaycastBuildingId = 'bag_pand_0363100012253924';
  const fitBoundsSpy = vi.spyOn(L.Map.prototype, 'fitBounds');
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [lod22BuildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'three');
  });
  fitBoundsSpy.mockClear();

  const canvas = screen.getByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { ...HOUSE_FOOTPRINT_HIT_POINT_UP, pointerId: 1 });

  expect(await screen.findByRole('dialog', { name: 'Selected house 1' })).toBeInTheDocument();
  await waitFor(() => {
    expect(fitBoundsSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        maxZoom: 19,
        padding: [80, 80],
      }),
    );
  });
});

it('keeps the localized 2D fallback usable when reduced motion is enabled with building footprints', async () => {
  mockNeighborhoodDetailFetches(resultsResponse(), {
    buildingLayerAvailable: true,
    buildingLayerFallbackReasonCode: null,
    buildingResponseFallbackReasonCode: null,
    buildings: [buildingCandidate()],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    const layer = screen.getByTestId('neighborhood-building-layer');
    expect(layer).toHaveAttribute('data-canvas-state', 'drawn');
    expect(layer).toHaveAttribute('data-fallback-reason', 'reduced_motion');
  });

  const layer = screen.getByTestId('neighborhood-building-layer');
  expect(layer).toHaveAttribute('data-render-mode', '2d');
  expect(await screen.findByText('Live 3D is paused because reduced motion is enabled, so we are showing the neighborhood in 2D.')).toBeInTheDocument();
  expect(threeRendererStats.renderCount).toBe(0);
});

it('toggles amenity filters with visible pressed state and stable analytics keys', async () => {
  const user = userEvent.setup();
  mockNeighborhoodDetailFetches(resultsResponse(), { amenityPoints: amenityPoints() });
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  const greenFilter = await screen.findByRole('button', { name: 'Filter by Parks / green space' });
  expect(greenFilter).toHaveAttribute('aria-pressed', 'false');

  await user.click(greenFilter);

  expect(greenFilter).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Showing Parks / green space context')).toBeInTheDocument();

  const events = JSON.parse(localStorage.getItem('buurt-check-match-first-analytics') ?? '[]') as Array<{
    event_name: string;
    context: Record<string, unknown>;
  }>;
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event_name: 'match_amenity_interacted',
      context: expect.objectContaining({
        amenity_key: 'parks_green',
        neighborhood_id: 'nh_amsterdam_ijburg',
        result_set_id: 'mrs_detail',
      }),
    }),
  ]));
  expect(JSON.stringify(events)).not.toContain('Parks / green space');

  await user.click(greenFilter);

  expect(greenFilter).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('Showing Parks / green space context')).not.toBeInTheDocument();
});

it('renders official amenity emoji badges and localized source details without inventing labels', async () => {
  const user = userEvent.setup();
  mockNeighborhoodDetailFetches(resultsResponse(), { amenityPoints: amenityPoints() });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  const expected = [
    ['transit', '🚉', 'Transit'],
    ['schools', '🏫', 'Schools'],
    ['childcare', '🧸', 'Childcare'],
    ['parks_green', '🌳', 'Parks / green space'],
    ['sports_fields', '⚽', 'Sports fields'],
  ] as const;

  for (const [category, emoji, label] of expected) {
    const marker = await screen.findByRole('button', { name: `${label} amenity marker` });
    expect(marker).toHaveTextContent(emoji);
    expect(marker).toHaveAttribute('data-amenity-key', category);
    expect(marker).toHaveAttribute('data-display-coordinate-system', 'WGS84');
  }

  await user.click(screen.getByRole('button', { name: 'Transit amenity marker' }));

  const dialog = await screen.findByRole('dialog', { name: 'Transit amenity details' });
  expect(dialog).toHaveTextContent('IJburglaan tram stop');
  expect(dialog).toHaveTextContent('Source: NDOV / REISinformatiegroep GTFS stops');
  expect(dialog).toHaveTextContent('Freshness: 2026-05-01');
  expect(dialog).toHaveTextContent('Coordinates: WGS84');
});

it('shows the official street basemap, labeled amenity points, and visible map zoom controls in selected detail', async () => {
  const user = userEvent.setup();
  const tileLayer = {
    addTo: vi.fn(() => tileLayer),
    remove: vi.fn(),
    on: vi.fn(() => tileLayer),
  };
  const tileLayerSpy = vi.spyOn(L, 'tileLayer').mockReturnValue(tileLayer as unknown as L.TileLayer);
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), { amenityPoints: amenityPoints() });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByText('What you see')).toBeInTheDocument();
  expect(screen.getByText('Official street map with labels, preference-matched amenities, and loaded houses inside this neighborhood.')).toBeInTheDocument();
  expect(await screen.findByTestId('neighborhood-street-basemap')).toBeInTheDocument();
  expect(screen.queryByTestId('neighborhood-street-layer')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith('/api/match/results-basemap', expect.objectContaining({
      credentials: 'include',
    }));
  });
  expect(tileLayerSpy).toHaveBeenCalledWith(
    'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
    expect.objectContaining({
      attribution: 'PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)',
      minZoom: 0,
      maxZoom: 19,
    }),
  );
  expect(screen.getByText('PDOK / Kadaster / BRT Achtergrondkaart (standaard WMTS)')).toBeInTheDocument();
  const greenMarker = await screen.findByRole('button', { name: 'Parks / green space amenity marker' });
  expect(greenMarker).toHaveTextContent('Parks / green space');
  expect(greenMarker).toHaveTextContent('82');
  expect(screen.getByLabelText('Schools amenity marker')).toHaveTextContent('Schools');
  expect(screen.getByRole('group', { name: 'Selected neighborhood map controls' })).toBeInTheDocument();
  const zoomInButton = screen.getByRole('button', { name: 'Zoom in' });
  const zoomOutButton = screen.getByRole('button', { name: 'Zoom out' });
  const resetButton = screen.getByRole('button', { name: 'Reset view' });
  expect(zoomInButton).toHaveTextContent('+');
  expect(zoomOutButton).toHaveTextContent('-');
  expect(resetButton).toHaveAttribute('aria-label', 'Reset view');
  expect(resetButton).not.toHaveTextContent('Reset view');
  expect(within(resetButton).getByTestId('neighborhood-reset-view-icon')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Filter by Parks / green space' }));

  expect(screen.getByLabelText('Parks / green space amenity marker')).toHaveAttribute('data-active', 'true');
  expect(screen.getByLabelText('Parks / green space amenity marker')).toHaveTextContent('Parks / green space');
  expect(screen.queryByLabelText('Schools amenity marker')).not.toBeInTheDocument();
});

it('keeps selected map and 2D fallback usable when amenity tags fail', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), { failAmenities: true });
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Selected neighborhood map' })).toHaveAttribute('data-display-bounds-wgs84', '4.988,52.347,5.012,52.363');
  });
  expect(await screen.findByText('Amenity tags are unavailable right now.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual([125450, 486000, 127050, 487600]);
  expect(await screen.findByText('3D buildings are not available here yet, so we are showing the neighborhood in 2D.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
});

it('uses the exact selected-neighborhood layer bounds for building requests', async () => {
  const allowedBoundsRd: [number, number, number, number] = [124999.5, 485900.25, 126600.75, 487501.5];
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse(), { allowedBoundsRd });
  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });

  const buildingCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/buildings'));
  expect(boundsFromFetchCall(buildingCall)).toEqual(allowedBoundsRd);
});

it('preserves selected-neighborhood map state for later return and keeps list fallback accessible', async () => {
  mockNeighborhoodDetailFetches();
  const { container } = renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
    expect(stored).toMatchObject({
      selectedNeighborhoodId: 'nh_amsterdam_ijburg',
      selectedResultRank: 1,
      mapZoom: 14,
    });
  });
  expect(screen.queryByTestId('house-selection-panel')).not.toBeInTheDocument();
  expect(screen.getByText('Click a house on the map to view details.')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).toHaveAttribute('data-canvas-state', 'drawn');
  });
  await expectNoSeriousA11yViolations(container);
});

it('preserves exact returned map and list state when reopening selected-neighborhood detail', async () => {
  await i18n.changeLanguage('nl');
  sessionStorage.setItem(getMatchResultsMapStateStorageKey('match-detail'), JSON.stringify({
    sessionId: 'match-detail',
    jobId: 'match_job_detail',
    resultSetId: 'mrs_detail',
    preferenceVectorVersion: 'pv_v1_detail',
    selectedRecommendationId: 'rec_1',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    selectedResultRank: 1,
    selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
    mapCenter: [52.36, 4.9],
    mapZoom: 13,
    listScroll: 240,
    mobileMode: 'list',
    locale: 'nl',
  }));
  mockNeighborhoodDetailFetches();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={resultsResponse()}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'IJburg' })).toBeInTheDocument();
  await waitFor(() => {
    const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
    expect(stored).toMatchObject({
      sessionId: 'match-detail',
      jobId: 'match_job_detail',
      resultSetId: 'mrs_detail',
      preferenceVectorVersion: 'pv_v1_detail',
      selectedNeighborhoodId: 'nh_amsterdam_ijburg',
      selectedRecommendationId: 'rec_1',
      selectedResultRank: 1,
      selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
      mapCenter: [52.36, 4.9],
      mapZoom: 13,
      listScroll: 240,
      mobileMode: 'list',
      locale: 'nl',
    });
  });
});

it('opens a reliable house candidate in the Dossier without rerunning matching', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const building = buildingCandidate();
  const secondBuilding = buildingCandidate({
    building_id: 'bldg_nh_amsterdam_ijburg_002',
    vbo_id: '0363010000123457',
    address_id: '0363010000123457',
    lookup_id: 'adr-def456',
  });
  const onOpenDossier = vi.fn(() => true);
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [building, secondBuilding],
    dossierBridgeRoute: '#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail',
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
    />,
  );

  expect(screen.queryByText('Loaded houses')).not.toBeInTheDocument();
  expect(screen.queryByText('House selection')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Dossier for house 1' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show house 1 on map' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show house 2 on map' })).not.toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-building-layer')).not.toHaveAttribute('data-canvas-state', 'pending');
  });
  const canvas = await screen.findByTestId('neighborhood-building-canvas');
  fireEvent.pointerDown(canvas, { button: 0, ...HOUSE_FOOTPRINT_HIT_POINT, pointerId: 1 });
  fireEvent.pointerUp(canvas, { button: 0, ...HOUSE_FOOTPRINT_HIT_POINT_UP, pointerId: 1 });
  expect(await screen.findByRole('dialog', { name: 'Selected house 1' })).toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(false);
  await user.click(screen.getByRole('button', { name: 'View house' }));

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000123456?lookup=adr-abc123&match_session=match-detail');
  });
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('match_dossier_opened');
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const dossierCall = fetchSpy.mock.calls.find(([input]) => String(input).includes('/dossier/from-building'));
  expect(dossierCall).toBeDefined();
  const bridgePayload = JSON.parse(String((dossierCall?.[1] as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>;
  expect(bridgePayload).toMatchObject({
    session_id: 'match-detail',
    neighborhood_id: 'nh_amsterdam_ijburg',
    building_id: 'bldg_nh_amsterdam_ijburg_001',
    address_id: '0363010000123456',
    vbo_id: '0363010000123456',
    lookup_id: 'adr-abc123',
  });
  expect(bridgePayload.return_context).toMatchObject({
    session_id: 'match-detail',
    job_id: 'match_job_detail',
    result_set_id: 'mrs_detail',
    preference_vector_version: 'pv_v1_detail',
    source: 'match_map',
    return_url: '#/match/session/match-detail/neighborhood/nh_amsterdam_ijburg',
    map_center: [52.355, 5],
    map_zoom: 14,
    list_scroll: 0,
    mobile_mode: 'map',
    selected_result_id: 'rec_1',
    selected_result_rank: 1,
    language: 'en',
    selected_house_id: 'bldg_nh_amsterdam_ijburg_001',
  });
  const stored = JSON.parse(sessionStorage.getItem(getMatchResultsMapStateStorageKey('match-detail')) ?? '{}') as Record<string, unknown>;
  expect(stored).toMatchObject({
    sessionId: 'match-detail',
    jobId: 'match_job_detail',
    resultSetId: 'mrs_detail',
    preferenceVectorVersion: 'pv_v1_detail',
    selectedNeighborhoodId: 'nh_amsterdam_ijburg',
    selectedRecommendationId: 'rec_1',
    selectedResultRank: 1,
    selectedHouseId: 'bldg_nh_amsterdam_ijburg_001',
    mapCenter: [52.355, 5],
    mapZoom: 14,
    mobileMode: 'map',
    locale: 'en',
  });
});

it('renders candidate address choices and resolves the selected candidate without rerunning matching', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const building = buildingCandidate({
    vbo_id: null,
    address_id: null,
    lookup_id: null,
    address_resolution: 'candidate',
    address_candidate_count: 2,
  });
  const onOpenDossier = vi.fn(() => true);
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [building],
    dossierBridgeResponses: [
      {
        body: {
          status: 'candidates',
          route: null,
          vbo_id: null,
          lookup_id: null,
          address_candidate: {
            address_id: null,
            vbo_id: null,
            lookup_id: null,
            reliability: 'candidate',
          },
          candidate_addresses: [
            {
              candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_1',
              address_id: '0363010000987651',
              vbo_id: '0363010000987651',
              lookup_id: 'adr-provider-1',
              display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
              display_params: { index: '1', label: 'IJburglaan 1000, 1087JK Amsterdam' },
              reliability: 'candidate',
              source_refs: ['pdok_locatieserver_reverse', 'seed_match_source'],
              fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
            },
            {
              candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_2',
              address_id: '0363010000987652',
              vbo_id: '0363010000987652',
              lookup_id: 'adr-provider-2',
              display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidateWithLabel',
              display_params: { index: '2', label: 'IJburglaan 1002, 1087JK Amsterdam' },
              reliability: 'candidate',
              source_refs: ['pdok_locatieserver_reverse', 'seed_match_source'],
              fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
            },
          ],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      {
        body: {
          status: 'resolved',
          route: '#/address/0363010000987652?lookup=adr-provider-2&match_session=match-detail',
          vbo_id: '0363010000987652',
          lookup_id: 'adr-provider-2',
          address_candidate: {
            address_id: '0363010000987652',
            vbo_id: '0363010000987652',
            lookup_id: 'adr-provider-2',
            reliability: 'candidate',
          },
          candidate_addresses: [],
          fallback_reason_code: null,
        },
      },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
    />,
  );

  await openHousePreviewAndView(user);

  const candidateOne = await screen.findByRole('button', {
    name: 'Choose Nearby address 1: IJburglaan 1000, 1087JK Amsterdam for house 1',
  });
  const candidateTwo = screen.getByRole('button', {
    name: 'Choose Nearby address 2: IJburglaan 1002, 1087JK Amsterdam for house 1',
  });
  expect(candidateOne).toHaveAccessibleDescription(
    'Address candidate. Source: pdok_locatieserver_reverse, seed_match_source.',
  );
  expect(candidateTwo).toHaveAccessibleDescription(
    'Address candidate. Source: pdok_locatieserver_reverse, seed_match_source.',
  );
  candidateTwo.focus();
  await user.keyboard('{Enter}');

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000987652?lookup=adr-provider-2&match_session=match-detail');
  });
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/run'))).toBe(false);
  const bridgeCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes('/dossier/from-building'));
  expect(bridgeCalls).toHaveLength(2);
  const selectedCandidatePayload = JSON.parse(String((bridgeCalls[1]?.[1] as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>;
  expect(selectedCandidatePayload).toMatchObject({
    session_id: 'match-detail',
    neighborhood_id: 'nh_amsterdam_ijburg',
    building_id: 'bldg_nh_amsterdam_ijburg_001',
    selected_candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_adr_provider_2',
  });
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('cand_bldg');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('0363010000987652');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('adr-provider-2');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('Nearby address');
});

it('keeps candidate address controls keyboard usable with translated copy and recovery actions', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const onOpenDossier = vi.fn(() => true);
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 1,
    })],
    dossierBridgeResponses: [
      {
        body: {
          status: 'candidates',
          route: null,
          vbo_id: null,
          lookup_id: null,
          address_candidate: {
            address_id: null,
            vbo_id: null,
            lookup_id: null,
            reliability: 'candidate',
          },
          candidate_addresses: [{
            candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_001',
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidate',
            display_params: { index: '1' },
            reliability: 'candidate',
            source_refs: ['seed_match_source'],
            fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
          }],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      {
        body: {
          status: 'resolved',
          route: '#/address/0363010000123461?lookup=adr-candidate-001&match_session=match-detail',
          vbo_id: '0363010000123461',
          lookup_id: 'adr-candidate-001',
          address_candidate: {
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            reliability: 'candidate',
          },
          candidate_addresses: [],
          fallback_reason_code: null,
        },
      },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await openHousePreviewAndView(user);

  const housePopup = await screen.findByRole('dialog', { name: 'Selected house 1' });
  expect(within(housePopup).getByRole('button', { name: 'Search manually' })).toBeInTheDocument();
  expect(within(housePopup).getByRole('button', { name: 'Back to results' })).toBeInTheDocument();
  const candidate = within(housePopup).getByRole('button', { name: 'Choose Nearby address 1 for house 1' });
  candidate.focus();
  await user.keyboard(' ');

  await waitFor(() => {
    expect(onOpenDossier).toHaveBeenCalledWith('#/address/0363010000123461?lookup=adr-candidate-001&match_session=match-detail');
  });
});

it('shows stale result recovery when a selected candidate address becomes stale', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 1,
    })],
    dossierBridgeResponses: [
      {
        body: {
          status: 'candidates',
          route: null,
          vbo_id: null,
          lookup_id: null,
          address_candidate: {
            address_id: null,
            vbo_id: null,
            lookup_id: null,
            reliability: 'candidate',
          },
          candidate_addresses: [{
            candidate_id: 'cand_bldg_nh_amsterdam_ijburg_001_001',
            address_id: '0363010000123461',
            vbo_id: '0363010000123461',
            lookup_id: 'adr-candidate-001',
            display_label_key: 'matchFirst.neighborhood.nearbyAddressCandidate',
            display_params: { index: '1' },
            reliability: 'candidate',
            source_refs: ['seed_match_source'],
            fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
          }],
          fallback_reason_code: 'match.neighborhood.address_candidate_selection_required',
        },
      },
      { status: 409, body: { detail: 'match.results.stale' } },
    ],
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
    />,
  );

  await openHousePreviewAndView(user);
  await user.click(await screen.findByRole('button', { name: 'Choose Nearby address 1 for house 1' }));

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('No reliable house candidate is available yet.')).not.toBeInTheDocument();
});

it('keeps manual search and back recovery when the bridge requires manual address entry', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'manual_required',
      address_candidate_count: 0,
    })],
    dossierBridgeStatus: 'manual_required',
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={() => true}
      onSearchManually={onSearchManually}
    />,
  );

  await openHousePreviewAndView(user);

  const housePopup = await screen.findByRole('dialog', { name: 'Selected house 1' });
  expect(housePopup).toHaveTextContent('Choose an address manually to open the Dossier.');
  await user.click(within(housePopup).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePopup).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
});

it('shows recovery and skips Dossier-open analytics when App rejects a resolved bridge route', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate()],
    dossierBridgeRoute: '#/match/session/match-detail/results',
  });
  const onOpenDossier = vi.fn(() => false);
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await openHousePreviewAndView(user);

  const housePopup = await screen.findByRole('dialog', { name: 'Selected house 1' });
  expect(housePopup).toHaveTextContent('No reliable house candidate is available yet.');
  expect(JSON.stringify(localStorage.getItem('buurt-check-match-first-analytics'))).not.toContain('match_dossier_opened');
  await user.click(within(housePopup).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePopup).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
});

it('keeps selected-house popup recovery controls at mobile touch target size', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/NeighborhoodDetail.css'),
    'utf8',
  );

  expect(css).toMatch(/\.house-selection__candidate-list button\s*\{[\s\S]*min-height:\s*44px/);
  expect(css).toMatch(/\.house-selection__candidate-list button:focus-visible\s*\{/);
  expect(css).toMatch(/\.house-selection__actions button\s*\{[\s\S]*min-height:\s*44px/);
  expect(css).toMatch(/\.house-selection__actions button:focus-visible\s*\{/);
});

it('keeps candidate address production copy behind translation keys', () => {
  const panelSource = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/HouseSelectionPanel.tsx'),
    'utf8',
  );
  const detailSource = readFileSync(
    resolve(process.cwd(), 'src/components/match-first/NeighborhoodDetail.tsx'),
    'utf8',
  );

  expect(panelSource).not.toContain('Nearby address');
  expect(panelSource).not.toContain('Choose an address');
  expect(detailSource).not.toContain('Nearby address');
  expect(detailSource).not.toContain('Choose an address');
});

it('keeps the selected-neighborhood detail in place when a house has no reliable Dossier address', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  const fetchSpy = mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate({
      vbo_id: null,
      address_id: null,
      lookup_id: null,
      address_resolution: 'candidate',
      address_candidate_count: 0,
    })],
    dossierBridgeStatus: 'unavailable',
  });
  const onOpenDossier = vi.fn();
  const onBackToResults = vi.fn();
  const onSearchManually = vi.fn();

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={onBackToResults}
      onBackToSurvey={() => {}}
      onOpenDossier={onOpenDossier}
      onSearchManually={onSearchManually}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });
  await openHousePreviewAndView(user);

  const housePopup = await screen.findByRole('dialog', { name: 'Selected house 1' });
  expect(housePopup).toHaveTextContent('No reliable house candidate is available yet.');
  await user.click(within(housePopup).getByRole('button', { name: 'Search manually' }));
  expect(onSearchManually).toHaveBeenCalledTimes(1);
  await user.click(within(housePopup).getByRole('button', { name: 'Back to results' }));
  expect(onBackToResults).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-neighborhood-id', 'nh_amsterdam_ijburg');
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/dossier/from-building'))).toBe(true);
  expect(onOpenDossier).not.toHaveBeenCalled();
});

it('shows stale result recovery when the Dossier bridge rejects stale context', async () => {
  const user = userEvent.setup();
  const results = resultsResponse();
  mockNeighborhoodDetailFetches(results, {
    buildings: [buildingCandidate()],
    dossierBridgeError: 'match.results.stale',
    dossierBridgeStatusCode: 409,
  });

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_amsterdam_ijburg"
      initialResults={results}
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
      onOpenDossier={() => {}}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('neighborhood-detail')).toHaveAttribute('data-building-requested', 'true');
  });
  await openHousePreviewAndView(user);

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('No reliable house candidate is available yet.')).not.toBeInTheDocument();
});

it('shows an empty unavailable state without building requests when the neighborhood is absent from completed results', async () => {
  const fetchSpy = mockNeighborhoodDetailFetches(resultsResponse({
    ranked_results: [],
    recommendations: [],
    normal_recommendation_count: 0,
    near_misses: [],
  }));

  renderWithI18n(
    <NeighborhoodDetail
      sessionId="match-detail"
      neighborhoodId="nh_missing"
      onBackToResults={() => {}}
      onBackToSurvey={() => {}}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Results unavailable' })).toBeInTheDocument();
  expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/buildings'))).toBe(false);
});
