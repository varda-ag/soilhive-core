import { Job } from 'pg-boss';
import { EntityManager } from 'typeorm';
import { RunJobData } from '../../interfaces/Job';
import { DataFilter } from '../../interfaces/DatasetFilter';
import { RequestData } from '../../interfaces/RequestData';
import { getEntityManager } from '../../utils/data-source';
import { getPgBoss, PG_BOSS_SCHEMA, updateJobState } from '../../services/PgBoss';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import { hasRasterFilters } from '../../data-layer/SoilDataStorage';
import { EVERYONE } from '../../constants/constants';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { getMaxAggregationUnits } from '../../utils/utils';
import { extractUnitsFromFile, unitsFromFilter, ExtractedUnits } from './extractUnits';
import { AggregationUnit } from './types';

class JobCancelled extends Error {}

const isJobCancelled = async (jobId: string): Promise<boolean> => {
  const boss = getPgBoss();
  const result = await boss.getDb().executeSql(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return result.rows[0]?.state === 'cancelled';
};

/**
 * Everything a Run's product is handed, and the whole of what the two queues share.
 *
 * This is the pipeline that `processDataRequest` once argued against having, and the argument was
 * answered rather than ignored: it is shared because a **Run** is a domain concept - one execution
 * that resolves Aggregation Units and computes something over them - and not because two
 * unrelated jobs happened to grow similar preambles. Its boundary is exactly the Run's definition.
 * Anything past "the Units are resolved" belongs to the product.
 */
export interface RunContext {
  jobId: string;
  entityManager: EntityManager;
  /** Carries the entitlements re-derived inside the processor; see processRun. */
  requestData: RequestData;
  /** Resolved `filter_id`: always the criteria, and the AOI too when no `file_id` is given. */
  filter: DataFilter;
  /** The resolved Aggregation Units, already written into job data. */
  units: AggregationUnit[];
  unitIds: string[];
  /** Filter holding the Units; null when they are `filter_id`'s own geometries. */
  derivedFilterId: string | null;
  report: (description: string, percentage: number) => Promise<void>;
  /** Throws JobCancelled when the job was cancelled; products should call it between phases. */
  assertNotCancelled: () => Promise<void>;
}

/**
 * One registered product - a Statistics Type or a Soil Index Type - as its queue's dispatch map
 * holds it.
 *
 * `appliesRasterMask` is the only thing about resolving Units that has ever differed between
 * products, and it was previously mistaken for a side effect of the resolution itself. It is not:
 * it is a property of the *product*. `descriptive` masks which Features count, so a Unit's recorded
 * area overstates what its statistics cover and must be flagged; a product that applies no mask
 * would be lying if it set the same flag. Declaring it here lets the Units be resolved, flagged and
 * written exactly once, for every product that exists or will exist.
 */
export interface RunProduct<T extends RunJobData, P = void> {
  appliesRasterMask: boolean;
  /**
   * Resolves with whatever the queue above needs to record. A `data-requests` product returns
   * its payload, because `processDataRequest` — not the product — writes the Data Request row.
   * A Soil Index returns nothing: it has already written its own `soil_index` rows and there
   * is no Data Request to write (docs/adr/0037).
   */
  run: (ctx: RunContext, data: T) => Promise<P>;
}

/**
 * Resolves a Run - entitlements, Filter, Aggregation Units - and hands off to its product.
 *
 * Entitlements are re-derived here from EVERYONE plus the user's local rows, because a job
 * processor has no raw token and therefore cannot reach the external entitlements endpoint; the
 * authoritative check happens at enqueue time in JobService. What each product does with the
 * result is its own business - see runDescriptiveStatistics.
 *
 * Scope of the two inputs, which is easy to get backwards: `filter_id` always supplies the
 * criteria, and supplies the area of interest ONLY when `file_id` is absent. With a file, its
 * geometries become the Aggregation Units and the Filter's own geometries are ignored - so a
 * mandatory parameter is deliberately part-unused.
 *
 * `derived_filter_id`, `unit_count` and `units[]` are written here and nowhere else. Every Run
 * promises a caller those three fields; writing them in the one place every Run passes through is
 * what makes the promise true by construction rather than by every product remembering.
 *
 * Resolves with the product's own result, or `undefined` when the Run was cancelled. That
 * distinction is load-bearing for `data-requests`: no result and no throw is how a cancellation
 * reaches the caller, and it is the signal not to write a row for a record the DELETE that
 * cancelled it has already destroyed (docs/adr/0037).
 */
export async function processRun<T extends RunJobData, P = void>(
  job: Job<T>,
  selectProduct: (data: T) => RunProduct<T, P>,
): Promise<P | undefined> {
  const { id: jobId, data } = job;
  const { filter_id, file_id, label_field, created_by } = data;

  // Selected before anything expensive runs, and re-checked even though the enqueue path validates
  // it: a processor must not trust job data, which outlives the request that produced it.
  const product = selectProduct(data);

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
    await updateJobState(jobId!, { progress_percentage: percentage, progress_description: description } as Partial<RunJobData>);
  };

  try {
    await report('Resolving area of interest...', 5);
    const filter = await filterService.getFilterById(requestData, filter_id);

    const maxUnits = getMaxAggregationUnits();
    const extracted: ExtractedUnits = file_id
      ? await extractUnitsFromFile(requestData, { fileId: file_id, parameters: filter.parameters, labelField: label_field, maxUnits })
      : await unitsFromFilter(requestData, filter.geometryIds);

    // extractUnitsFromFile enforces the cap on the file's own features; this covers the no-file
    // path, where the Units come from a Filter that was never capped when it was saved.
    if (extracted.unitIds.length > maxUnits) {
      throw new JobError('RUN_TOO_MANY_UNITS', { max_units: maxUnits });
    }

    // Raster filters mask which Features count, but never clip a unit's geometry, so the recorded
    // area overstates what the product actually covers. Flagged, not silently corrected: computing
    // the true masked area costs a full vector-mask pass. Set from the criterion being present,
    // which can over-warn if no raster table is enabled - the safe direction for a caveat about area.
    const rasterFiltered = product.appliesRasterMask && hasRasterFilters(filter.parameters);
    const units = extracted.units.map(unit => ({ ...unit, raster_filtered: rasterFiltered }));

    // Written to the job row *and* to the copy this process holds. updateJobState is a SQL
    // UPDATE, so without the assignment `job.data` would still say zero units — and
    // processDataRequest reads exactly these three fields off it to build the record a caller
    // keeps. Two copies of one fact, disagreeing, is how the units would vanish from a Data
    // Request that outlived its job.
    Object.assign(data, { derived_filter_id: extracted.derivedFilterId, unit_count: units.length, units });

    await updateJobState(jobId!, {
      derived_filter_id: extracted.derivedFilterId,
      unit_count: units.length,
      units,
      progress_percentage: 10,
      progress_description: `Resolved ${units.length} area(s)`,
    } as Partial<RunJobData>);
    await assertNotCancelled();

    return await product.run(
      {
        jobId: jobId!,
        entityManager,
        requestData,
        filter,
        units,
        unitIds: extracted.unitIds,
        derivedFilterId: extracted.derivedFilterId,
        report,
        assertNotCancelled,
      },
      data,
    );
  } catch (error) {
    if (error instanceof JobCancelled) {
      log.info('Run cancelled', { job_id: jobId });
      return undefined;
    }
    throw error;
  }
}
