import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useDownloadPreview } from 'hooks/useDownloadPreview';
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

describe('useDownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests are loading', () => {
    useSoilPropertiesMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    useApiQueryMock
      // Mocks request to endpoint: `/data-filters/${filterId}`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any)
      // Mocks request to endpoint: `/data-filters/${filterId}/coverage`
      .mockReturnValueOnce({ data: undefined, isLoading: true } as any);
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() => useDownloadPreview({ filterId: 'test-filter-id', datasetsIds: [], datasetTypesParams: [] as string[] }));
    expect(useApiQueryMock).toHaveBeenCalledTimes(2);
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
    useApiQueryMock.mockImplementation(({ endpoint }: any) => {
      if (endpoint.endsWith('/coverage')) {
        return {
          data: [
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
            }
          ],
          isLoading: false,
        } as any;
      }

      return {
        data: {
          filter: {
            parameters: { soil_properties: ['prop-1'], min_depth: 0, max_depth: 50 },
            geometries: ['mock-geometry'],
          },
        },
        isLoading: false,
      } as any;
    });
    computeDatasetSummaryMock.mockReturnValue({} as any);
    const {
      result: { current: resultData },
    } = renderHook(() =>
      useDownloadPreview({ filterId: 'test-filter-id', datasetsIds: ['mock-dataset-id-1', 'mock-dataset-id-2'], datasetTypesParams: ['mock-type-1'] }),
    );
    expect(useApiQueryMock).toHaveBeenCalledTimes(4);
    expect(computeDatasetSummaryMock).toHaveBeenCalledTimes(2);
    expect(useSoilPropertiesMock).toHaveBeenCalledTimes(2);
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
        }
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
});
