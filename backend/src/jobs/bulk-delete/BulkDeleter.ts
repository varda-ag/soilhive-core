import { Job } from 'pg-boss';
import { QueryFailedError } from 'typeorm';
import { BulkDeleteJob } from '../../interfaces/Job';
import { Token } from '../../interfaces/Token';
import DatasetService from '../../services/DatasetService';
import { getEntityManager } from '../../utils/data-source';
import { JobError } from '../../errors/JobError';
import DatasetLayerEntity from '../../entities/DatasetLayer';
import { GISDataType } from '../../types/data';
import RasterLayerEntity from '../../entities/RasterLayer';
import { refreshDaiStats } from '../../data-layer/DaiStats';
import { bumpCacheEpoch } from '../../utils/cache-epoch';
import ErrorService from '../../services/ErrorService';
import EntitlementService from '../../services/EntitlementService';
import { EntitlementScope } from '../../types/Entitlements';

// Postgres: query_canceled — raised when a statement exceeds the `statement_timeout` set below.
const STATEMENT_TIMEOUT_CODE = '57014';

// Footprints unlinked per statement. Each takes its links to every layer of the dataset with it,
// so a statement removes up to this many times the dataset's layer count.
export const FOOTPRINT_CHUNK_SIZE = 10000;

export async function processBulkDeletion(job: Job<BulkDeleteJob>): Promise<void> {
  const { data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const token = { sub: data.created_by, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin } as Token;
  const requestData = { entityManager, token, entitlements: {} };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const datasetId = dataset.id;
  const chunkSize = 1000;

  // First set dataset as deleted; the DAI refresh must be synchronous here so it
  // still sees the dataset_layers rows deleted below
  await datasetService.deleteDataset(requestData, data.dataset_id, true);
  // Then, remove linked entities in a separate transaction
  try {
    await entityManager.transaction(async manager => {
      await manager.query(`SET LOCAL statement_timeout = '5min'`);

      // Entitlements to the dataset die with its data, not with the soft-deletion above: a
      // stripped jsonb key has no `deleted_at`, so it can only be undone by rolling back this
      // transaction. Above the data-type fork because it applies to both, and because the
      // raster branch returns early (ADR 0027).
      await new EntitlementService().deleteEntityEntitlements(
        { ...requestData, entityManager: manager },
        EntitlementScope.DATASETS,
        dataset.slug,
      );

      if (dataset.gis_datatype === GISDataType.RASTER) {
        // A raster layer has hundreds of thousands of footprint links, so letting the raster_layers
        // delete cascade into them puts millions of rows in one statement. Unlink in batches of
        // footprints first, taking each footprint's links to every layer of the dataset at once:
        // the group triggers then recompute each footprint once, from its final layer set.
        const layerIds: string[] = (await manager.query(`SELECT id FROM raster_layers WHERE dataset_id = $1`, [datasetId])).map(
          (r: { id: string }) => r.id,
        );

        // Batches page through each layer's links by footprint id. Restarting the scan from the
        // layer's first link would walk every link earlier batches deleted: dead index entries stay
        // until a vacuum, which cannot run while this transaction is open.
        for (const layerId of layerIds) {
          let after = '00000000-0000-0000-0000-000000000000';
          while (true) {
            // A data-modifying CTE always runs, whether or not the outer query reads it
            const [last]: { raster_footprint_id: string }[] = await manager.query(
              `WITH batch AS MATERIALIZED (
                 SELECT raster_footprint_id FROM raster_layer_footprints
                 WHERE raster_layer_id = $2 AND raster_footprint_id > $3
                 ORDER BY raster_footprint_id
                 LIMIT $4
               ),
               unlinked AS (
                 DELETE FROM raster_layer_footprints
                 WHERE raster_layer_id = ANY($1::uuid[])
                   AND raster_footprint_id IN (SELECT raster_footprint_id FROM batch)
               )
               SELECT raster_footprint_id FROM batch ORDER BY raster_footprint_id DESC LIMIT 1`,
              [layerIds, layerId, after, FOOTPRINT_CHUNK_SIZE],
            );
            if (!last) break;
            after = last.raster_footprint_id;
          }
        }

        // The assets and group memberships that reference the layers cascade with them
        const subQuery = manager
          .getRepository(RasterLayerEntity)
          .createQueryBuilder('rl')
          .select('rl.id')
          .where('rl.dataset_id = :datasetId', { datasetId })
          .limit(chunkSize)
          .getQuery();

        while (true) {
          const deleted = await manager
            .getRepository(RasterLayerEntity)
            .createQueryBuilder()
            .delete()
            .where(`id IN (${subQuery})`)
            .setParameter('datasetId', datasetId)
            .returning(['id'])
            .execute()
            .then(res => res.raw);

          if (deleted.length === 0) break;
        }
        return;
      }
      const subQuery = manager
        .getRepository(DatasetLayerEntity)
        .createQueryBuilder('dl')
        .select('dl.id')
        .where('dl.dataset_id = :datasetId', { datasetId })
        .limit(chunkSize)
        .getQuery();

      const schema = process.env.POSTGRES_SCHEMA;

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
          DELETE FROM  "${schema}".features f
          WHERE f.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM "${schema}".dataset_layers dl
            WHERE dl.feature_id = f.id
          )
          `,
            [featureIds],
          );
        }

        if (layerIds.length > 0) {
          await manager.query(
            `
          DELETE FROM "${schema}".layers l
          WHERE l.id = ANY($1)
          AND NOT EXISTS (
            SELECT 1 FROM "${schema}".dataset_layers dl
            WHERE dl.layer_id = l.id
          )
          `,
            [layerIds],
          );
        }
      }
    });
  } catch (error) {
    // Roll back dataset status and soft-deletion, refresh DAI and invalidate cache
    await dataset.save();
    await refreshDaiStats(entityManager, [datasetId]);
    await bumpCacheEpoch();
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === STATEMENT_TIMEOUT_CODE) {
      throw new JobError('BD_TIMEOUT', { dataset_name: dataset.name });
    }
    throw error;
  }
}
