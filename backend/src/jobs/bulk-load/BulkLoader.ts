import http from 'http';
import pLimit from 'p-limit';
import { Job } from 'pg-boss';
import { EntityManager, In } from 'typeorm';
import VectorDataLoad from '../../data-layer/VectorDataLoad';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileEntity from '../../entities/File';
import { BulkLoadJob } from '../../interfaces/Job';
import { SoilRecord } from '../../interfaces/Record';
import { RequestData } from '../../interfaces/RequestData';
import { Token } from '../../interfaces/Token';
import DataMappingService from '../../services/DataMappingService';
import DatasetFileMappingService from '../../services/DatasetFileMappingService';
import DatasetService from '../../services/DatasetService';
import { IngestionStatus } from '../../types/data';
import { getEntityManager } from '../../utils/data-source';
import { CleaningReport } from '../../interfaces/CleaningReport';
import { ProcessingSteps } from '../../interfaces/Dataset';
import { JobError } from '../../errors/JobError';
import ErrorService from '../../services/ErrorService';
import { ErrorResponse, getErrorMessage } from '../../utils/error';
import { getLoopbackUrl, getRawTableName, signToken } from '../../utils/utils';
import { updateDatasetMetadata } from './UpdateDatasetMetadata';
import { FileStorage } from '@flystorage/file-storage';
import FileService from '../../services/FileService';
import EntitlementService from '../../services/EntitlementService';
import { EVERYONE, INTERNAL_REQUEST_TOKEN_PAYLOAD } from '../../constants/constants';
import { createCursor, encodeCursor } from '../../utils/cursor';
import { updateJobState } from '../../services/PgBoss';
import { log } from '../../utils/logger';
import { DataCleaningConfig } from '../../interfaces/DataMapping';

// Record loading owns 0..LOAD_PROGRESS_CEILING; the remainder covers dataset metadata.
const LOAD_PROGRESS_CEILING = 90;

interface StagedFile {
  file: FileEntity;
  datasetFileMapping: DatasetFileMappingEntity;
  dataMappingConfig: DataCleaningConfig;
  recordCount: number;
}

