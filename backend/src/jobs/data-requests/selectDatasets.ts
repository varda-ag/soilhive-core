import { DataRequestJob } from '../../interfaces/Job';
import { DataFilter } from '../../interfaces/DatasetFilter';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import SoilPropertyService from '../../services/SoilPropertyService';
import SoilPropertyEntity from '../../entities/SoilProperty';
import { RequestData } from '../../interfaces/RequestData';
import { Capability, VariableType } from '../../types/enums';
import { EntitlementScope } from '../../types/Entitlements';
import { GISDataType } from '../../types/data';
import { JobError } from '../../errors/JobError';
import { RunContext } from '../runs/runContext';
import { StagedVariable } from '../../data-layer/DataRequests';
import { soilIndexRunExists, soilIndexRunType } from '../../data-layer/SoilIndex';
import { soilIndexFilterProblem } from './parameters';
import { SoilIndexVariableHeader, SoilPropertyVariableHeader } from './types';

/** The source Filter's criteria over the Aggregation Units. */
export const effectiveFilterOf = (ctx: RunContext): DataFilter => ({
  ...ctx.filter,
  geometryIds: ctx.unitIds,
  area: ctx.units.reduce((total, unit) => total + (unit.area_m2 ?? 0), 0),
});

/** Slugs of the Datasets the Filter matches, narrowed by `dataset_ids`, raster-free and PREVIEW-entitled. */
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

/** Resolved so an old slug maps to the current one; fails the Run if deleted since submission. */
export const resolveSoilProperty = async (requestData: RequestData, id: string): Promise<SoilPropertyEntity> => {
  try {
    return await new SoilPropertyService().getSoilProperty(requestData, id);
  } catch {
    throw new JobError('DR_UNKNOWN_SOIL_PROPERTY', { soil_property: id });
  }
};

export interface ResolvedVariable {
  staged: StagedVariable;
  header: SoilPropertyVariableHeader | SoilIndexVariableHeader;
  /** Empty for a Soil Index Run. */
  datasetSlugs: string[];
  /** For progress messages. */
  label: string;
}

/** Repeats the submission checks: job data is not trusted, and a Run's partition may be gone. */
export const resolveVariable = async (ctx: RunContext, data: DataRequestJob): Promise<ResolvedVariable> => {
  const variable = data.variable!;

  if (variable.type === VariableType.SOIL_INDEX) {
    const problem = soilIndexFilterProblem(data.filter_id, ctx.filter.parameters);
    if (problem) {
      throw new JobError('DR_INVALID_PARAMETERS', { reason: problem });
    }
    if (!(await soilIndexRunExists(ctx.entityManager, variable.id))) {
      throw new JobError('DR_UNKNOWN_SOIL_INDEX_RUN', { run: variable.id });
    }
    const soilIndexType = await soilIndexRunType(ctx.entityManager, variable.id);
    return {
      staged: { soilIndexRun: variable.id },
      header: { run: variable.id, ...(soilIndexType ? { soil_index_type: soilIndexType } : {}) },
      datasetSlugs: [],
      label: soilIndexType ? `${soilIndexType} scores` : 'soil index scores',
    };
  }

  const soilProperty = await resolveSoilProperty(ctx.requestData, variable.id);
  return {
    staged: { soilPropertySlug: soilProperty.slug },
    header: { soil_property: soilProperty.slug, standard_unit: soilProperty.standard_unit ?? null },
    datasetSlugs: await selectPermittedDatasets(ctx, data),
    label: soilProperty.slug,
  };
};
