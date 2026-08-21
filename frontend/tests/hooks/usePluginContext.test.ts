import { renderHook } from '@testing-library/react';
import type { LngLat, MapGeoJSONFeature } from 'maplibre-gl';
import { usePluginContext } from 'hooks/usePluginContext';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import usePluginConfig from 'hooks/usePluginConfig';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('hooks/useAvailabilityMap', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

// Only useAvailabilityMap/useAuthContext are actually invoked by usePluginContext;
// the rest are mocked purely to avoid pulling in their real (heavy) module graphs
// at import time — none of these are exercised by the tests below.
jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useDataFilterQuery', () => ({ useDataFilterQuery: jest.fn() }));
jest.mock('hooks/useFilteredCoverageQuery', () => ({ useFilteredCoverageQuery: jest.fn() }));
jest.mock('hooks/usePropertiesCategories', () => ({ usePropertiesCategories: jest.fn() }));
jest.mock('hooks/useRaster', () => ({ useRaster: jest.fn() }));
jest.mock('hooks/useSoilData', () => ({ useSoilData: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));
// usePluginConfig transitively imports useConfig -> App -> i18n's real (heavy) module
// graph; mock it like the other host hooks above so importing usePluginContext stays cheap.
jest.mock('hooks/usePluginConfig', () => ({ __esModule: true, default: jest.fn() }));

const useAvailabilityMapMock = useAvailabilityMap as jest.MockedFunction<typeof useAvailabilityMap>;
const useAuthContextMock = useAuthContext as jest.MockedFunction<typeof useAuthContext>;

const MOCK_AVAILABILITY_MAP = {
  selectedPoint: null,
  selectedH3Cell: null,
  h3Cells: null,
  emptySelection: { type: 'FeatureCollection', features: [] },
  selection: { type: 'FeatureCollection', features: [] },
  showDrawControl: false,
  showSelectionToolbar: false,
  boundingBox: [0, 0, 1, 1] as [number, number, number, number],
  geometryFilter: [],
  selectionType: 'drawn-polygon' as const,
  locationName: undefined,
  isDaiEnabled: false,
  daiOpacity: 80,
  setSelectedPoint: jest.fn(),
  setSelectedH3Cell: jest.fn(),
  setH3Cells: jest.fn(),
  setSelection: jest.fn(),
  setShowDrawControl: jest.fn(),
  setShowSelectionToolbar: jest.fn(),
  setBoundingBox: jest.fn(),
  setGeometryFilter: jest.fn(),
  setSelectionType: jest.fn(),
  setLocationName: jest.fn(),
  setIsDaiEnabled: jest.fn(),
  setDaiOpacity: jest.fn(),
};

const MOCK_AUTH_CONTEXT = {
  isEmailBasedAuth: false,
  isAuthenticated: false,
  isLoading: false,
  login: jest.fn(),
  logout: jest.fn(),
  authMode: 'NONE',
};

describe('usePluginContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAvailabilityMapMock.mockReturnValue(MOCK_AVAILABILITY_MAP);
    useAuthContextMock.mockReturnValue({ ...MOCK_AUTH_CONTEXT, user: null });
  });

  it('passes usePluginConfig through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfig).toBe(usePluginConfig);
  });

  it('narrows user to profile name/email only, never leaking tokens', () => {
    useAuthContextMock.mockReturnValue({
      ...MOCK_AUTH_CONTEXT,
      isAuthenticated: true,
      user: {
        access_token: 'secret-access-token',
        refresh_token: 'secret-refresh-token',
        id_token: 'secret-id-token',
        profile: { name: 'Ada Lovelace', email: 'ada@example.com', sub: 'user-123' },
      },
    });

    const { result } = renderHook(() => usePluginContext());

    expect(result.current.user).toEqual({ profile: { name: 'Ada Lovelace', email: 'ada@example.com' } });
    expect(JSON.stringify(result.current.user)).not.toContain('secret-');
  });

  it('maps mapSelection with null-safety and narrows selectedH3Cell/features to plain data', () => {
    const { result: emptyResult } = renderHook(() => usePluginContext());

    expect(emptyResult.current.mapSelection?.selectedPoint).toBeNull();
    expect(emptyResult.current.mapSelection?.selectedH3Cell).toBeNull();

    useAvailabilityMapMock.mockReturnValue({
      ...MOCK_AVAILABILITY_MAP,
      selectedPoint: { lng: 1, lat: 2 } as unknown as LngLat,
      selectedH3Cell: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [1, 2] },
        properties: { foo: 'bar' },
        id: 'h3-cell-id',
        layer: {},
        source: 'h3-source',
        sourceLayer: 'h3-source-layer',
        state: {},
      } as unknown as MapGeoJSONFeature,
      selection: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [3, 4] }, properties: { baz: 'qux' }, id: 'ignored' }],
      },
    });

    const { result } = renderHook(() => usePluginContext());

    expect(result.current.mapSelection?.selectedPoint).toEqual({ lng: 1, lat: 2 });
    expect(result.current.mapSelection?.selectedH3Cell).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: { foo: 'bar' },
    });
    expect(result.current.mapSelection?.selection.features).toEqual([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [3, 4] }, properties: { baz: 'qux' } },
    ]);
  });
});
