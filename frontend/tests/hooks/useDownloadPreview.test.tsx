import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useDownloadPreview } from 'hooks/useDownloadPreview';
import { computeDatasetSummary } from '../../src/domain';
import { useSoilProperties } from 'hooks/useSoilProperties';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useFilteredCoverageQuery', () => ({
  useFilteredCoverageQuery: jest.fn(),
}));

jest.mock('../../src/domain', () => ({
  computeDatasetSummary: jest.fn(),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;
const useFilteredCoverageQueryMock = useFilteredCoverageQuery as jest.MockedFunction<typeof useFilteredCoverageQuery>;
const computeDatasetSummaryMock = computeDatasetSummary as jest.MockedFunction<typeof computeDatasetSummary>;
const useSoilPropertiesMock = useSoilProperties as jest.MockedFunction<typeof useSoilProperties>;

describe('useDownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests are loading', () => {
    useSoilPropertiesMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    // Mocks request to endpoint: `/data-filters/${filterId}`
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    useFilteredCoverageQueryMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadPreview({ filterId: 'test-filter-id', datasetsIds: [], datasetTypesParams: [] as string[] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(1);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(1);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(1);
    expect(resultData).toMatchObject({
      isLoading: true,
      availableFixedDatasets: [],
      availabilitySelectedFilters: undefined,
      availabilitySelectedSoilProperties: [],
      availabilityFilteredSoilProperties: [],
      datasetsSummary: {},
      selectedDatasets: [],
      geometryFilter: [],
    });
  });

  it('results are returned with correct values', () => {
    useSoilPropertiesMock.mockReturnValue({
      data: [
        { id: 'prop-1', property_name: 'Prop 1' },
        { id: 'prop-2', property_name: 'Prop 2' },
      ],
      isLoading: false,
    } as any);
    // Mocks request to endpoint: `/data-filters/${filterId}`
    useApiQueryMock.mockReturnValue({
      data: {
        filter: {
          parameters: { soil_properties: ['prop-1'], min_depth: 0, max_depth: 50 },
          geometries: ['mock-geometry'],
        },
      },
      isLoading: false,
    } as any);
    useFilteredCoverageQueryMock.mockReturnValue({
      data: {
        datasets: [
          { id: 'mock-dataset-id-1', data_type: 'mock-type-1', name: 'Mock dataset 1', soil_properties: ['prop-1'] },
          { id: 'mock-dataset-id-2', data_type: 'mock-type-1', name: 'Mock dataset 2', soil_properties: ['prop-1'] },
        ],
        raster_filters: {},
      },
      isLoading: false,
    } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() =>
      useDownloadPreview({
        filterId: 'test-filter-id',
        datasetsIds: ['mock-dataset-id-1', 'mock-dataset-id-2'],
        datasetTypesParams: ['mock-type-1'],
      }),
    );
    expect(useApiQueryMock).toHaveBeenCalledTimes(1);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(1);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(1);
    expect(resultData).toMatchObject({
      isLoading: false,
      availableFixedDatasets: [
        {
          id: 'mock-dataset-id-1',
          data_type: 'mock-type-1',
          name: 'Mock dataset 1',
          soil_properties: ['prop-1'],
        },
        {
          id: 'mock-dataset-id-2',
          data_type: 'mock-type-1',
          name: 'Mock dataset 2',
          soil_properties: ['prop-1'],
        },
      ],
      availabilitySelectedFilters: {
        filter: {
          geometries: ['mock-geometry'],
          parameters: {
            max_depth: 50,
            min_depth: 0,
            soil_properties: ['prop-1'],
          },
        },
      },
      availabilitySelectedSoilProperties: ['prop-1'],
      availabilityFilteredSoilProperties: [
        {
          id: 'prop-1',
          property_name: 'Prop 1',
        },
      ],
      datasetsSummary: {},
      selectedDatasets: ['mock-dataset-id-1'],
      geometryFilter: ['mock-geometry'],
    });
  });

  it('isSelectedDatasetRaster is true when all selected datasets are RASTER', () => {
    useSoilPropertiesMock.mockReturnValue({ data: [], isLoading: false } as any);
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    useFilteredCoverageQueryMock.mockReturnValue({
      data: { datasets: [{ id: 'raster-1', data_type: 'raster', name: 'Raster 1', soil_properties: [] }] },
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useDownloadPreview({ filterId: 'filter-id', datasetsIds: ['raster-1'], datasetTypesParams: [] }));
    expect(result.current.isSelectedDatasetRaster).toBe(true);
    expect(result.current.nonRasterSelectedDatasets).toEqual([]);
  });

  it('isSelectedDatasetRaster is false and nonRasterSelectedDatasets excludes RASTER for mixed selection', () => {
    useSoilPropertiesMock.mockReturnValue({ data: [], isLoading: false } as any);
    useApiQueryMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    useFilteredCoverageQueryMock.mockReturnValue({
      data: {
        datasets: [
          { id: 'raster-1', data_type: 'raster', name: 'Raster 1', soil_properties: [] },
          { id: 'point-1', data_type: 'point', name: 'Point 1', soil_properties: [] },
        ],
      },
      isLoading: false,
    } as any);

    const { result } = renderHook(() =>
      useDownloadPreview({ filterId: 'filter-id', datasetsIds: ['raster-1', 'point-1'], datasetTypesParams: [] }),
    );
    expect(result.current.isSelectedDatasetRaster).toBe(false);
    expect(result.current.nonRasterSelectedDatasets).toEqual(['point-1']);
  });
});
