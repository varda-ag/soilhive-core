import { renderHook } from '@testing-library/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRaster } from 'hooks/useRaster';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

const mockRequest = jest.fn();
jest.mock('../../src/api-client', () => ({
  useRequest: () => ({
    request: mockRequest,
  }),
}));

jest.mock('../../src/utilities/environmentVariables', () => ({
  BACKEND_BASE_URL: 'http://mock-backend',
}));

const useQueryMock = useQuery as jest.MockedFunction<typeof useQuery>;
const useMutationMock = useMutation as jest.MockedFunction<typeof useMutation>;
const useQueryClientMock = useQueryClient as jest.MockedFunction<typeof useQueryClient>;

const mutateMock = jest.fn();
const invalidateQueriesMock = jest.fn();

const MOCK_CATEGORIES = [
  {
    id: 'agroecological_zones',
    name: 'Agroecological Zones',
    description: 'Zones defined by climate, soil and landform',
    enabled: false,
    active: false,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Boreal: 4 },
  },
  {
    id: 'land_cover',
    name: 'Land cover',
    description: 'Physical material at the surface of the earth',
    enabled: false,
    active: false,
    mapping: { Forest: 1, Grassland: 2, Cropland: 3, Wetland: 4 },
  },
  {
    id: 'soil_groups',
    name: 'Soil Groups',
    description: 'World Reference Base for Soil Resources',
    enabled: true,
    active: true,
    mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
  },
  {
    id: 'climate_zones',
    name: 'Climate Zones',
    description: 'Köppen climate classification',
    enabled: true,
    active: false,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Continental: 4, Polar: 5 },
  },
];

// Sets up the useMutation mock to report the given pending state and returns
// the config object (mutationFn/onSuccess) passed to it for assertions.
function mockMutation(isPending = false) {
  let capturedConfig: any;
  useMutationMock.mockImplementation((config: any) => {
    capturedConfig = config;
    return { mutate: mutateMock, isPending } as any;
  });
  return () => capturedConfig;
}

describe('useRaster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryClientMock.mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
    mockMutation(false);
  });

  it('returns isLoading true and no data while loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);

    const { result } = renderHook(() => useRaster());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.allCategories).toBeUndefined();
  });

  it('returns all raster filter categories once loaded', () => {
    useQueryMock.mockReturnValue({ data: MOCK_CATEGORIES, isLoading: false } as any);

    const { result } = renderHook(() => useRaster());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.allCategories).toHaveLength(4);
  });

  it('select sorts categories by name regardless of backend order', () => {
    let capturedConfig: any;
    useQueryMock.mockImplementation((config: any) => {
      capturedConfig = config;
      return { data: MOCK_CATEGORIES, isLoading: false } as any;
    });

    renderHook(() => useRaster());

    const sorted = capturedConfig.select(MOCK_CATEGORIES);
    expect(sorted.map((c: any) => c.name)).toEqual(['Agroecological Zones', 'Climate Zones', 'Land cover', 'Soil Groups']);
    // does not mutate the input array
    expect(MOCK_CATEGORIES[0].name).toBe('Agroecological Zones');
  });

  it('select returns an empty array when the query has no data', () => {
    let capturedConfig: any;
    useQueryMock.mockImplementation((config: any) => {
      capturedConfig = config;
      return { data: undefined, isLoading: true } as any;
    });

    renderHook(() => useRaster());

    expect(capturedConfig.select(null)).toEqual([]);
  });

  it('returns isLoading true while a mutation is pending even after the query loaded', () => {
    useQueryMock.mockReturnValue({ data: MOCK_CATEGORIES, isLoading: false } as any);
    mockMutation(true);

    const { result } = renderHook(() => useRaster());

    expect(result.current.isLoading).toBe(true);
  });

  it('setCategoryActive triggers the mutation with the raster filter id and active flag', () => {
    useQueryMock.mockReturnValue({ data: MOCK_CATEGORIES, isLoading: false } as any);

    const { result } = renderHook(() => useRaster());
    result.current.setCategoryActive('land_cover', true);

    expect(mutateMock).toHaveBeenCalledWith({ rasterFilterId: 'land_cover', active: true });
  });

  it('mutationFn issues a PATCH to the raster filter endpoint and invalidates the query on success', async () => {
    useQueryMock.mockReturnValue({ data: MOCK_CATEGORIES, isLoading: false } as any);
    const getConfig = mockMutation(false);

    renderHook(() => useRaster());
    const config = getConfig();

    await config.mutationFn({ rasterFilterId: 'soil_groups', active: false });
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'http://mock-backend/raster-filters/soil_groups',
      method: 'PATCH',
      body: { active: false },
    });

    config.onSuccess();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
  });
});
