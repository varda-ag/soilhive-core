import type { FilterCriteria } from 'types/backend';

/**
 * How many criteria of a stored Filter narrow its data, as the usage analytics report a download's
 * filters: each soil property, data type and raster value, plus one each for the sampling dates, the
 * depth range and the data access. A data-scope selection of none or all its options stores no
 * criterion (see applyDataScopeCriteria), so it counts as no filter.
 */
export const countAppliedFilterCriteria = (parameters: FilterCriteria | undefined): number => {
  if (!parameters) return 0;
  const rasterValues = Object.values(parameters.raster_filters ?? {}).reduce((count, values) => count + values.length, 0);
  return (
    (parameters.soil_properties?.length ?? 0) +
    (parameters.data_types?.length ?? 0) +
    rasterValues +
    (parameters.min_sampling_date || parameters.max_sampling_date ? 1 : 0) +
    (parameters.min_depth != null || parameters.max_depth != null ? 1 : 0) +
    (parameters.visibility ? 1 : 0)
  );
};
