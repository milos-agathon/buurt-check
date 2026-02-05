import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import {
  makeBuildingResponse,
  makeNeighborhood3DResponse,
  makeResolvedAddress,
  makeRiskCardsResponse,
  makeSuggestion,
  setupTestI18n,
} from './test/helpers';

vi.mock('./services/api', () => ({
  suggestAddresses: vi.fn(),
  lookupAddress: vi.fn(),
  getBuildingFacts: vi.fn(),
  getNeighborhood3D: vi.fn(),
  getRiskCards: vi.fn(),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  GeoJSON: () => null,
}));

vi.mock('./components/NeighborhoodViewer3D', () => ({
  default: ({ buildings }: { buildings: unknown[] }) => (
    <div data-testid="viewer-3d">3D Viewer ({buildings.length} buildings)</div>
  ),
}));

vi.mock('./components/SunlightRiskCard', () => ({
  default: ({ loading, unavailable }: { loading?: boolean; unavailable?: boolean }) => (
    <div data-testid="sunlight-card">
      {loading ? 'Loading sunlight...' : unavailable ? 'Sunlight unavailable' : 'Sunlight card'}
    </div>
  ),
}));

vi.mock('./components/RiskCardsPanel', () => ({
  default: ({ loading }: { loading?: boolean }) => (
    <div data-testid="risk-cards">{loading ? 'Loading risk cards...' : 'Risk cards'}</div>
  ),
}));

import { lookupAddress, getBuildingFacts, suggestAddresses, getNeighborhood3D, getRiskCards } from './services/api';
const mockLookup = vi.mocked(lookupAddress);
const mockBuilding = vi.mocked(getBuildingFacts);
const mockSuggest = vi.mocked(suggestAddresses);
const mockNeighborhood3D = vi.mocked(getNeighborhood3D);
const mockRiskCards = vi.mocked(getRiskCards);

let i18nInstance: Awaited<ReturnType<typeof setupTestI18n>>;

beforeAll(async () => {
  i18nInstance = await setupTestI18n('en');
});

beforeEach(() => {
  mockLookup.mockReset();
  mockBuilding.mockReset();
  mockSuggest.mockReset();
  mockNeighborhood3D.mockReset();
  mockRiskCards.mockReset();
  mockRiskCards.mockResolvedValue(makeRiskCardsResponse());
});

function renderApp() {
  return render(
    <I18nextProvider i18n={i18nInstance}>
      <App />
    </I18nextProvider>,
  );
}

/**
 * Simulates selecting an address: type query, trigger debounce, click suggestion.
 * Uses fake timers briefly to advance the 300ms debounce, then restores real timers
 * so waitFor can poll normally for async state updates.
 */
async function selectAddress() {
  const suggestion = makeSuggestion();
  mockSuggest.mockResolvedValue({ suggestions: [suggestion] });

  vi.useFakeTimers();
  const input = screen.getByRole('textbox');
  await act(async () => {
    fireEvent.change(input, { target: { value: 'keizersgracht' } });
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
  vi.useRealTimers();

  await waitFor(() => {
    expect(screen.getByRole('option')).toBeInTheDocument();
  });
  await act(async () => {
    fireEvent.mouseDown(screen.getByRole('option'));
  });
}

describe('initial render', () => {
  it('renders app title and search input', () => {
    renderApp();
    expect(screen.getByText('buurt-check')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not render building card or map', () => {
    renderApp();
    expect(screen.queryByText('Building Facts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });
});

describe('address selection flow', () => {
  it('calls lookupAddress then getBuildingFacts on selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith(makeSuggestion().id);
    });
    await waitFor(() => {
      expect(mockBuilding).toHaveBeenCalledWith('vbo-123');
    });
    await waitFor(() => {
      expect(mockRiskCards).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state while fetching', async () => {
    mockLookup.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading building facts...')).toBeInTheDocument();
    });
  });

  it('shows risk loading state while risk cards are fetching', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading risk cards...')).toBeInTheDocument();
    });
  });

  it('renders building facts after successful fetch', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
      expect(screen.getByText('0363100012345678')).toBeInTheDocument();
    });
  });

  it('skips getBuildingFacts when no vbo_id', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress({ adresseerbaar_object_id: undefined }));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalled();
    });
    expect(mockBuilding).not.toHaveBeenCalled();
  });

  it('passes only vboId to getBuildingFacts', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(mockBuilding).toHaveBeenCalledTimes(1);
    });
    expect(mockBuilding).toHaveBeenCalledWith('vbo-123');
  });
});

describe('error handling', () => {
  it('shows error when lookupAddress fails', async () => {
    mockLookup.mockRejectedValue(new Error('Lookup failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error when getBuildingFacts fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockRejectedValue(new Error('Building failed'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('clears error on new selection', async () => {
    mockLookup.mockRejectedValueOnce(new Error('fail'));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });

    // Second selection succeeds
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    await selectAddress();

    await waitFor(() => {
      expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
    });
  });

  it('does not crash when getRiskCards fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockRiskCards.mockRejectedValue(new Error('Risk API down'));

    renderApp();
    await selectAddress();

    // Should still render building facts card without error
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    // No error shown to user for risk cards failure
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });

  it('clears previous building data on new selection', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('0363100012345678')).toBeInTheDocument();
    });

    // New selection — building data should be cleared during loading
    mockLookup.mockReturnValue(new Promise(() => {}));
    await selectAddress();

    await waitFor(() => {
      expect(screen.queryByText('0363100012345678')).not.toBeInTheDocument();
    });
  });
});

describe('map rendering', () => {
  it('renders map when lat/lng present', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('map')).toBeInTheDocument();
    });
  });
});

describe('3D viewer integration', () => {
  it('renders 3D viewer when neighborhood data is available', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByTestId('viewer-3d')).toBeInTheDocument();
      expect(screen.getByText(/2 buildings/)).toBeInTheDocument();
    });
  });

  it('does not crash when getNeighborhood3D fails', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockRejectedValue(new Error('3DBAG down'));

    renderApp();
    await selectAddress();

    // Should still render building facts card without error
    await waitFor(() => {
      expect(screen.getByText('Building Facts')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument();
    // No error shown to user for 3D failure
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
    // Loading indicator should not be stuck after failure
    expect(screen.queryByText('Loading 3D data...')).not.toBeInTheDocument();
  });

  it('shows loading message while 3D data is fetching', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    // Never-resolving promise to keep loading state active
    mockNeighborhood3D.mockReturnValue(new Promise(() => {}));

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading 3D data...')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument();
  });

  it('shows no-data message when 3D returns empty buildings', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('No 3D building data available.')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument();
  });

  it('shows sunlight unavailable when 3D returns empty buildings', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(
      makeNeighborhood3DResponse({ buildings: [], target_pand_id: undefined }),
    );

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Sunlight unavailable')).toBeInTheDocument();
    });
    // Should NOT show loading spinner
    expect(screen.queryByText('Loading sunlight...')).not.toBeInTheDocument();
  });

  it('shows sunlight loading when 3D has buildings and sunlight pending', async () => {
    mockLookup.mockResolvedValue(makeResolvedAddress());
    mockBuilding.mockResolvedValue(makeBuildingResponse());
    mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

    renderApp();
    await selectAddress();

    await waitFor(() => {
      expect(screen.getByText('Loading sunlight...')).toBeInTheDocument();
    });
  });
});
