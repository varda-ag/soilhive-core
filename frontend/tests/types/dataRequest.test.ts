import type {
  PluginClassDistribution,
  PluginClassDistributionSubmission,
  PluginCorrelation,
  PluginCorrelationSubmission,
  PluginDataRequest,
  PluginDataRequestData,
  PluginDescriptiveSubmission,
  PluginSoilStatistics,
  PluginValueRange,
  PluginValueRangeSubmission,
} from 'frontend-plugin-types';

describe('PluginDataRequestData', () => {
  it('resolves each statistics_type to its result type', () => {
    const descriptive: PluginDataRequestData<PluginDescriptiveSubmission> = {} as PluginSoilStatistics;
    const classDistribution: PluginDataRequestData<PluginClassDistributionSubmission> = {} as PluginClassDistribution;
    const valueRange: PluginDataRequestData<PluginValueRangeSubmission> = {} as PluginValueRange;
    const correlation: PluginDataRequestData<PluginCorrelationSubmission> = {} as PluginCorrelation;

    expect(descriptive).toBeDefined();
    expect(classDistribution).toBeDefined();
    expect(valueRange).toBeDefined();
    expect(correlation).toBeDefined();
  });

  it('rejects a class-distribution submission with both classes and class_count/class_method', () => {
    // @ts-expect-error classes and class_count/class_method are mutually exclusive
    const submission: PluginClassDistributionSubmission = {
      filter_id: 'filter-id',
      variable: { type: 'soil-property', id: 'ph' },
      time_aggregation: 'none',
      statistics_type: 'class-distribution',
      value_type: 'count',
      classes: [{ name: 'low', max: 5 }],
      class_count: 5,
      class_method: 'quantile',
    };

    expect(submission).toBeDefined();
  });

  it('rejects a submission without time_aggregation', () => {
    // @ts-expect-error time_aggregation is required
    const submission: PluginValueRangeSubmission = {
      filter_id: 'filter-id',
      variable: { type: 'soil-property', id: 'ph' },
      statistics_type: 'value-range',
    };

    expect(submission).toBeDefined();
  });
});

describe('PluginDescriptiveSubmission', () => {
  it('requires variable', () => {
    const submission: PluginDescriptiveSubmission = {
      filter_id: 'filter-id',
      variable: { type: 'soil-property', id: 'ph' },
      time_aggregation: 'none',
      statistics_type: 'descriptive',
    };
    // @ts-expect-error variable is required
    const withoutVariable: PluginDescriptiveSubmission = {
      filter_id: 'filter-id',
      time_aggregation: 'none',
      statistics_type: 'descriptive',
    };

    expect(submission).toBeDefined();
    expect(withoutVariable).toBeDefined();
  });
});

describe('PluginCorrelationSubmission', () => {
  const submission: PluginCorrelationSubmission = {
    filter_id: 'filter-id',
    time_aggregation: 'none',
    statistics_type: 'correlation',
    variable_x: { type: 'soil-property', id: 'clay' },
    variable_y: { type: 'soil-property', id: 'ph' },
    measure: 'mean',
    depth_ranges: 'standard',
  };

  it('accepts two soil-property variables, a measure and standard depths', () => {
    expect(submission).toBeDefined();
  });

  it('rejects variable', () => {
    // @ts-expect-error a correlation has variable_x and variable_y, not variable
    const withVariable: PluginCorrelationSubmission = { ...submission, variable: { type: 'soil-property', id: 'ph' } };

    expect(withVariable).toBeDefined();
  });

  it('rejects depth_ranges none', () => {
    // @ts-expect-error depth_ranges is 'standard' only
    const noDepths: PluginCorrelationSubmission = { ...submission, depth_ranges: 'none' };

    expect(noDepths).toBeDefined();
  });

  it('rejects a submission without measure', () => {
    // @ts-expect-error measure is required
    const withoutMeasure: PluginCorrelationSubmission = {
      filter_id: 'filter-id',
      time_aggregation: 'none',
      statistics_type: 'correlation',
      variable_x: { type: 'soil-property', id: 'clay' },
      variable_y: { type: 'soil-property', id: 'ph' },
      depth_ranges: 'standard',
    };

    expect(withoutMeasure).toBeDefined();
  });

  it('rejects a soil-index variable', () => {
    // @ts-expect-error soil indexes are not supported for correlation
    const soilIndex: PluginCorrelationSubmission = { ...submission, variable_x: { type: 'soil-index', id: 'run-id' } };

    expect(soilIndex).toBeDefined();
  });
});

describe('PluginDataRequest', () => {
  it('narrows data on the top-level statistics_type', () => {
    const narrow = (dataRequest: PluginDataRequest) => {
      if (dataRequest.statistics_type === 'descriptive') {
        const statistics: PluginSoilStatistics | undefined = dataRequest.data;
        return statistics;
      }
      if (dataRequest.statistics_type === 'value-range') {
        const range: PluginValueRange | undefined = dataRequest.data;
        // @ts-expect-error a value range is not a class distribution
        const distribution: PluginClassDistribution | undefined = dataRequest.data;
        return range ?? distribution;
      }
      if (dataRequest.statistics_type === 'correlation') {
        const x: number[] | undefined = dataRequest.data?.results[0].x;
        const soilProperty: string | undefined = dataRequest.data?.x.soil_property;
        return { x, soilProperty };
      }
      return undefined;
    };

    expect(narrow).toBeDefined();
  });
});
