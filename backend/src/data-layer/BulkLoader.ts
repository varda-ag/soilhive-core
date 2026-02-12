import BulkLoadEntity from '../entities/BulkLoad';
import { BulkLoad, BulkLoadStatus } from '../interfaces/BulkLoad';
import { Token } from '../interfaces/Token';
import DatasetService from '../services/DatasetService';
import { IngestionStatus } from '../types/data';
import { getDataSource, getEntityManager } from '../utils/data-source';

export default class BulkLoader {
  startBulkLoad = async (datasetService: DatasetService, input: BulkLoad, token: Token): Promise<void> => {
    const entityManager = await getEntityManager();
    try {
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.ONGOING });
      // TODO: call bulk load endpoint
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.INGESTED });
      this.setJobStatus(input.id, BulkLoadStatus.COMPLETED);
    } catch (error: any) {
      // TODO: confirm dataset status on error
      await datasetService.updateDataset({ entityManager, token }, input.dataset_id, { status: IngestionStatus.PENDING });
      this.setJobStatus(input.id, BulkLoadStatus.FAILED, error.toString());
    }
  };

  /**
   * Compares "updated_at" timestamp of ONGOING jobs with current time.
   * If the difference is over a certain threshold, it updates the job status to "FAILED".
   * This is to handle cases where the async job fails silently without updating the status (server restart).
   */
  checkOnRunningJobs = async (): Promise<void> => {
    // TODO: read from bulk_load table and update status
    return;
  };

  /**
   * Sets job status in DB, without using transactions
   */
  setJobStatus = async (id: string, status: BulkLoadStatus, description?: string): Promise<void> => {
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository(BulkLoadEntity);
    const data = await repo.findOneByOrFail({ id });
    data.status = status;
    if (description) {
      data.progress_description = description;
    }
    data.save();
  };
}
