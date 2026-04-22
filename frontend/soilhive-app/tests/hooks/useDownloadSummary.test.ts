import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from 'hooks/useFilteredDatasetsQuery';
import { useDownloadSummary } from 'hooks/useDownloadSummary';
import { computeDatasetSummary } from '../../src/domain';
import { useSoilProperties } from 'hooks/useSoilProperties';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useFilteredCoverageQuery', () => ({
  useFilteredCoverageQuery: jest.fn(),
}));

jest.mock('hooks/useFilteredDatasetsQuery', () => ({
  useFilteredDatasetsQuery: jest.fn(),
}));

jest.mock('../../src/domain', () => ({
  computeDatasetSummary: jest.fn(),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;
const useFilteredCoverageQueryMock = useFilteredCoverageQuery as jest.MockedFunction<typeof useFilteredCoverageQuery>;
const useFilteredDatasetsQueryMock = useFilteredDatasetsQuery as jest.MockedFunction<typeof useFilteredDatasetsQuery>;
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
      // Mocks request to endpoint: `/licenses`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any);
    useFilteredCoverageQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    useFilteredDatasetsQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: [] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(2);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(1);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(1);
    expect(resultData).toMatchObject({
      geometryFeature: undefined,
      datasetsSummary: {},
      soilProperties: undefined,
      depthRange: undefined,
      datasets: undefined,
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
      // Mocks request to endpoint: `/licenses`
      .mockReturnValueOnce({ data: [], isLoading: false } as any);
    useFilteredCoverageQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    useFilteredDatasetsQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: [] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(2);
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

  it('datasets are built from coverageData when available', () => {
    useSoilPropertiesMock.mockReturnValue({ data: [], isLoading: false } as any);
    useApiQueryMock
      .mockReturnValueOnce({ data: undefined, isLoading: false } as any)
      .mockReturnValueOnce({ data: [{ id: 'license-1', name: 'License 1' }], isLoading: false } as any);
    useFilteredCoverageQueryMock.mockReturnValue({
      data: {
        datasets: [
          { id: 'ds-1', name: 'Dataset 1', data_type: 'vector', dataset_layer_count: 10, licenses: ['license-1'] },
          { id: 'ds-2', name: 'Dataset 2', data_type: 'raster', dataset_layer_count: 5, licenses: [] },
        ],
        raster_filters: {},
      },
      isLoading: false,
    } as any);
    useFilteredDatasetsQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: ['ds-1', 'ds-2'] }));
    expect(resultData.datasets).toEqual([
      { id: 'ds-1', name: 'Dataset 1', dataType: 'vector', layerCount: 10, licenses: [{ id: 'license-1', name: 'License 1' }] },
      { id: 'ds-2', name: 'Dataset 2', dataType: 'raster', layerCount: 5, licenses: [] },
    ]);
  });

  it('datasets are built from datasetsData when coverageData is not available', () => {
    useSoilPropertiesMock.mockReturnValue({ data: [], isLoading: false } as any);
    useApiQueryMock
      .mockReturnValueOnce({ data: undefined, isLoading: false } as any)
      .mockReturnValueOnce({ data: [], isLoading: false } as any);
    useFilteredCoverageQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    useFilteredDatasetsQueryMock.mockReturnValue({
      data: [
        { id: 'ds-1', name: 'Dataset 1', data_type: 'vector' },
        { id: 'ds-2', name: 'Dataset 2', data_type: 'raster' },
      ],
      isLoading: false,
    } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadSummary({ filterId: 'test-filter-id', datasetsIds: ['ds-1', 'ds-2'] }));
    expect(resultData.datasets).toEqual([
      { id: 'ds-1', name: 'Dataset 1', dataType: 'vector', layerCount: 0, licenses: [] },
      { id: 'ds-2', name: 'Dataset 2', dataType: 'raster', layerCount: 0, licenses: [] },
    ]);
  });
});
