import assert from 'assert';
import http from 'http';
import pLimit from 'p-limit';
import { EntityManager, In } from 'typeorm';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import FileEntity from '../entities/File';
import { BulkLoadJob } from '../interfaces/Job';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import DataMappingService from '../services/DataMappingService';
import DatasetFileMappingService from '../services/DatasetFileMappingService';
import DatasetService from '../services/DatasetService';
import { IngestionStatus } from '../types/data';
import { getEntityManager } from '../utils/data-source';
import { getLoopbackUrl } from '../utils/utils';
import VectorDataLoad from './VectorDataLoad';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import { SoilRecord } from '../interfaces/Record';

export default class BulkLoader {
  startBulkLoad = async (input: BulkLoadJob): Promise<void> => {
    const datasetService = new DatasetService();
    const entityManager = await getEntityManager();
    const token = { sub: input.created_by } as Token; // Only sub is required
    const requestData = { entityManager, token };
    const dataset = await datasetService.getDataset(requestData, input.dataset_id);
    try {
      dataset.status = IngestionStatus.ONGOING;
      await dataset.save();

      const mappingService = new DatasetFileMappingService();
      const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);
      const files = await this.getPendingFilesWithMapping(entityManager, datasetFileMappings);
      for (const file of files) {
        const datasetFileMapping = datasetFileMappings.find(m => m.file_id === file.id);
        assert(datasetFileMapping, `No dataset file mapping found for file ${file.id}`);
        await this.processFile(file, requestData, datasetFileMapping, input.dataset_id);
        file.status = IngestionStatus.INGESTED;
        await file.save();
      }

      dataset.status = IngestionStatus.INGESTED;
      await dataset.save();
    } catch (error: any) {
      dataset.status = IngestionStatus.PENDING;
      await dataset.save();
      throw error;
    }
  };

  private getPendingFilesWithMapping = async (
    entityManager: EntityManager,
    mappings: DatasetFileMappingEntity[],
  ): Promise<FileEntity[]> => {
    const repo = entityManager.getRepository(FileEntity);
    const files = await repo.find({ where: { status: IngestionStatus.PENDING, id: In(mappings.map(m => m.file_id)) } });
    return files;
  };

  private processFile = async (
    file: FileEntity,
    requestData: RequestData,
    datasetFileMapping: DatasetFileMappingEntity,
    datasetSlug: string,
  ) => {
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
      const promises = payloads.map(payload => limit(() => this.makeRequest(datasetSlug, datasetFileMapping.id, payload)));

      try {
        await Promise.all(promises);
      } catch (error) {
        throw new ErrorResponse(`Failed to process file ${file.id}: ${(error as Error).message}`, StatusCodes.INTERNAL_SERVER_ERROR);
      }

      if (results.length < BATCH_SIZE) {
        break;
      }

      cursor = results[results.length - 1]!['record_id'] as string;
    }
  };

  public makeRequest = (datasetSlug: string, datasetFileMappingId: string, payload: any) =>
    new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const url = `${getLoopbackUrl()}/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`;
      const options = {
        url,
        method: 'POST',
        payload: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };
      const clientReq = http.request(options, serverRes => {
        let data = '';
        serverRes.on('data', chunk => (data += chunk));
        serverRes.on('end', () => resolve({ status: serverRes.statusCode, data: JSON.parse(data) }));
      });
      clientReq.on('error', reject);
      clientReq.write(postData); // Send JSON payload
      clientReq.end();
    });
}
