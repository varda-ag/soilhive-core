import assert from 'assert';
import http from 'http';
import { StatusCodes } from 'http-status-codes';
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
import { ErrorResponse } from '../../utils/error';
import { getLoopbackUrl, getRawTableName, signToken } from '../../utils/utils';
import { updateDatasetMetadata } from './UpdateDatasetMetadata';
import { FileStorage } from '@flystorage/file-storage';
import FileService from '../../services/FileService';
import EntitlementService from '../../services/EntitlementService';
import { EVERYONE } from '../../constants/constants';

export async function processBulkLoad(job: Job<BulkLoadJob>): Promise<void> {
  const { data } = job;
  const { created_by } = job as unknown as BulkLoadJob;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  const entitlementService = new EntitlementService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, created_by ?? EVERYONE);
  const token = { sub: data.created_by } as Token; // Only sub is required
  const requestData = { entityManager, token, entitlements };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  try {
    dataset.status = IngestionStatus.ONGOING;
    await dataset.save();

    const mappingService = new DatasetFileMappingService();
    const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

    // Process all pending files associated with this mapping
    const files = await getPendingFilesWithMapping(entityManager, datasetFileMappings);
    for (const file of files) {
      const datasetFileMapping = datasetFileMappings.find(m => m.file_id === file.id);
      assert(datasetFileMapping, `No dataset file mapping found for file ${file.id}`);
      await processFile(file, requestData, datasetFileMapping, data.dataset_id);
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

    // Calculate new dataset metadata and update status
    await updateDatasetMetadata(entityManager, dataset.id, IngestionStatus.LOADED);
  } catch (error: any) {
    dataset.status = IngestionStatus.PENDING;
    await dataset.save();
    throw error;
  }
}

const getPendingFilesWithMapping = async (entityManager: EntityManager, mappings: DatasetFileMappingEntity[]): Promise<FileEntity[]> => {
  const repo = entityManager.getRepository(FileEntity);
  const files = await repo.find({ where: { status: IngestionStatus.PENDING, id: In(mappings.map(m => m.file_id)) } });
  return files;
};

const processFile = async (
  file: FileEntity,
  requestData: RequestData,
  datasetFileMapping: DatasetFileMappingEntity,
  datasetSlug: string,
) => {
  assert(datasetFileMapping.data_mapping_id, `No data mapping ID found for dataset file mapping ${datasetFileMapping.id}`);
  let cursor: string | undefined = undefined;
  const vdl = new VectorDataLoad();
  const service = new DataMappingService();
  const dataMappingConfig = await service.parseDataMapping(requestData, datasetFileMapping.data_mapping_id);
  const BATCH_SIZE = 100;
  const PAYLOAD_SIZE = 10;
  const PARALLELISM = 1;
  const limit = pLimit(PARALLELISM);
  while (true) {
    // Get the data from the preview
    const results = await vdl.getDataPreview(requestData.entityManager, dataMappingConfig, file.id, BATCH_SIZE, cursor);

    const payloads: SoilRecord[][] = [];
    for (let i = 0; i < results.length; i += PAYLOAD_SIZE) {
      payloads.push(results.slice(i, i + PAYLOAD_SIZE));
    }

    // Make parallel requests to the loopback endpoint for each record in the preview
    const promises = payloads.map(payload => limit(() => makeRequest(datasetSlug, datasetFileMapping.id, payload)));

    try {
      await Promise.all(promises);
    } catch (error) {
      throw new ErrorResponse(`Failed to process file ${file.id}: ${error}`, StatusCodes.INTERNAL_SERVER_ERROR);
    }

    if (results.length < BATCH_SIZE) {
      break;
    }

    cursor = results[results.length - 1]!['record_id'] as string;
  }
};

export const makeRequest = (datasetSlug: string, datasetFileMappingId: string, payload: any) =>
  new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const token = signToken('internal-request');

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
