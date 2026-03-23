import { Job } from 'pg-boss';
import { BulkDeleteJob } from '../../interfaces/Job';
import { Token } from '../../interfaces/Token';
import DatasetService from '../../services/DatasetService';
import { getEntityManager } from '../../utils/data-source';
import DatasetLayerEntity from '../../entities/DatasetLayer';

export async function processBulkDeletion(job: Job<BulkDeleteJob>): Promise<void> {
  const { data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  const token = { sub: data.created_by } as Token; // Only sub is required
  const requestData = { entityManager, token };
  const datasetId = (await datasetService.getDataset(requestData, data.dataset_id)).id;

  await entityManager.transaction(async manager => {
    await manager.query(`SET LOCAL statement_timeout = '5min'`);
    const chunkSize = 1000;
    const subQuery = manager
      .getRepository(DatasetLayerEntity)
      .createQueryBuilder('dl')
      .select('dl.id')
      .where('dl.dataset_id = :datasetId', { datasetId })
      .limit(chunkSize)
      .getQuery();

    while (true) {
      const deleted = await manager
        .getRepository(DatasetLayerEntity)
        .createQueryBuilder()
        .delete()
        .where(`id IN (${subQuery})`)
        .setParameter('datasetId', datasetId)
        .returning(['layer_id', 'feature_id'])
        .execute()
        .then(res => res.raw);

      if (deleted.length === 0) break;

      const featureIds = [...new Set(deleted.map(r => r.feature_id))];
      const layerIds = [...new Set(deleted.map(r => r.layer_id))];

      if (featureIds.length > 0) {
        await manager.query(
          `
          DELETE FROM features f
          WHERE f.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM dataset_layers dl
            WHERE dl.feature_id = f.id
          )
          `,
          [featureIds],
        );
      }

      if (layerIds.length > 0) {
        await manager.query(
          `
          DELETE FROM layers l
          WHERE l.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM dataset_layers dl
            WHERE dl.layer_id = l.id
          )
          `,
          [layerIds],
        );
      }
    }

    const scopedRequestData = { ...requestData, entityManager: manager };
    await datasetService.deleteDataset(scopedRequestData, data.dataset_id);
  });
}