export async function processBulkLoad(job: Job<BulkLoadJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { created_by } = job as unknown as BulkLoadJob;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const entitlementService = new EntitlementService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, created_by ?? EVERYONE);
  const token = { sub: data.created_by } as Token; // Only sub is required
  const requestData = { entityManager, token, entitlements };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const reportProgress = progressReporter(jobId);
  try {
    await reportProgress(0, `Bulk load started for dataset '${dataset.name}'`);

    dataset.status = IngestionStatus.ONGOING;
    await dataset.save();

    const mappingService = new DatasetFileMappingService();
    const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

    // Process all pending files associated with this mapping
    const files = await getStagedFilesWithMapping(entityManager, datasetFileMappings);

    // Resolve every mapping and count every file before writing anything, so the progress
    // denominator spans the whole job and a missing mapping aborts before a partial load.
    await reportProgress(0, `Counting records in ${files.length} file(s)...`);
    const stagedFiles = await prepareStagedFiles(requestData, files, datasetFileMappings);
    const totalRecords = stagedFiles.reduce((sum, staged) => sum + staged.recordCount, 0);

    const cleaningSteps: Record<string, CleaningReport> = {};
    let recordsProcessed = 0;
    let lastPercentage = 0;
    for (const [index, staged] of stagedFiles.entries()) {
      const { file, datasetFileMapping, dataMappingConfig } = staged;
      const loading = `Loading '${file.name}' (${index + 1} of ${stagedFiles.length})...`;
      await reportProgress(loadPercentage(recordsProcessed, totalRecords), loading);
      await processFile(file, requestData, datasetFileMapping, dataMappingConfig, data.dataset_id, async recordsLoaded => {
        recordsProcessed += recordsLoaded;
        const percentage = loadPercentage(recordsProcessed, totalRecords);
        // Only write when the rendered percentage actually moves — batches are far
        // shorter than the client poll interval, so per-batch writes are invisible.
        if (percentage !== lastPercentage) {
          lastPercentage = percentage;
          await reportProgress(percentage, loading);
        }
      });
      await reportProgress(loadPercentage(recordsProcessed, totalRecords), `Computing cleaning statistics for '${file.name}'...`);
      try {
        cleaningSteps[file.slug] = await datasetService.getSoilDataStats(requestData, datasetFileMapping.id);
      } catch (error: any) {
        throw new JobError('BL_STATS_FETCH_FAILED', {}, error?.detail ?? error?.message);
      }
      file.status = IngestionStatus.LOADED;
      await file.save();
      // Delete raw table
      const rawTableName = getRawTableName(file.id);
      await entityManager.query(`DROP TABLE IF EXISTS "${process.env.POSTGRES_SCHEMA}"."${rawTableName}"`);
      if (data.delete_source_files) {
        // Delete source files
        const storage: FileStorage = FileService.getStorageEngine();
        storage.deleteFile(file.file_path);
      }
    }

    const existingSteps = (dataset.processing_steps ?? {}) as ProcessingSteps;
    dataset.processing_steps = {
      ...existingSteps,
      cleaning_steps: { ...existingSteps.cleaning_steps, ...cleaningSteps },
    };
    await dataset.save();

    // Calculate new dataset metadata and update status
    await reportProgress(LOAD_PROGRESS_CEILING, 'Computing dataset metadata...');
    await updateDatasetMetadata(entityManager, dataset.id, IngestionStatus.LOADED);

    // The job is still active here, so this last write lands; once the processor
    // returns, updateJobState's `state = 'active'` guard makes it a no-op.
    await reportProgress(100, 'Bulk load complete');
  } catch (error: any) {
    dataset.status = IngestionStatus.PENDING;
    await dataset.save();
    throw error;
  }
}

const getStagedFilesWithMapping = async (entityManager: EntityManager, mappings: DatasetFileMappingEntity[]): Promise<FileEntity[]> => {
  const repo = entityManager.getRepository(FileEntity);
  const files = await repo.find({ where: { status: IngestionStatus.STAGED, id: In(mappings.map(m => m.file_id)) } });
  return files;
};

// Progress is telemetry: a failed write must never abort a load that is otherwise fine.
const progressReporter =
  (jobId: string) =>
  async (progress_percentage: number, progress_description: string): Promise<void> => {
    try {
      await updateJobState(jobId, { progress_percentage, progress_description });
    } catch (error) {
      log.warn('Failed to write bulk load progress', { job_id: jobId, error: getErrorMessage(error) });
    }
  };

const loadPercentage = (recordsProcessed: number, totalRecords: number): number =>
  totalRecords > 0 ? Math.round((LOAD_PROGRESS_CEILING * recordsProcessed) / totalRecords) : 0;

const prepareStagedFiles = async (
  requestData: RequestData,
  files: FileEntity[],
  mappings: DatasetFileMappingEntity[],
): Promise<StagedFile[]> => {
  const vdl = new VectorDataLoad();
  const service = new DataMappingService();
  const stagedFiles: StagedFile[] = [];
  for (const file of files) {
    const datasetFileMapping = mappings.find(m => m.file_id === file.id);
    if (!datasetFileMapping || !datasetFileMapping.data_mapping_id) {
      throw new JobError('BL_MISSING_COLUMN_MAPPING');
    }
    const dataMappingConfig = await service.parseDataMapping(requestData, datasetFileMapping.data_mapping_id);
    let recordCount: number;
    try {
      // includeUserDropped = false to match how processFile pages the same file.
      recordCount = await vdl.getDataCount(requestData.entityManager, dataMappingConfig, file.id, false);
    } catch (error: any) {
      throw parseRawTableError(error);
    }
    stagedFiles.push({ file, datasetFileMapping, dataMappingConfig, recordCount });
  }
  return stagedFiles;
};

