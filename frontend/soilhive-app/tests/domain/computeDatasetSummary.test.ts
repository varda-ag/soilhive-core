import { register, unregister, type TimeZone } from 'timezone-mock';
import { computeDatasetSummary } from '../../src/domain/computeDatasetSummary';
import { testTimezones } from '../setupTests';

describe.each(testTimezones)('computeDatasetSummary domain logic (multiple-timezones)', testTimezone => {
  beforeEach(() => {
    register(testTimezone.tz as TimeZone);
  });

  afterEach(() => {
    unregister();
  });

  it.each([
    {
      name: 'only dataset_layer_count property',
      input: [
        {
          id: 'dataset-id-1',
          name: 'dataset-name-1',
          dataset_layer_count: 25,
        },
      ],
      expected: {
        count: 1,
        dataPoints: 25,
        layers: 0,
        depth: '?-?',
        date: '?-?',
        globalDateEnd: null,
        globalDateStart: null,
        globalMaxDepth: null,
        globalMinDepth: null,
      },
    },
    {
      name: 'all properties',
      input: [
        {
          id: 'dataset-id-2',
          name: 'dataset-name-2',
          dataset_layer_count: 20,
          min_depth: 0,
          max_depth: 60,
          min_sampling_date: '2023-01-01',
          max_sampling_date: '2025-02-25',
        },
      ],
      expected: {
        count: 1,
        dataPoints: 20,
        layers: 0,
        depth: '0-60',
        date: '2023-2025',
        globalDateEnd: new Date(Date.UTC(2025, 1, 25)), // Corresponding to 2025/02/25
        globalDateStart: new Date(Date.UTC(2023, 0, 1)), // Corresponding to 2023/01/01
        globalMaxDepth: 60,
        globalMinDepth: 0,
      },
    },
  ])('should build dataset summary with $name', ({ input, expected }) => {
    const actual = computeDatasetSummary(input);
    expect(actual).toEqual(expected);
  });
});
