import { Job } from 'pg-boss';
import { EntityManager, QueryFailedError } from 'typeorm';
import { VersionDiscardJob, VersionResetJob } from '../../interfaces/Job';
import DatasetEntity from '../../entities/Dataset';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import { EntityType, IngestionStatus } from '../../types/data';
import { JobError } from '../../errors/JobError';
import { discardVersionRows, resetVersionRows, restoreDiscardedVersion } from '../../data-layer/DatasetVersions';
import ErrorService from '../../services/ErrorService';
import EntitlementService from '../../services/EntitlementService';
import { EntitlementScope } from '../../types/Entitlements';
import { queueOrphanSweep } from '../orphan-cleanup/SweepOrphanRowsJob';
import { jobRequestData } from '../jobRequestData';
import { log } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';

// Postgres: query_canceled — raised when a statement exceeds the `statement_timeout` set below.
const STATEMENT_TIMEOUT_CODE = '57014';

/** The Version the job names, refused unless it is one (the routes only queue these for a Version). */
const resolveVersion = async (entityManager: EntityManager, data: VersionResetJob): Promise<DatasetEntity> => {
  const requestData = await jobRequestData(entityManager, data);
  const version = await getEntity(requestData, DatasetEntity, EntityType.DATASET, data.dataset_id);
  if (!version.version_of) {
    throw new JobError('VERSION_NOT_A_VERSION', { dataset_name: version.name });
  }
  return version;
};

/**
 * In one transaction, so a failure leaves the Version as it was. The timeout is the same as
 * bulk-delete's (BulkDeleter, 5 minutes): both delete a Dataset's rows.
 */
const inTransaction = async (
  entityManager: EntityManager,
  version: DatasetEntity,
  work: (manager: EntityManager) => Promise<void>,
): Promise<void> => {
  try {
    await entityManager.transaction(async manager => {
      await manager.query(`SET LOCAL statement_timeout = '5min'`);
      await work(manager);
    });
  } catch (error) {
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === STATEMENT_TIMEOUT_CODE) {
      throw new JobError('VERSION_TIMEOUT', { dataset_name: version.name });
    }
    throw error;
  }
};

export async function processVersionReset(job: Job<VersionResetJob>): Promise<void> {
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(job.data.dataset_id, entityManager);
  const version = await resolveVersion(entityManager, job.data);
  await inTransaction(entityManager, version, manager => resetVersionRows(manager, version));
  await queueOrphanSweep();
}

/**
 * The Version a discard names. The discard route soft-deletes it before the job runs
 * (DatasetVersionService.discardVersion), so it's looked up with the deleted rows, and by its slug
 * directly: a discarded Version's slug is never reused. Null when it's gone already, from a discard
 * that ran before.
 */
const resolveDiscardedVersion = async (entityManager: EntityManager, data: VersionDiscardJob): Promise<DatasetEntity | null> => {
  const version = await entityManager.getRepository(DatasetEntity).findOne({ where: { slug: data.dataset_id }, withDeleted: true });
  if (version && !version.version_of) {
    throw new JobError('VERSION_NOT_A_VERSION', { dataset_name: version.name });
  }
  return version;
};

export async function processVersionDiscard(job: Job<VersionDiscardJob>): Promise<void> {
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(job.data.dataset_id, entityManager);
  const version = await resolveDiscardedVersion(entityManager, job.data);
  if (!version) {
    return;
  }
  try {
    await inTransaction(entityManager, version, async manager => {
      // A Version is private and unpublished, so it is unlikely to have grants, but a grant left on
      // its slug would pass to the next Dataset given that slug
      const requestData = { ...(await jobRequestData(manager, job.data)), entityManager: manager };
      await new EntitlementService().deleteEntityEntitlements(requestData, EntitlementScope.DATASETS, version.slug);
      await discardVersionRows(manager, version);
    });
  } catch (error) {
    // Nothing was removed. Put the Version back, as a failed bulk delete does, so it shows again with
    // this job's error and can be discarded again. Best-effort: its error must not mask the original.
    await restoreDiscardedVersion(entityManager, version, job.data.previous_status ?? IngestionStatus.PENDING)
      .then(restored => {
        if (!restored) {
          log.warn('A failed discard left its version discarded: another version is open; the orphan sweep queues it again', {
            version: version.slug,
          });
        }
      })
      .catch(restoreError =>
        log.warn('Failed to restore a version after its discard failed', { version: version.slug, error: getErrorMessage(restoreError) }),
      );
    throw error;
  }
  await queueOrphanSweep();
}
