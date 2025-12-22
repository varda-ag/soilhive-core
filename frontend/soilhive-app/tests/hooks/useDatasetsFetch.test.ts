import { renderHook, waitFor } from '@testing-library/react';
import { useFetchFilteredDatasets } from 'hooks/useFetchFilteredDatasets';
import type { DatasetFilter, PostDatasetFilterResponse } from 'types/backend';

jest.mock('../../src/api-client/useRequest', () => ({
  useRequest: jest.fn(),
}));
import { useRequest } from '../../src/api-client';

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: '',
}));

describe('useDatasetFetch hook', () => {
  it('fetch datasets when coordinates change', async () => {
    const mockUseRequest = useRequest as jest.Mock;

    // Arrange 1
    // Some random polygon in northen Africa
    const initialFilter: DatasetFilter = {
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [12.617187500001421, 30.600093873550918],
              [12.441406250002558, 23.402764905408915],
              [21.933593750002558, 22.10599879975146],
              [12.617187500001421, 30.600093873550918],
            ],
          ],
        },
      ],
      parameters: {},
    };

    const mockInitialFilterReply: PostDatasetFilterResponse = {
      id: 'stored-dataset-filter-initial',
      name: 'stored-dataset-filter-intial',
      geometries: initialFilter.geometries,
      parameters: initialFilter.parameters,
      results: [
        {
          datasets: [
            {
              id: 'dataset-id-1',
              name: 'dataset-name-1',
              dataset_layer_count: 10,
            },
          ],
        },
      ],
    };

    mockUseRequest.mockReturnValue({
      loading: false,
      error: '',
      request: () => {
        return mockInitialFilterReply;
      },
    });

    // Act 1
    const { result, rerender } = renderHook(({ filter }) => useFetchFilteredDatasets(filter), {
      initialProps: { filter: initialFilter },
    });

    // Assert 1
    await waitFor(
      () => {
        expect(result.current.fetchedFilteredResults).toEqual(mockInitialFilterReply);
      },
      { timeout: 500 },
    );

    // Arrange 2 - change filter
    // Some random polygon in Europe
    const updatedFilter: DatasetFilter = {
      geometries: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [8.398437500002558, 50.51342652633983],
              [10.332031250001819, 48.8068634610855],
              [13.320312500002075, 50.62507306341473],
              [8.398437500002558, 50.51342652633983],
            ],
          ],
        },
      ],
      parameters: {},
    };

    const mockUpdatedFilterReply: PostDatasetFilterResponse = {
      id: 'stored-dataset-filter-updated',
      name: 'stored-dataset-filter-updated',
      geometries: updatedFilter.geometries,
      parameters: updatedFilter.parameters,
      results: [
        {
          datasets: [
            {
              id: 'dataset-id-2',
              name: 'dataset-name-2',
              dataset_layer_count: 10,
            },
            {
              id: 'dataset-id-3',
              name: 'dataset-name-3',
              dataset_layer_count: 20,
            },
          ],
        },
      ],
    };

    mockUseRequest.mockReturnValue({
      loading: false,
      error: '',
      request: () => {
        return mockUpdatedFilterReply;
      },
    });

    // Act 2
    rerender({ filter: updatedFilter });

    // Assert 2
    await waitFor(() => {
      expect(result.current.fetchedFilteredResults).toBe(mockUpdatedFilterReply);
    });
  });
});
