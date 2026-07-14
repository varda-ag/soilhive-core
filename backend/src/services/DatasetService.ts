import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { getSubject } from '../utils/auth';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getEntity } from '../utils/slugs';
import { EntityType, IngestionStatus } from '../types/data';
import { epsgList } from '../assets/epsg';
import { Capability, JobQueues } from '../types/enums';
import { Entitlements } from '../types/Entitlements';
import VectorDataLoad from '../data-layer/VectorDataLoad';
import DataMappingService from './DataMappingService';
import DatasetFileMappingService from './DatasetFileMappingService';
import { CleaningReport } from '../interfaces/CleaningReport';
import { bumpCacheEpoch } from '../utils/cache-epoch';
import { refreshDaiStats } from '../data-layer/DaiStats';
import JobService from './JobService';
import { RefreshDaiStatsJob } from '../interfaces/Job';
import { ProcessingSteps } from '../interfaces/Dataset';

const vdl = new VectorDataLoad();
const dmService = new DataMappingService();
const dfmService = new DatasetFileMappingService();

// Delay (seconds) before a REFRESH_DAI_STATS job becomes visible to workers,
// so the enqueuing request's transaction has committed by the time it runs
const DAI_REFRESH_START_AFTER_SECONDS = 5;
export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<DatasetEntity[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const entities = await repo.find();
    entities.map(e => {
      this.decorateWithCapabilities(e, requestData.entitlements);
      this.decoratePreprocessingSteps(e);
    });
    return entities;
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<DatasetEntity> => {
    const entity = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
    this.decorateWithCapabilities(entity, requestData.entitlements);
    this.decoratePreprocessingSteps(entity);
    return entity;
  };

  createDataset = async (requestData: RequestData, data: CreateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);

    const subject = getSubject(requestData);
    const dataset = repo.create({
      ...data,
      processing_steps: this.toProcessingSteps(data.preprocessing_steps),
      created_by: subject,
      updated_by: subject,
    });

    try {
      const saved = await repo.save(dataset);
      const reloaded = await repo.findOneBy({ id: saved.id });
      this.decorateWithCapabilities(reloaded!, requestData.entitlements);
      this.decoratePreprocessingSteps(reloaded!);
      return reloaded!;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`Dataset with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };

  updateDataset = async (requestData: RequestData, slug: string, data: UpdateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const subject = getSubject(requestData);

    const dataset: DatasetEntity = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);

    repo.merge(dataset, {
      ...data,
      processing_steps: this.toProcessingSteps(data.preprocessing_steps),
      updated_by: subject,
      updated_at: new Date(),
    });

    const saved = await repo.save(dataset);
    // status and gis_datatype flip a dataset in/out of the DAI aggregate, which
    // counts PUBLISHED non-raster datasets only (publish/unpublish goes through here)
    if (data.gis_datatype !== undefined || data.status !== undefined) {
      // Async DAI refresh. startAfter keeps the worker from picking the job up
      // before this request's transaction commits (the enqueue goes through
      // pg-boss's own connection): a refresh computed from pre-commit state
      // would never be retried (retryLimit is 0).
      const jobService = new JobService();
      await jobService.createJob(
        requestData,
        {
          type: JobQueues.REFRESH_DAI_STATS,
          dataset_ids: [dataset.id],
        } as RefreshDaiStatsJob,
        { startAfter: DAI_REFRESH_START_AFTER_SECONDS },
      );
    }
    await bumpCacheEpoch();
    const reloaded = await repo.findOneBy({ id: saved.id });
    this.decorateWithCapabilities(reloaded!, requestData.entitlements);
    this.decoratePreprocessingSteps(reloaded!);
    return reloaded!;
  };

  deleteDataset = async (requestData: RequestData, slug: string, syncDaiRefresh = false): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
    const subject = getSubject(requestData);

    dataset.status = IngestionStatus.ARCHIVED;
    dataset.updated_by = subject;
    await dataset.save();
    await requestData.entityManager.getRepository(DatasetEntity).softRemove(dataset);
    if (syncDaiRefresh) {
      // The bulk-delete job hard-deletes the dataset_layers rows right after this
      // call, and the scoped refresh resolves affected features through them — so
      // it must run inline, before returning (see refreshDaiStats)
      await refreshDaiStats(requestData.entityManager, [dataset.id]);
    } else {
      // Async DAI refresh, delayed past the request transaction commit (see updateDataset)
      const jobService = new JobService();
      await jobService.createJob(
        requestData,
        {
          type: JobQueues.REFRESH_DAI_STATS,
          dataset_ids: [dataset.id],
        } as RefreshDaiStatsJob,
        { startAfter: DAI_REFRESH_START_AFTER_SECONDS },
      );
    }
    await bumpCacheEpoch();
  };

  getEpsgCodes = (): number[] => {
    return epsgList;
  };

  decorateWithCapabilities = (dataset: DatasetEntity, entitlements: Entitlements) => {
    // For private datasets, capabilities are determined by entitlements.
    // For public datasets, all capabilities are granted.
    dataset.capabilities = dataset.visibility === 'private' ? entitlements[dataset.slug] || [] : [Capability.PREVIEW, Capability.DOWNLOAD];
  };

  decoratePreprocessingSteps = (dataset: DatasetEntity) => {
    const ps = dataset.processing_steps as ProcessingSteps | null | undefined;
    dataset.preprocessing_steps = ps?.description ?? null;
  };

  private toProcessingSteps = (value: string | null | undefined): object | null => {
    return value ? { description: value } : null;
  };

  async getSoilData(requestData: RequestData, datasetFileMappingId: string, limit: number, cursor?: string, sort?: string) {
    const datasetFileMapping = await dfmService.getDatasetFileMapping(requestData, datasetFileMappingId);
    const dataMappingConfig = await dmService.parseDataMapping(requestData, datasetFileMapping.data_mapping_id!);
    const results = await vdl.getDataPreview(
      requestData.entityManager,
      dataMappingConfig,
      datasetFileMapping.file_id!,
      limit,
      true,
      cursor,
      sort,
    );
    return results;
  }

  async getSoilDataCount(requestData: RequestData, datasetFileMappingId: string): Promise<number> {
    const datasetFileMapping = await dfmService.getDatasetFileMapping(requestData, datasetFileMappingId);
    const dataMappingConfig = await dmService.parseDataMapping(requestData, datasetFileMapping.data_mapping_id!);
    return vdl.getDataCount(requestData.entityManager, dataMappingConfig, datasetFileMapping.file_id!);
  }

  async getSoilDataStats(requestData: RequestData, datasetFileMappingId: string): Promise<CleaningReport> {
    const datasetFileMapping = await dfmService.getDatasetFileMapping(requestData, datasetFileMappingId);
    const dataMappingConfig = await dmService.parseDataMapping(requestData, datasetFileMapping.data_mapping_id!);
    return vdl.getDataPreviewStats(requestData.entityManager, dataMappingConfig, datasetFileMapping.file_id!);
  }
}
