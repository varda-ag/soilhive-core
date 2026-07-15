import { register, unregister, type TimeZone } from 'timezone-mock';
import { computeDatasetSummary } from '../../src/domain/computeDatasetSummary';
import { testTimezones } from '../setupTests';
import { GISDataType } from '../../src/types/backend';

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
          data_type: GISDataType.POINT,
          visibility: 'public' as const,
          dataset_layer_count: 25,
          raster_layer_count: 0,
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
          data_type: GISDataType.POINT,
          visibility: 'public' as const,
          dataset_layer_count: 20,
          raster_layer_count: 0,
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
        globalDateStart: '2023-01-01',
        globalDateEnd: '2025-02-25',
        globalMaxDepth: 60,
        globalMinDepth: 0,
      },
    },
  ])('should build dataset summary with $name', ({ input, expected }) => {
    const actual = computeDatasetSummary(input);
    expect(actual).toEqual(expected);
  });

  it('uses fullFilterDatasets length for count when fetchedFilteredResults is undefined', () => {
    const fullFilterDatasets = [
      { id: 'ds-1', name: 'Dataset 1', data_type: GISDataType.POINT, visibility: 'public' },
      { id: 'ds-2', name: 'Dataset 2', data_type: GISDataType.RASTER, visibility: 'public' },
      { id: 'ds-3', name: 'Dataset 3', data_type: GISDataType.POINT, visibility: 'public' },
    ];
    const actual = computeDatasetSummary(undefined, fullFilterDatasets as any);
    expect(actual).toEqual({
      count: 3,
      dataPoints: 0,
      layers: 0,
      depth: '?-?',
      date: '?-?',
      globalDateEnd: null,
      globalDateStart: null,
      globalMaxDepth: null,
      globalMinDepth: null,
    });
  });

  it('uses fullFilterDatasets length for count when fetchedFilteredResults is empty', () => {
    const fullFilterDatasets = [
      { id: 'ds-1', name: 'Dataset 1', data_type: 'vector', visibility: 'public' },
      { id: 'ds-2', name: 'Dataset 2', data_type: 'raster', visibility: 'public' },
    ];
    const actual = computeDatasetSummary([], fullFilterDatasets as any);
    expect(actual.count).toBe(2);
    expect(actual.dataPoints).toBe(0);
  });

  it('fetchedFilteredResults count takes precedence over fullFilterDatasets count', () => {
    const fetchedFilteredResults = [
      {
        id: 'ds-1',
        name: 'Dataset 1',
        data_type: GISDataType.POINT,
        visibility: 'public' as const,
        dataset_layer_count: 10,
        raster_layer_count: 0,
      },
    ];
    const fullFilterDatasets = [
      { id: 'ds-1', name: 'Dataset 1', data_type: GISDataType.POINT, visibility: 'public' },
      { id: 'ds-2', name: 'Dataset 2', data_type: GISDataType.RASTER, visibility: 'public' },
      { id: 'ds-3', name: 'Dataset 3', data_type: GISDataType.POINT, visibility: 'public' },
    ];
    const actual = computeDatasetSummary(fetchedFilteredResults, fullFilterDatasets as any);
    expect(actual.count).toBe(1);
    expect(actual.dataPoints).toBe(10);
  });
});
