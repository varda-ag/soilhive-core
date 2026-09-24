import { validate as isUuid } from 'uuid';
import { ClassDefinition, DataRequestJobParameters } from '../../interfaces/Job';
import { FilterCriteria } from '../../interfaces/DatasetFilter';
import { ClassMethod, DepthRanges, StatisticsType, ValueType, VariableType } from '../../types/enums';
import { MAX_CLASSES, MIN_CLASS_COUNT, UNCLASSIFIED } from './types';

export const MAX_TIME_AGGREGATION = 10;

/** Types each type-specific parameter applies to; sent with another type it is rejected, not ignored. */
const PARAMETER_TYPES: Record<string, StatisticsType[]> = {
  histogram_bins: [StatisticsType.DESCRIPTIVE],
  variable: [StatisticsType.CLASS_DISTRIBUTION, StatisticsType.VALUE_RANGE],
  classes: [StatisticsType.CLASS_DISTRIBUTION],
  class_count: [StatisticsType.CLASS_DISTRIBUTION],
  class_method: [StatisticsType.CLASS_DISTRIBUTION],
  time_aggregation: [StatisticsType.CLASS_DISTRIBUTION],
  depth_ranges: [StatisticsType.CLASS_DISTRIBUTION],
  value_type: [StatisticsType.CLASS_DISTRIBUTION],
};

export const misplacedParameter = (data: DataRequestJobParameters, statisticsType: StatisticsType): string | undefined =>
  Object.entries(PARAMETER_TYPES).find(
    ([name, types]) => (data as unknown as Record<string, unknown>)[name] !== undefined && !types.includes(statisticsType),
  )?.[0];

/** Database-free parameter rules, checked on submission and again in the processor. Null when fine. */
export const parametersProblem = (data: DataRequestJobParameters): string | null => {
  switch (data.statistics_type) {
    case StatisticsType.CLASS_DISTRIBUTION:
      return classDistributionProblem(data);
    case StatisticsType.VALUE_RANGE:
      return variableProblem(data);
    default:
      return null;
  }
};

const variableProblem = (data: DataRequestJobParameters): string | null => {
  const { variable, statistics_type } = data;
  if (!variable) {
    return `Parameter variable is required for statistics_type ${statistics_type}`;
  }
  if (!Object.values(VariableType).includes(variable.type)) {
    return `Parameter variable.type '${variable.type}' is not supported: use one of ${Object.values(VariableType).join(', ')}`;
  }
  if (!variable.id) {
    return 'Parameter variable.id is required';
  }
  if (variable.type === VariableType.SOIL_INDEX) {
    return soilIndexVariableProblem(data);
  }
  return null;
};

/** Only the id's shape is checked here; the Run's existence needs the database (docs/adr/0039). */
const soilIndexVariableProblem = (data: DataRequestJobParameters): string | null => {
  if (!isUuid(data.variable!.id)) {
    return notASoilIndexRun(data.variable!.id);
  }
  if (data.dataset_ids !== undefined) {
    return 'Parameter dataset_ids does not apply to a soil-index variable: soil index scores belong to no dataset';
  }
  if (data.depth_ranges !== undefined) {
    return 'Parameter depth_ranges does not apply to a soil-index variable: soil index scores have no depth';
  }
  return null;
};

/** One message for every unusable id: telling them apart needs the job, which may be gone. */
export const notASoilIndexRun = (id: string): string => `Parameter variable.id '${id}' is not a completed soil index run`;

