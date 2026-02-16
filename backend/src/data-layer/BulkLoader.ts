import { BulkLoadJob } from '../interfaces/Job';
import { Token } from '../interfaces/Token';
import DatasetService from '../services/DatasetService';
import { IngestionStatus } from '../types/data';
import { getEntityManager } from '../utils/data-source';

export default class BulkLoader {
  startBulkLoad = async (input: BulkLoadJob): Promise<void> => {
    const datasetService = new DatasetService();
    const entityManager = await getEntityManager();
    const token = { sub: input.created_by } as Token; // Only sub is required
    try {
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.ONGOING });
      // TODO: call bulk load endpoint
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.INGESTED });
    } catch (error: any) {
      // TODO: confirm dataset status on error
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.PENDING });
      throw error;
    }
  };
}
