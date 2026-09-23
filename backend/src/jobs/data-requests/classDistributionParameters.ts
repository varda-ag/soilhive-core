import { ClassDefinition, DataRequestJobParameters } from '../../interfaces/Job';
import { DepthRanges, VariableType } from '../../types/enums';
import { MAX_CLASSES, UNCLASSIFIED } from './types';

/** Upper bound on `time_aggregation`, in years. */
export const MAX_TIME_AGGREGATION = 10;

/**
 * Why the `class-distribution` parameters are unusable, or null when they are fine. Only what can be
 * judged without the database: the Soil Property itself is looked up by the caller.
 *
 * One rule set, applied twice: on submission, where it becomes a 400, and again in the processor,
 * which must not trust job data. The OpenAPI schema already checks shapes; these are the rules a
 * schema cannot express, repeated with the shapes so the processor needs nothing else.
 */
export const classDistributionProblem = (data: DataRequestJobParameters): string | null => {
  const { variable, classes, time_aggregation, depth_ranges } = data;

  if (!variable) {
    return 'Parameter variable is required for statistics_type class-distribution';
  }
  if (!Object.values(VariableType).includes(variable.type)) {
    return `Parameter variable.type '${variable.type}' is not supported: use one of ${Object.values(VariableType).join(', ')}`;
  }
  if (!variable.id) {
    return 'Parameter variable.id is required';
  }

  const classesIssue = classesProblem(classes);
  if (classesIssue) {
    return classesIssue;
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

/**
 * Classes are `[min, max)`, and an absent bound is unbounded on that side. Overlap is rejected
 * rather than resolved, because an Observation counted in two Classes would push the shares past
 * 100; touching bounds do not overlap.
 */
const classesProblem = (classes: ClassDefinition[] | undefined): string | null => {
  if (!classes || classes.length === 0) {
    return 'Parameter classes is required for statistics_type class-distribution, with at least one class';
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

/** The class-distribution-only parameters, for rejecting them on another Statistics Type. */
export const CLASS_DISTRIBUTION_ONLY_PARAMETERS = ['variable', 'classes', 'time_aggregation', 'depth_ranges'] as const;