const parseRawTableError = (error: any): JobError => {
  if (error?.code === '42P01' || /does not exist/.test(error?.detail ?? error?.message ?? '')) {
    return new JobError('BL_RAW_TABLE_NOT_FOUND', {}, error?.detail ?? error?.message);
  }
  return new JobError('BL_RECORD_WRITE_FAILED', {}, error?.detail ?? error?.message);
};

const processFile = async (
  file: FileEntity,
  requestData: RequestData,
  datasetFileMapping: DatasetFileMappingEntity,
  dataMappingConfig: DataCleaningConfig,
  datasetSlug: string,
  onBatchLoaded: (recordsLoaded: number) => Promise<void>,
) => {
  let cursor: string | undefined = undefined;
  const vdl = new VectorDataLoad();
  const BATCH_SIZE = 100;
  const PAYLOAD_SIZE = 10;
  const PARALLELISM = 1;
  const limit = pLimit(PARALLELISM);
  while (true) {
    // Get the data from the preview
    let results;
    try {
      results = await vdl.getDataPreview(requestData.entityManager, dataMappingConfig, file.id, BATCH_SIZE, false, cursor);
    } catch (error: any) {
      throw parseRawTableError(error);
    }

    const payloads: SoilRecord[][] = [];
    for (let i = 0; i < results.length; i += PAYLOAD_SIZE) {
      payloads.push(results.slice(i, i + PAYLOAD_SIZE));
    }

    // Make parallel requests to the loopback endpoint for each record in the preview
    const promises = payloads.map(payload => limit(() => makeRequest(datasetSlug, datasetFileMapping.id, payload)));

    try {
      await Promise.all(promises);
    } catch (error: any) {
      throw parseWriteError(error);
    }

    // Reported after the writes land, so progress only ever counts persisted records.
    await onBatchLoaded(results.length);

    if (results.length < BATCH_SIZE) {
      break;
    }

    const cursorValue = results[results.length - 1]!['record_id'] as string;
    cursor = encodeCursor(createCursor(cursorValue));
  }
};

export const parseWriteError = (error: any): JobError => {
  const raw: string = error?.message ?? '';
  const jsonStart = raw.indexOf('Failed to load data: ');
  if (jsonStart !== -1) {
    try {
      const body = JSON.parse(raw.slice(jsonStart + 'Failed to load data: '.length));
      if (Array.isArray(body?.errors) && body.errors.length > 0) {
        const first = body.errors[0];
        const field = String(first.path ?? '')
          .split('/')
          .filter(Boolean)
          .filter(seg => seg !== 'body' && isNaN(Number(seg)))
          .join('.');
        const issue = String(first.message ?? '');
        if (field && issue) {
          return new JobError('BL_RECORD_VALIDATION_FAILED', { field, issue }, raw);
        }
      }
    } catch {
      // not parseable — fall through
    }
  }
  return new JobError('BL_RECORD_WRITE_FAILED', {}, error?.detail ?? raw);
};

export const makeRequest = (datasetSlug: string, datasetFileMappingId: string, payload: any) =>
  new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const token = signToken(INTERNAL_REQUEST_TOKEN_PAYLOAD);

    const url = new URL(`${getLoopbackUrl()}/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`);
    const options = {
      method: 'POST',
      payload: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        Authorization: `Bearer ${token}`,
      },
    };
    const clientReq = http.request(url, options, serverRes => {
      let data = '';
      serverRes.on('data', chunk => (data += chunk));
      serverRes.on('end', () => {
        if (serverRes.statusCode !== 201) {
          reject(new ErrorResponse(`Failed to load data: ${data}`, serverRes.statusCode));
        } else {
          const response = { status: serverRes.statusCode, data: data ? JSON.parse(data) : undefined };
          resolve(response);
        }
      });
    });
    clientReq.on('error', reject);
    clientReq.write(postData); // Send JSON payload
    clientReq.end();
  });
