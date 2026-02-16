//import { DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import { BulkLoadJob } from '../interfaces/Job';
import { Token } from '../interfaces/Token';
//import DatasetFileMappingService from '../services/DatasetFileMappingService';
import DatasetService from '../services/DatasetService';
import { IngestionStatus } from '../types/data';
import { getEntityManager } from '../utils/data-source';

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

      //const mappingService = new DatasetFileMappingService();
      //const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

      // TODO: call bulk load endpoint
      //
      //

      dataset.status = IngestionStatus.INGESTED;
      await dataset.save();
    } catch (error: any) {
      // TODO: confirm dataset status on error
      dataset.status = IngestionStatus.PENDING;
      await dataset.save();
      throw error;
    }
  };

  // private getPendingFilesWithMapping = async (mappings: DatasetFileMappingResponse[]) => {
  // };
}
