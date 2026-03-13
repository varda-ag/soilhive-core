import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useDownloadSummary } from 'hooks/useDownloadSummary';
import { computeDatasetSummary } from '../../src/domain';
import { useSoilProperties } from 'hooks/useSoilProperties';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('../../src/domain', () => ({
  computeDatasetSummary: jest.fn(),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;
const computeDatasetSummaryMock = computeDatasetSummary as jest.MockedFunction<typeof computeDatasetSummary>;
const useSoilPropertiesMock = useSoilProperties as jest.MockedFunction<typeof useSoilProperties>;

describe('useDownloadSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests are loading', () => {
    useSoilPropertiesMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    useApiQueryMock
      // Mocks request to endpoint: `/data-filters/${filterId}`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any)
      // Mocks request to endpoint: `/data-filters/${filterId}/coverage`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any)
      // Mocks request to endpoint: `/licenses`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: [] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(3);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(1);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(1);
    expect(resultData).toMatchObject({
      geometryFeature: undefined,
      datasetsSummary: {},
      soilProperties: undefined,
      depthRange: undefined,
      isLoading: true,
    });
  });

  it('soilProperties, geometryFilters and depthRange are returned with correct values', () => {
    useSoilPropertiesMock.mockReturnValue({
      data: [
        { id: 'prop-1', property_name: 'Prop 1' },
        { id: 'prop-2', property_name: 'Prop 2' },
      ],
      isLoading: false,
    } as any);
    useApiQueryMock
      // Mocks request to endpoint: `/data-filters/${filterId}`
      .mockReturnValueOnce({
        data: { filter: { parameters: { soil_properties: ['prop-1'], min_depth: 0, max_depth: 50 }, geometries: ['mock-geometry'] } },
        isLoading: false,
      } as any)
      // Mocks request to endpoint: `/data-filters/${filterId}/coverage`
      .mockReturnValueOnce({ data: undefined, isLoading: false } as any)
      // Mocks request to endpoint: `/licenses`
      .mockReturnValueOnce({ data: [], isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: [] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(3);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(1);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(1);
    expect(resultData).toMatchObject({
      geometryFeature: { type: 'FeatureCollection', features: [{ geometry: 'mock-geometry' }] },
      datasetsSummary: {},
      soilProperties: ['Prop 1'],
      depthRange: '0-50cm',
      isLoading: false,
    });
  });
});
