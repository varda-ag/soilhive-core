import { DataRequestJob } from '../../interfaces/Job';
import { DataFilter } from '../../interfaces/DatasetFilter';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import { Capability } from '../../types/enums';
import { EntitlementScope } from '../../types/Entitlements';
import { GISDataType } from '../../types/data';
import { JobError } from '../../errors/JobError';
import { RunContext } from '../runs/runContext';

/** The Filter used in a Statistics Type computation. */
export const effectiveFilterOf = (ctx: RunContext): DataFilter => ({
  ...ctx.filter,
  geometryIds: ctx.unitIds,
  area: ctx.units.reduce((total, unit) => total + (unit.area_m2 ?? 0), 0),
});

/**
 * The Datasets a data-requests Run may aggregate, as slugs: those the Filter matches, narrowed to
 * `dataset_ids` when given, raster-free, and PREVIEW-entitled.
 */
export const selectPermittedDatasets = async (ctx: RunContext, data: DataRequestJob): Promise<string[]> => {
  const { requestData, derivedFilterId } = ctx;
  const { filter_id, dataset_ids } = data;
  const entitlementService = new EntitlementService();

  const candidates = await new FilterService().getDatasets(requestData, derivedFilterId ?? filter_id);
  const requested = dataset_ids && dataset_ids.length > 0 ? candidates.filter(d => dataset_ids.includes(d.id)) : candidates;

  const vectorDatasets = requested.filter(dataset => dataset.data_type !== GISDataType.RASTER);
  const permitted: string[] = [];
  for (const dataset of vectorDatasets) {
    try {
      await entitlementService.enforceEntitlements(requestData, EntitlementScope.DATASETS, [dataset.id], Capability.PREVIEW);
      permitted.push(dataset.id);
    } catch {
      // Named datasets are rejected at enqueue time, so anything unentitled here came
      // from implicit selection and is skipped rather than failing the whole run.
      if (dataset_ids && dataset_ids.length > 0) {
        throw new JobError('DR_DATASET_NOT_ENTITLED', { dataset_id: dataset.id });
      }
    }
  }
  return permitted;
};