/** Empty lists and objects don't count; an explicit null does, since it filters. */
export const filterCriteriaGiven = (parameters: FilterCriteria): string[] =>
  Object.entries(parameters ?? {})
    .filter(([, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (value !== null && typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    })
    .map(([name]) => name);

/** A Soil Index variable takes a criteria-free Filter (docs/adr/0039). */
export const soilIndexFilterProblem = (filterId: string, parameters: FilterCriteria): string | null => {
  const given = filterCriteriaGiven(parameters);
  return given.length > 0
    ? `Filter '${filterId}' carries criteria (${given.join(', ')}), which do not apply to soil index scores: use a filter with geometries only`
    : null;
};

const classDistributionProblem = (data: DataRequestJobParameters): string | null => {
  const { time_aggregation, depth_ranges, value_type } = data;

  const variableIssue = variableProblem(data);
  if (variableIssue) {
    return variableIssue;
  }

  const classesIssue = classSourceProblem(data);
  if (classesIssue) {
    return classesIssue;
  }

  if (value_type === undefined) {
    return `Parameter value_type is required for statistics_type class-distribution: use one of ${Object.values(ValueType).join(', ')}`;
  }
  if (!Object.values(ValueType).includes(value_type)) {
    return `Parameter value_type '${value_type}' is not supported: use one of ${Object.values(ValueType).join(', ')}`;
  }

  if (
    time_aggregation !== undefined &&
    (!Number.isInteger(time_aggregation) || time_aggregation < 1 || time_aggregation > MAX_TIME_AGGREGATION)
  ) {
    return `Parameter time_aggregation must be an integer from 1 to ${MAX_TIME_AGGREGATION}`;
  }
  if (depth_ranges !== undefined && !Object.values(DepthRanges).includes(depth_ranges)) {
    return `Parameter depth_ranges '${depth_ranges}' is not supported: use one of ${Object.values(DepthRanges).join(', ')}`;
  }
  return null;
};

/** Exactly one of `classes`, or `class_count` with `class_method`. */
const classSourceProblem = (data: DataRequestJobParameters): string | null => {
  const { classes, class_count, class_method } = data;
  const generated = class_count !== undefined || class_method !== undefined;

  if (classes !== undefined && generated) {
    return 'Give either classes or class_count with class_method, not both';
  }
  if (!generated) {
    return classesProblem(classes);
  }
  if (class_count === undefined) {
    return 'Parameter class_method requires class_count';
  }
  if (class_method === undefined) {
    return `Parameter class_count requires class_method: use one of ${Object.values(ClassMethod).join(', ')}`;
  }
  if (!Number.isInteger(class_count) || class_count < MIN_CLASS_COUNT || class_count > MAX_CLASSES) {
    return `Parameter class_count must be an integer from ${MIN_CLASS_COUNT} to ${MAX_CLASSES}`;
  }
  if (!Object.values(ClassMethod).includes(class_method)) {
    return `Parameter class_method '${class_method}' is not supported: use one of ${Object.values(ClassMethod).join(', ')}`;
  }
  return null;
};

/** `[min, max)` Classes must not overlap; touching bounds are fine. */
const classesProblem = (classes: ClassDefinition[] | undefined): string | null => {
  if (!classes || classes.length === 0) {
    return 'Parameter classes, or class_count with class_method, is required for statistics_type class-distribution';
  }
  if (classes.length > MAX_CLASSES) {
    return `Parameter classes allows at most ${MAX_CLASSES} classes`;
  }

  const names = new Set<string>();
  for (const definition of classes) {
    if (!definition.name) {
      return 'Every class needs a non-empty name';
    }
    if (definition.name === UNCLASSIFIED) {
      return `Class name '${UNCLASSIFIED}' is reserved for values that fall in no class`;
    }
    if (names.has(definition.name)) {
      return `Class name '${definition.name}' is used more than once`;
    }
    names.add(definition.name);

    if (definition.min === undefined && definition.max === undefined) {
      return `Class '${definition.name}' needs a min, a max, or both`;
    }
    if (definition.min !== undefined && definition.max !== undefined && !(definition.min < definition.max)) {
      return `Class '${definition.name}' needs min below max`;
    }
  }

  const sorted = [...classes].sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if ((previous.max ?? Infinity) > (current.min ?? -Infinity)) {
      return `Classes '${previous.name}' and '${current.name}' overlap`;
    }
  }
  return null;
};
