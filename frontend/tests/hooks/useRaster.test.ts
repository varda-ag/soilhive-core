import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useRaster } from 'hooks/useRaster';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../src/api-client', () => ({
  useRequest: () => ({
    request: jest.fn(),
  }),
}));

jest.mock('../../src/utilities/environmentVariables', () => ({
  BACKEND_BASE_URL: 'http://mock-backend',
}));

const useQueryMock = useQuery as jest.MockedFunction<typeof useQuery>;

const MOCK_CATEGORIES = [
  {
    id: 'agroecological_zones',
    name: 'Agroecological Zones',
    description: 'Zones defined by climate, soil and landform',
    enabled: false,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Boreal: 4 },
  },
  {
    id: 'land_cover',
    name: 'Land cover',
    description: 'Physical material at the surface of the earth',
    enabled: false,
    mapping: { Forest: 1, Grassland: 2, Cropland: 3, Wetland: 4 },
  },
  {
    id: 'soil_groups',
    name: 'Soil Groups',
    description: 'World Reference Base for Soil Resources',
    enabled: true,
    mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
  },
  {
    id: 'climate_zones',
    name: 'Climate Zones',
    description: 'Köppen climate classification',
    enabled: true,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Continental: 4, Polar: 5 },
  },
];

describe('useRaster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
