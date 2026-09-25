import type {
  PluginClassDistribution,
  PluginClassDistributionSubmission,
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

    expect(descriptive).toBeDefined();
    expect(classDistribution).toBeDefined();
    expect(valueRange).toBeDefined();
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
