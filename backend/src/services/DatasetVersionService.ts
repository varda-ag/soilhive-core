import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { Job, VersionDiscardJob, VersionPublishJob, VersionResetJob } from '../interfaces/Job';
import DatasetEntity from '../entities/Dataset';
import { EntityType, IngestionStatus } from '../types/data';
import { JobQueues } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { getEntity } from '../utils/slugs';
import { getSubject } from '../utils/auth';
import { assertNoUnfinishedJob } from '../data-layer/DatasetJobs';
import { getOpenVersions, publishableReason, softDeleteVersion } from '../data-layer/DatasetVersions';
import JobService from './JobService';

/**
 * The descriptive metadata a Version starts with, copied from v1. The rollup a load writes is left
 * out, and so are the publication settings, which the publish request carries (phase 4). A Version
 * can't change them (DatasetService.updateDataset): v1's are edited on v1.
 */
export const COPIED_FIELDS = [
  'full_name',
  'version',
  'author',
  'description',
  'data_producer',
  'spatial_resolution',
  'publication_date',
  'reference_period_start',
  'reference_period_stop',
  'licenses',
  'citation',
  'geographical_extent',
  'gis_datatype',
  'service_location',
  'related_resources',
] as const;

/**
 * Version Datasets (docs/backend/dataset-version-plan.md): data added to a PUBLISHED Dataset (v1) is
 * loaded into a Version (v2), a Dataset row of its own that stays hidden by its status. The ingestion
 * steps, routes and loaders work on it by its slug like on any unpublished Dataset.
 */
export default class DatasetVersionService {
  /**
   * Opens a Version of a PUBLISHED Dataset that isn't a Version itself and has none open. It is
   * named `<v1 name> v<number> increment`, which its slug is made from, and starts PENDING and private.
   */
  openVersion = async (requestData: RequestData, datasetSlug: string): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);
    if (dataset.version_of) {
      throw new ErrorResponse(`Dataset '${dataset.name}' is itself a version: add the data to it directly`, StatusCodes.CONFLICT);
    }
    if (dataset.status !== IngestionStatus.PUBLISHED) {
      throw new ErrorResponse(
        `Dataset '${dataset.name}' isn't published: load data into it directly, without a version`,
        StatusCodes.CONFLICT,
      );
    }
    // Also takes the Dataset's advisory lock, so two requests can't both find no open Version
    await assertNoUnfinishedJob(requestData.entityManager, dataset);
    const open = (await getOpenVersions(requestData.entityManager, [dataset.id])).get(dataset.id);
    if (open) {
      throw new ErrorResponse(
        `Dataset '${dataset.name}' already has an open version (${open.slug}): publish or discard it first`,
        StatusCodes.CONFLICT,
      );
    }

    const number = dataset.version_number + 1;
    const subject = getSubject(requestData);
    const copied = Object.fromEntries(COPIED_FIELDS.map(field => [field, dataset[field] ?? null]));
    const version = repo.create({
      ...copied,
      name: `${dataset.name} v${number} increment`,
      version_of: dataset.id,
      version_number: number,
      status: IngestionStatus.PENDING,
      visibility: 'private',
      created_by: subject,
      updated_by: subject,
    });
    try {
      const saved = await repo.save(version);
      return await repo.findOneByOrFail({ id: saved.id });
    } catch (error: any) {
      if (error.code === '23505') {
        // The name: another Dataset already has it
        throw new ErrorResponse(
          `Dataset '${version.name}' already exists: rename it before opening a version of '${dataset.name}'`,
          StatusCodes.CONFLICT,
        );
      }
      throw error;
    }
  };

  /** The Version of the given Dataset, by slug; 404 when it is no Version of it. */
  getVersion = async (requestData: RequestData, datasetSlug: string, versionSlug: string): Promise<DatasetEntity> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);
    const version = await getEntity(requestData, DatasetEntity, EntityType.DATASET, versionSlug);
    if (version.version_of !== dataset.id) {
      throw new ErrorResponse(`Dataset '${dataset.name}' has no version '${versionSlug}'`, StatusCodes.NOT_FOUND);
    }
    return version;
  };

  /**
   * Queues a `version-reset` of the Version, which removes all its loaded data: the way a loaded
   * vector File is corrected, since its observations don't record which File they came from.
   */
  resetVersion = async (requestData: RequestData, datasetSlug: string, versionSlug: string): Promise<Job> => {
    const version = await this.getVersion(requestData, datasetSlug, versionSlug);
    const { job } = await new JobService().createJob(requestData, {
      type: JobQueues.VERSION_RESET,
      dataset_id: version.slug,
    } as VersionResetJob);
    return job;
  };

  /**
   * Discards the Version the way a bulk delete removes a Dataset: it's soft-deleted here, so it leaves
   * the admin list and stops being the open Version at once, and a new Version can be opened straight
   * away. The queued `version-discard` then removes its Files and data in the background. v1 is left
   * as it is.
   *
   * The job is queued first: creating it checks the Version's lock, which refuses a discard while a
   * load or reset of it is unfinished, and it can't find a Version already soft-deleted.
   */
  discardVersion = async (requestData: RequestData, datasetSlug: string, versionSlug: string): Promise<Job> => {
    const version = await this.getVersion(requestData, datasetSlug, versionSlug);
    const { job } = await new JobService().createJob(requestData, {
      type: JobQueues.VERSION_DISCARD,
      dataset_id: version.slug,
      previous_status: version.status,
    } as VersionDiscardJob);
    await softDeleteVersion(requestData.entityManager, version);
    return job;
  };

  /**
   * Queues a `version-publish` of the Version into its Dataset, with the publication settings the
   * settings page sends: visibility, and the grants replacing the Dataset's, both kept as the Dataset
   * has them when absent. Nothing goes live until the job's transaction commits (VersionPublishJob).
   *
   * Refused with 409 unless the Dataset is PUBLISHED and the Version LOADED with no File left to load
   * (publishableReason), and while either has a job unfinished. The Version's lock is taken before
   * the Dataset's, which creating the job takes.
   */
  publishVersion = async (requestData: RequestData, datasetSlug: string, versionSlug: string, settings: PublishSettings): Promise<Job> => {
    const version = await this.getVersion(requestData, datasetSlug, versionSlug);
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);
    const reason = await publishableReason(requestData.entityManager, dataset, version);
    if (reason) {
      throw new ErrorResponse(`Version '${version.name}' can't be published into '${dataset.name}': ${reason}`, StatusCodes.CONFLICT);
    }
    await assertNoUnfinishedJob(requestData.entityManager, version);
    const { job } = await new JobService().createJob(requestData, {
      type: JobQueues.VERSION_PUBLISH,
      dataset_id: dataset.slug,
      version_id: version.slug,
      ...(settings.visibility !== undefined && { visibility: settings.visibility }),
      ...(settings.entitlements !== undefined && { entitlements: settings.entitlements }),
      ...(settings.delete_source_files !== undefined && { delete_source_files: settings.delete_source_files }),
    } as VersionPublishJob);
    return job;
  };
}

/** The body of POST /datasets/{datasetId}/versions/{versionId}/publish */
export type PublishSettings = Pick<VersionPublishJob, 'visibility' | 'entitlements' | 'delete_source_files'>;
