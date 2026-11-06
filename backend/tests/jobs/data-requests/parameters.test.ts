import { describe, it, expect } from '@jest/globals';
import { misplacedParameter, parametersProblem } from '../../../src/jobs/data-requests/parameters';
import { DataRequestJobParameters } from '../../../src/interfaces/Job';
import { ClassMethod, CorrelationMeasure, DepthRanges, StatisticsType, ValueType, VariableType } from '../../../src/types/enums';

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

describe('parametersProblem — correlation', () => {
  const correlation = (overrides: Partial<DataRequestJobParameters> = {}): DataRequestJobParameters => ({
    statistics_type: StatisticsType.CORRELATION,
    filter_id: 'f',
    variable_x: { type: VariableType.SOIL_PROPERTY, id: 'clay' },
    variable_y: { type: VariableType.SOIL_PROPERTY, id: 'soc' },
    measure: CorrelationMeasure.MEDIAN,
    depth_ranges: DepthRanges.STANDARD,
    time_aggregation: 3,
    ...overrides,
  });

  it('accepts two different soil properties with a measure and standard depth ranges', () => {
    expect(parametersProblem(correlation())).toBeNull();
  });

  it.each([
    ['a missing variable_x', { variable_x: undefined }, 'Parameter variable_x is required for statistics_type correlation'],
    ['a missing variable_y', { variable_y: undefined }, 'Parameter variable_y is required for statistics_type correlation'],
    [
      'a soil-index variable',
      { variable_y: { type: VariableType.SOIL_INDEX, id: RUN } },
      'Parameter variable_y: soil indexes are not supported for correlation',
    ],
    ['an empty id', { variable_x: { type: VariableType.SOIL_PROPERTY, id: '' } }, 'Parameter variable_x.id is required'],
    [
      'the same variable twice',
      { variable_y: { type: VariableType.SOIL_PROPERTY, id: 'clay' } },
      'Parameters variable_x and variable_y must name different soil properties',
    ],
    ['a missing measure', { measure: undefined }, 'Parameter measure is required for statistics_type correlation: use one of mean, median'],
    ['an unknown measure', { measure: 'mode' as CorrelationMeasure }, "Parameter measure 'mode' is not supported: use one of mean, median"],
    ['absent depth_ranges', { depth_ranges: undefined }, "Parameter depth_ranges must be 'standard' for statistics_type correlation"],
    ['depth_ranges none', { depth_ranges: DepthRanges.NONE }, "Parameter depth_ranges must be 'standard' for statistics_type correlation"],
    [
      'a missing time_aggregation',
      { time_aggregation: undefined },
      'Parameter time_aggregation is required for statistics_type correlation',
    ],
  ])('refuses %s', (_name, overrides, reason) => {
    expect(parametersProblem(correlation(overrides))).toContain(reason);
  });

  it('refuses variable and classes with correlation, and variable_x with descriptive', () => {
    expect(misplacedParameter(correlation({ variable: { type: VariableType.SOIL_PROPERTY, id: 'ph' } }), StatisticsType.CORRELATION)).toBe(
      'variable',
    );
    expect(misplacedParameter(correlation({ classes: [{ name: 'All', min: 0 }] }), StatisticsType.CORRELATION)).toBe('classes');
    expect(misplacedParameter(correlation(), StatisticsType.DESCRIPTIVE)).toBe('variable_x');
    expect(misplacedParameter(correlation(), StatisticsType.CORRELATION)).toBeUndefined();
  });
});
