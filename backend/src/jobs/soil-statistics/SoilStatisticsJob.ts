import { Job } from 'pg-boss';
import { SoilStatisticsJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import { getEntityManager } from '../../utils/data-source';
import { getPgBoss, PG_BOSS_SCHEMA, updateJobState } from '../../services/PgBoss';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import { EVERYONE } from '../../constants/constants';
import { Capability, JobQueues } from '../../types/enums';
import { GISDataType } from '../../types/data';
import { computeSoilStatistics } from '../../data-layer/SoilStatistics';
import { hasRasterFilters } from '../../data-layer/SoilDataStorage';
import { getSoilStatisticsMaxCells, getSoilStatisticsMaxUnits, getSoilStatisticsStatementTimeoutMs } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { extractUnitsFromFile, unitsFromFilter, ExtractedUnits } from './extractUnits';
import { DatasetExcludeReason, DatasetNote, DatasetSkipReason } from './types';

const DEFAULT_HISTOGRAM_BINS = 10;
const WORK_MEM = '512MB';

class JobCancelled extends Error {}

const isJobCancelled = async (jobId: string): Promise<boolean> => {
  const boss = getPgBoss();
  const result = await boss.getDb().executeSql(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return result.rows[0]?.state === 'cancelled';
};

/**
 * Computes Soil Statistics for a Filter and writes the result into the job's own data.
 *
 * Scope of the two inputs, which is easy to get backwards: `filter_id` always supplies
 * the criteria, and supplies the area of interest ONLY when `file_id` is absent. With a
 * file, its geometries become the Aggregation Units and the Filter's own geometries are
 * ignored — so a mandatory parameter is deliberately part-unused.
 *
 * Entitlements are gated twice for different reasons. The authoritative check happens at
 * enqueue time in JobService, where the caller's raw token exists; here it can only be
 * re-derived from EVERYONE plus the user's local rows, because a job processor has no raw
 * token and therefore cannot reach the external entitlements endpoint. Consequently a
 * named dataset is rejected up front (fail fast, with a real 403), while in implicit mode
 * unentitled datasets are skipped and listed — a user whose access comes only from the
 * external endpoint may therefore see fewer datasets in implicit mode than they hold.
 */
export async function processSoilStatistics(job: Job<SoilStatisticsJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { filter_id, file_id, dataset_ids, label_field, created_by } = data;
  const histogramBins = data.histogram_bins ?? DEFAULT_HISTOGRAM_BINS;

  const entityManager = await getEntityManager();
  const entitlementService = new EntitlementService();
  const filterService = new FilterService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as RequestData, created_by ?? EVERYONE);
  const requestData = {
    entityManager,
    entitlements,
    token: { sub: created_by ?? undefined, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin },
  } as RequestData;

  const assertNotCancelled = async () => {
    if (await isJobCancelled(jobId!)) {
      throw new JobCancelled();
    }
  };

  const report = async (description: string, percentage: number) => {
    await updateJobState(jobId!, { progress_percentage: percentage, progress_description: description } as Partial<SoilStatisticsJob>);
  };

  try {
    await report('Resolving area of interest...', 5);
    const filter = await filterService.getFilterById(requestData, filter_id);

    // ── Aggregation Units ────────────────────────────────────────────────────────
    const maxUnits = getSoilStatisticsMaxUnits();
    const extracted: ExtractedUnits = file_id
      ? await extractUnitsFromFile(requestData, { fileId: file_id, parameters: filter.parameters, labelField: label_field, maxUnits })
      : await unitsFromFilter(requestData, filter.geometryIds);

    if (extracted.unitIds.length > maxUnits) {
      throw new JobError('SST_TOO_MANY_UNITS', { max_units: maxUnits });
    }

    // Raster filters mask which Features count, but never clip a unit's geometry, so the
    // recorded area overstates what the statistics actually cover. Flagged, not silently
    // corrected: computing the true masked area costs a full vector-mask pass. Set from
    // the criterion being present, which can over-warn if no raster table is enabled —
    // the safe direction for a caveat about area.
    const rasterFiltered = hasRasterFilters(filter.parameters);
    const units = extracted.units.map(unit => ({ ...unit, raster_filtered: rasterFiltered }));

    // The units define the AOI; the criteria come from the source Filter either way. The
    // area is recomputed over the units rather than inherited from the source Filter,
    // because it selects the raster overview resolution for raster-filter masking.
    const effectiveFilter = {
      ...filter,
      geometryIds: extracted.unitIds,
      area: units.reduce((total, unit) => total + (unit.area_m2 ?? 0), 0),
    };

    await report('Selecting datasets...', 12);
    await assertNotCancelled();

    // ── datasets ─────────────────────────────────────────────────────────────────
    const candidates = await filterService.getDatasets(requestData, extracted.derivedFilterId ?? filter_id);
    const requested = dataset_ids && dataset_ids.length > 0 ? candidates.filter(d => dataset_ids.includes(d.id)) : candidates;

    const excluded: DatasetNote<DatasetExcludeReason>[] = requested
      .filter(dataset => dataset.data_type === GISDataType.RASTER)
      .map(dataset => ({ id: dataset.id, reason: 'raster' as DatasetExcludeReason }));

    const vectorDatasets = requested.filter(dataset => dataset.data_type !== GISDataType.RASTER);
    const skipped: DatasetNote<DatasetSkipReason>[] = [];
    const permitted: string[] = [];
    for (const dataset of vectorDatasets) {
      try {
        await entitlementService.enforceEntitlements(requestData, [dataset.id], Capability.PREVIEW);
        permitted.push(dataset.id);
      } catch {
        // Named datasets are rejected at enqueue time, so anything unentitled here came
        // from implicit selection and is skipped rather than failing the whole run.
        if (dataset_ids && dataset_ids.length > 0) {
          throw new JobError('SST_DATASET_NOT_ENTITLED', { dataset_id: dataset.id });
        }
        skipped.push({ id: dataset.id, reason: 'no_preview_entitlement' });
      }
    }

    await updateJobState(jobId!, {
      derived_filter_id: extracted.derivedFilterId,
      unit_count: units.length,
      units,
      skipped_datasets: skipped,
      excluded_datasets: excluded,
      progress_percentage: 15,
      progress_description: `Aggregating ${permitted.length} dataset(s) over ${units.length} area(s)...`,
    } as Partial<SoilStatisticsJob>);
    await assertNotCancelled();

    // ── statistics ───────────────────────────────────────────────────────────────
    const { results, truncated } = await computeSoilStatistics(entityManager, {
      filter: effectiveFilter,
      unitIds: extracted.unitIds,
      datasetSlugs: permitted,
      histogramBins,
      maxCells: getSoilStatisticsMaxCells(),
      workMem: WORK_MEM,
      statementTimeoutMs: getSoilStatisticsStatementTimeoutMs(),
      onPhase: report,
      assertNotCancelled,
    });

    await updateJobState(jobId!, {
      results,
      truncated,
      progress_percentage: 100,
      progress_description: truncated
        ? `Completed with a reduced breakdown: ${results.length} dataset/property group(s)`
        : `Completed: ${results.length} dataset/property group(s)`,
    } as Partial<SoilStatisticsJob>);

    log.info('Soil statistics job completed', {
      job_id: jobId,
      queue: JobQueues.SOIL_STATISTICS,
      units: units.length,
      datasets: permitted.length,
      groups: results.length,
      truncated,
    });
  } catch (error) {
    if (error instanceof JobCancelled) {
      log.info('Soil statistics job cancelled', { job_id: jobId });
      return;
    }
    throw error;
  }
}
