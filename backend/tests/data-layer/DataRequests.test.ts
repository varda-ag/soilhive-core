import { describe, it, expect } from '@jest/globals';
import { toDataRequestParameters } from '../../src/data-layer/DataRequests';
import { DataRequestJob } from '../../src/interfaces/Job';
import { ClassMethod, DepthRanges, JobQueues, StatisticsType, ValueType, VariableType } from '../../src/types/enums';

// The one mapping from job data to what a caller reads back, shared by the row the processor writes
// and the response served while the job lives (docs/adr/0037).
describe('toDataRequestParameters', () => {
  const baseJob = (overrides: Partial<DataRequestJob> = {}): DataRequestJob =>
    ({
      type: JobQueues.DATA_REQUESTS,
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      created_by: 'someone@example.com',
      isDataAdmin: true,
      isSuperAdmin: true,
      anonymous: true,
      progress_percentage: 42,
      progress_description: 'Computing',
      ...overrides,
    }) as DataRequestJob;

  it('never carries the submitter, their privilege, or job bookkeeping', () => {
    const keys = Object.keys(toDataRequestParameters(baseJob()));
    for (const key of ['type', 'created_by', 'isDataAdmin', 'isSuperAdmin', 'anonymous', 'progress_percentage', 'progress_description']) {
      expect(keys).not.toContain(key);
    }
  });

  it('defaults the resolved half when no unit has been resolved yet', () => {
    expect(toDataRequestParameters(baseJob())).toEqual({
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      derived_filter_id: null,
      unit_count: 0,
      units: [],
    });
  });

  it('keeps every optional parameter that was given and the resolved units', () => {
    const units = [{ unit_id: 'u1', label: 'A', area_m2: 1, raster_filtered: false }] as unknown as DataRequestJob['units'];
    const result = toDataRequestParameters(
      baseJob({
        file_id: 'file-1',
        label_field: 'name',
        dataset_ids: ['ds-a'],
        variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
        time_aggregation: 'none',
        derived_filter_id: 'derived-1',
        unit_count: 1,
        units,
      }),
    );
    expect(result).toEqual({
      statistics_type: StatisticsType.DESCRIPTIVE,
      filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      file_id: 'file-1',
      label_field: 'name',
      dataset_ids: ['ds-a'],
      variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
      time_aggregation: 'none',
      derived_filter_id: 'derived-1',
      unit_count: 1,
      units,
    });
  });

  it('keeps a generated-classes request as submitted', () => {
    const result = toDataRequestParameters(
      baseJob({ statistics_type: StatisticsType.CLASS_DISTRIBUTION, class_count: 8, class_method: ClassMethod.QUANTILE }),
    );
    expect(result).toMatchObject({ class_count: 8, class_method: ClassMethod.QUANTILE });
    expect(result).not.toHaveProperty('classes');
  });

  it('keeps the class-distribution parameters, so the row says what the percentages are of', () => {
    const classes = [
      { name: 'Acid', max: 6.5 },
      { name: 'Alkaline', min: 6.5 },
    ];
    const result = toDataRequestParameters(
      baseJob({
        statistics_type: StatisticsType.CLASS_DISTRIBUTION,
        variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
        classes,
        time_aggregation: 3,
        depth_ranges: DepthRanges.STANDARD,
        value_type: ValueType.COUNT,
      }),
    );
    expect(result).toMatchObject({
      statistics_type: StatisticsType.CLASS_DISTRIBUTION,
      variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' },
      classes,
      time_aggregation: 3,
      depth_ranges: DepthRanges.STANDARD,
      value_type: ValueType.COUNT,
    });
  });
});
