import { DataRequestJob } from '../../interfaces/Job';
import { DataFilter } from '../../interfaces/DatasetFilter';
import FilterService from '../../services/FilterService';
import SoilPropertyService from '../../services/SoilPropertyService';
import SoilPropertyEntity from '../../entities/SoilProperty';
import { RequestData } from '../../interfaces/RequestData';
import { Capability, VariableType } from '../../types/enums';
import { GISDataType } from '../../types/data';
import { JobError } from '../../errors/JobError';
import { RunContext } from '../runs/runContext';
import { StagedVariable } from '../../data-layer/DataRequests';
import { soilIndexRunExists, soilIndexRunType } from '../../data-layer/SoilIndex';
import { existingDatasets } from '../../utils/slugs';
import { datasetCapabilities } from '../../utils/auth';
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

  const candidates = await new FilterService().getDatasets(requestData, derivedFilterId ?? filter_id);
  // Named by current slug, so an old slug still matches its candidate (docs/adr/0071).
  const named = dataset_ids && dataset_ids.length > 0 ? (await existingDatasets(requestData, dataset_ids)).map(d => d.slug) : null;
  const requested = named ? candidates.filter(d => named.includes(d.id)) : candidates;

  const vectorDatasets = requested.filter(dataset => dataset.data_type !== GISDataType.RASTER);
  const permitted: string[] = [];
  for (const dataset of vectorDatasets) {
    if (datasetCapabilities(requestData, { slug: dataset.id, visibility: dataset.visibility }).includes(Capability.PREVIEW)) {
      permitted.push(dataset.id);
    } else if (named) {
      // Named datasets were checked at enqueue time, so one unentitled here fails the run; an
      // implicitly selected one is skipped.
      throw new JobError('DR_DATASET_NOT_ENTITLED', { dataset_id: dataset.id });
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
