import computeDatasetSummary from '../../src/domain/computeDasetSummary';

describe('computeDatasetSummary domain logic', () => {
  test.each([
    {
      name: 'only dataset_layer_count property',
      input: {
        id: 'filter-id-1',
        name: 'filter-name-1',
        geometries: [],
        parameters: {},
        results: [
          {
            datasets: [
              {
                id: 'dataset-id-1',
                name: 'dataset-name-1',
                dataset_layer_count: 25,
              },
            ],
          },
        ],
      },
      expected: {
        count: 1,
        dataPoints: 25,
        layers: 0,
        depth: 'N/A',
        date: 'N/A',
      },
    },
    {
      name: 'all properties',
      input: {
        id: 'filter-id-2',
        name: 'filter-name-2',
        geometries: [],
        parameters: {},
        results: [
          {
            datasets: [
              {
                id: 'dataset-id-2',
                name: 'dataset-name-2',
                dataset_layer_count: 20,
                min_depth: 0,
                max_depth: 60,
                min_sampling_date: '2023',
                max_sampling_date: '2025',
              },
            ],
          },
        ],
      },
      expected: {
        count: 1,
        dataPoints: 20,
        layers: 0,
        depth: '0-60',
        date: '2023-2025',
      },
    },
  ])('should build dataset summary with $name', ({ input, expected }) => {
    const actual = computeDatasetSummary(input);
    expect(actual).toEqual(expected);
  });
});
