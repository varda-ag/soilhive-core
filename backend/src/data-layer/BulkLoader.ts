import { EntityManager, In } from 'typeorm';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import FileEntity from '../entities/File';
import { BulkLoadJob } from '../interfaces/Job';
import { Token } from '../interfaces/Token';
import DatasetFileMappingService from '../services/DatasetFileMappingService';
import DatasetService from '../services/DatasetService';
import { IngestionStatus } from '../types/data';
import { getEntityManager } from '../utils/data-source';
import VectorDataLoad from './VectorDataLoad';

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
      const tables = this.getTables(files);
      tables.forEach(_table => {
        // TODO: call bulk load endpoint
      });

      dataset.status = IngestionStatus.INGESTED;
      await dataset.save();
    } catch (error: any) {
      // TODO: confirm dataset status on error
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

  private getTables = (files: FileEntity[]): string[] => {
    return files.map(f => VectorDataLoad.getRawTableName(f.id));
  };
}
