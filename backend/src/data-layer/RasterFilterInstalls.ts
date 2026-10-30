import { EntityManager } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import { PG_BOSS_SCHEMA } from '../services/PgBoss';
import { JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { queueReapCode, translateJobError } from '../errors/jobErrorMessages';
import { RasterFilterInstall } from '../interfaces/RasterFilter';
import { rasterFilterTables } from '../utils/raster';
import { existingRelations } from './EnabledRasterFilters';

interface InstallJobRow {
  id: string;
  state: string;
  raster_filter_id: string;
  progress_percentage: number | null;
  progress_description: string | null;
  errors: Array<{ code: string; params?: Record<string, unknown>; detail?: string }> | null;
  output_message: string | null;
}

/**
 * Each Raster Filter's install state, derived rather than stored (docs/adr/0042 is why): Installed when
 * its base table exists, which the install's rename makes atomic, and otherwise from its latest
 * install job. A failure is a JobError recorded into `data.errors`, or a pg-boss reap.
 */
export async function getInstallStates(entityManager: EntityManager, ids: string[]): Promise<Map<string, RasterFilterInstall>> {
  if (ids.length === 0) return new Map();
  const installed = await existingRelations(entityManager, ids);
  const jobs: InstallJobRow[] = await entityManager.query(
    `SELECT DISTINCT ON (data->>'raster_filter_id')
       id, state,
       data->>'raster_filter_id' AS raster_filter_id,
       (data->>'progress_percentage')::float AS progress_percentage,
       data->>'progress_description' AS progress_description,
       data->'errors' AS errors,
       COALESCE(output->>'message', output->'value'->>'message') AS output_message
     FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = $1 AND data->>'raster_filter_id' = ANY($2)
     ORDER BY data->>'raster_filter_id', created_on DESC`,
    [JobQueues.RASTER_FILTER_INSTALL, ids],
  );
  const jobsById = new Map(jobs.map(job => [job.raster_filter_id, job]));

  return new Map(
    ids.map(id => {
      const job = jobsById.get(id);
      return [id, installState(installed.has(id), job)];
    }),
  );
}

function installState(isInstalled: boolean, job: InstallJobRow | undefined): RasterFilterInstall {
  const jobId = job?.id ?? null;
  if (isInstalled) {
    return { status: 'installed', job_id: jobId, errors: [] };
  }
  if (job?.state === 'created') {
    return { status: 'queued', job_id: jobId, errors: [] };
  }
  if (job?.state === 'active') {
    return {
      status: 'installing',
      job_id: jobId,
      ...(job.progress_percentage !== null && { progress_percentage: job.progress_percentage }),
      ...(job.progress_description !== null && { progress_description: job.progress_description }),
      errors: [],
    };
  }
  if (job?.state === 'failed') {
    const reapCode = job.errors?.length ? undefined : queueReapCode(job.output_message ?? '');
    const stored = job.errors?.length ? job.errors : reapCode ? [{ code: reapCode }] : [];
    return {
      status: 'failed',
      job_id: jobId,
      errors: stored.map(e => ({
        code: e.code,
        params: e.params ?? {},
        ...(e.detail !== undefined && { detail: e.detail }),
        ...translateJobError(e.code, e.params ?? {}),
      })),
    };
  }
  // No job, or one cancelled, or completed and then its table dropped by hand
  return { status: 'not_installed', job_id: jobId, errors: [] };
}

/** Refuses with 409 while the Raster Filter has an install queued or running. */
export async function assertNoUnfinishedInstall(entityManager: EntityManager, id: string): Promise<void> {
  const [job]: { id: string; state: string }[] = await entityManager.query(
    `SELECT id, state FROM ${PG_BOSS_SCHEMA}.job
     WHERE name = $1 AND state IN ('created', 'active') AND data->>'raster_filter_id' = $2
     LIMIT 1`,
    [JobQueues.RASTER_FILTER_INSTALL, id],
  );
  if (job) {
    const state = job.state === 'created' ? 'queued' : 'running';
    throw new ErrorResponse(`Raster filter '${id}' has an install ${state} (${job.id}): try again once it finishes`, StatusCodes.CONFLICT);
  }
}

/** Which of the names a Raster Filter with this id would install as (base and overviews) are already taken. */
export async function takenRasterFilterNames(entityManager: EntityManager, id: string): Promise<string[]> {
  return [...(await existingRelations(entityManager, rasterFilterTables(id), true))];
}
