import { describe, it, expect } from '@jest/globals';
import {
  filterCriteriaGiven,
  misplacedParameter,
  parametersProblem,
  soilIndexFilterProblem,
} from '../../../src/jobs/data-requests/parameters';
import { DataRequestJobParameters } from '../../../src/interfaces/Job';
import { ClassMethod, DepthRanges, StatisticsType, ValueType, VariableType } from '../../../src/types/enums';

const RUN = '7c1e2a9e-7b1d-4c55-9a60-2e8f1d4b7c11';

const valueRange = (overrides: Partial<DataRequestJobParameters> = {}): DataRequestJobParameters => ({
  statistics_type: StatisticsType.VALUE_RANGE,
  filter_id: 'f',
  variable: { type: VariableType.SOIL_INDEX, id: RUN },
  time_aggregation: 'none',
  ...overrides,
});

describe('misplacedParameter', () => {
  it('names the first parameter the type does not use, and accepts shared ones', () => {
    expect(misplacedParameter(valueRange({ depth_ranges: DepthRanges.STANDARD }), StatisticsType.VALUE_RANGE)).toBe('depth_ranges');
    expect(misplacedParameter(valueRange(), StatisticsType.VALUE_RANGE)).toBeUndefined();
    expect(misplacedParameter(valueRange({ value_type: ValueType.COUNT }), StatisticsType.DESCRIPTIVE)).toBe('value_type');
  });
});

describe('parametersProblem — soil-index variables', () => {
  it('accepts a Run id', () => {
    expect(parametersProblem(valueRange())).toBeNull();
  });

  it('refuses an id that cannot be a Run, with the one message every unusable id gets', () => {
    expect(parametersProblem(valueRange({ variable: { type: VariableType.SOIL_INDEX, id: 'crea-index' } }))).toBe(
      "Parameter variable.id 'crea-index' is not a completed soil index run",
    );
  });

  it('refuses dataset_ids and depth_ranges, which scores have no use for', () => {
    expect(parametersProblem(valueRange({ dataset_ids: ['a'] }))).toContain('dataset_ids does not apply to a soil-index variable');
    expect(
      parametersProblem(
        valueRange({
          statistics_type: StatisticsType.CLASS_DISTRIBUTION,
          depth_ranges: DepthRanges.STANDARD,
          class_count: 3,
          class_method: ClassMethod.QUANTILE,
          value_type: ValueType.COUNT,
        }),
      ),
    ).toContain('depth_ranges does not apply to a soil-index variable');
  });
});

describe('filterCriteriaGiven', () => {
  it('counts explicit nulls as criteria, and empty lists or objects as none', () => {
    expect(filterCriteriaGiven({})).toEqual([]);
    expect(filterCriteriaGiven({ soil_properties: [], raster_filters: {} })).toEqual([]);
    expect(filterCriteriaGiven({ min_depth: 0, max_sampling_date: null, horizons: ['A'] })).toEqual([
      'min_depth',
      'max_sampling_date',
      'horizons',
    ]);
  });

  it('turns any criterion into a refusal for a soil-index variable', () => {
    expect(soilIndexFilterProblem('f1', {})).toBeNull();
    expect(soilIndexFilterProblem('f1', { licenses: ['cc-by'] })).toBe(
      "Filter 'f1' carries criteria (licenses), which do not apply to soil index scores: use a filter with geometries only",
    );
  });
});
