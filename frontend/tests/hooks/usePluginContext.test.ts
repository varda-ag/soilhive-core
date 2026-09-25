import { renderHook } from '@testing-library/react';
import type { LngLat, MapGeoJSONFeature } from 'maplibre-gl';
import { usePluginContext } from 'hooks/usePluginContext';
import useAvailabilityData from 'hooks/useAvailabilityData';
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import usePluginConfig from 'hooks/usePluginConfig';
import usePluginConfigs from 'hooks/usePluginConfigs';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from 'hooks/usePluginConfigEntitlements';
import { usePluginUserEntitlements } from 'hooks/usePluginUserEntitlements';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('hooks/useAvailabilityMap', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useAvailabilityData', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

// Only useAvailabilityMap/useAvailabilityData/useAuthContext are actually invoked by
// usePluginContext; the rest are mocked purely to avoid pulling in their real (heavy)
// module graphs at import time — none of these are exercised by the tests below.
jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useDataFilterQuery', () => ({ useDataFilterQuery: jest.fn() }));
jest.mock('hooks/useFilteredCoverageQuery', () => ({ useFilteredCoverageQuery: jest.fn() }));
jest.mock('hooks/useSoilData', () => ({ useSoilData: jest.fn() }));
// usePluginConfig transitively imports useConfig -> App -> i18n's real (heavy) module
// graph; mock it like the other host hooks above so importing usePluginContext stays cheap.
jest.mock('hooks/usePluginConfig', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/usePluginConfigs', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/usePluginConfigEntitlements', () => ({
  usePluginConfigEntitlements: jest.fn(),
  usePluginConfigEntitlementsMutation: jest.fn(),
}));
jest.mock('hooks/usePluginUserEntitlements', () => ({ usePluginUserEntitlements: jest.fn() }));

const useAvailabilityMapMock = useAvailabilityMap as jest.MockedFunction<typeof useAvailabilityMap>;
const useAvailabilityDataMock = useAvailabilityData as jest.MockedFunction<typeof useAvailabilityData>;
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

const MOCK_AVAILABILITY_DATA = {
  soilProperties: [{ id: 'soil-property-1' }],
  isLoadingSoilProperties: false,
  categories: [{ id: 'category-1' }],
  isLoadingCategories: false,
  rasterCategories: [{ id: 'raster-category-1' }],
  isLoadingRasterCategories: false,
  visibleDatasets: [{ id: 'dataset-1' }],
  isLoadingVisibleDatasets: false,
  setAvailabilityData: jest.fn(),
};

describe('usePluginContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAvailabilityMapMock.mockReturnValue(MOCK_AVAILABILITY_MAP);
    useAvailabilityDataMock.mockReturnValue(MOCK_AVAILABILITY_DATA as unknown as ReturnType<typeof useAvailabilityData>);
    useAuthContextMock.mockReturnValue({ ...MOCK_AUTH_CONTEXT, user: null });
  });

  it('passes usePluginConfig through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfig).toBe(usePluginConfig);
  });

  it('passes usePluginConfigs through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigs).toBe(usePluginConfigs);
  });

  it('passes usePluginConfigEntitlements through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigEntitlements).toBe(usePluginConfigEntitlements);
  });

  it('passes usePluginConfigEntitlementsMutation through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigEntitlementsMutation).toBe(usePluginConfigEntitlementsMutation);
  });

  it('passes usePluginUserEntitlements through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginUserEntitlements).toBe(usePluginUserEntitlements);
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

  it('useSoilProperties reads soil properties from the lifted AvailabilityDataContext instead of fetching its own', () => {
    const { result } = renderHook(() => usePluginContext());
    const { result: soilProperties } = renderHook(() => result.current.useSoilProperties());

    expect(soilProperties.current).toEqual({ data: MOCK_AVAILABILITY_DATA.soilProperties, isLoading: false, isError: false });
  });

  it('usePropertiesCategories reads categories from the lifted AvailabilityDataContext instead of fetching its own', () => {
    const { result } = renderHook(() => usePluginContext());
    const { result: categories } = renderHook(() => result.current.usePropertiesCategories());

    expect(categories.current).toEqual({ data: MOCK_AVAILABILITY_DATA.categories, isLoading: false, isError: false });
  });

  it('useRasterCategories reads raster categories from the lifted AvailabilityDataContext instead of fetching its own', () => {
    const { result } = renderHook(() => usePluginContext());
    const { result: rasterCategories } = renderHook(() => result.current.useRasterCategories());

    expect(rasterCategories.current).toEqual({ data: MOCK_AVAILABILITY_DATA.rasterCategories, isLoading: false, isError: false });
  });

  it('useVisibleDatasets reads visible datasets from the lifted AvailabilityDataContext', () => {
    const { result } = renderHook(() => usePluginContext());
    const { result: visibleDatasets } = renderHook(() => result.current.useVisibleDatasets());

    expect(visibleDatasets.current).toEqual({ data: MOCK_AVAILABILITY_DATA.visibleDatasets, isLoading: false, isError: false });
  });

  it('propagates loading flags from AvailabilityDataContext for soil properties, categories, raster categories and visible datasets', () => {
    useAvailabilityDataMock.mockReturnValue({
      ...MOCK_AVAILABILITY_DATA,
      isLoadingSoilProperties: true,
      isLoadingCategories: true,
      isLoadingRasterCategories: true,
      isLoadingVisibleDatasets: true,
    } as unknown as ReturnType<typeof useAvailabilityData>);

    const { result } = renderHook(() => usePluginContext());

    expect(renderHook(() => result.current.useSoilProperties()).result.current.isLoading).toBe(true);
    expect(renderHook(() => result.current.usePropertiesCategories()).result.current.isLoading).toBe(true);
    expect(renderHook(() => result.current.useRasterCategories()).result.current.isLoading).toBe(true);
    expect(renderHook(() => result.current.useVisibleDatasets()).result.current.isLoading).toBe(true);
  });
});
