import { EntityManager } from 'typeorm';
import RasterLayerEntity from '../entities/RasterLayer';

// Footprints unlinked per statement. Each takes its links to every layer of the dataset with it,
// so a statement removes up to this many times the dataset's layer count.
export const FOOTPRINT_CHUNK_SIZE = 10000;

const RASTER_LAYER_CHUNK_SIZE = 1000;

// Dataset Layers deleted per statement, as the Purge does (BulkDeleter). Each takes its observations
// with it by cascade.
export const DATASET_LAYER_CHUNK_SIZE = 1000;

/**
 * Deletes every Raster Layer of the Dataset, with its footprint links, assets and group memberships.
 * Footprints no other layer links to go by the orphan-footprint trigger. Run inside the caller's
 * transaction.
 */
export async function deleteRasterLayers(manager: EntityManager, datasetId: string): Promise<void> {
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
    .limit(RASTER_LAYER_CHUNK_SIZE)
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
}

/**
 * Deletes every Dataset Layer of the Dataset, and their observations by cascade. The features and
 * layers they leave unreferenced stay until the orphan sweep (SweepOrphanRowsJob): deleting them here
 * would fail the whole transaction whenever a concurrent load has just referenced one of them.
 *
 * In chunks, as the Purge does (BulkDeleter): one statement for a large Dataset would cascade into
 * millions of observations, which the caller's per-statement timeout would stop. Run inside the
 * caller's transaction, so a failure still removes nothing.
 */
export async function deleteDatasetLayers(
  manager: EntityManager,
  datasetId: string,
  chunkSize: number = DATASET_LAYER_CHUNK_SIZE,
): Promise<void> {
  while (true) {
    const [, deleted]: [unknown, number] = await manager.query(
      `DELETE FROM dataset_layers
       WHERE id IN (SELECT id FROM dataset_layers WHERE dataset_id = $1 LIMIT $2)`,
      [datasetId, chunkSize],
    );
    if (deleted < chunkSize) break;
  }
}
