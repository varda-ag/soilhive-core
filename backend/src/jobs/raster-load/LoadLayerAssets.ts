import { EntityManager } from 'typeorm';
import { log } from '../../utils/logger';

/** One Raster Layer and the Files its Band Mapping declared as assets, already validated. */
export interface StagedLayerAssets {
  rasterLayerId: string;
  fileIds: string[];
}

/**
 * Makes each Raster Layer's assets exactly the Files its Band Mapping declares: unlinks the ones the
 * mapping has stopped declaring, then attaches the missing ones. The Band Mapping is authoritative
 * for assets as it is for every other layer field, so removing a resource from it removes the asset.
 *
 * Layers absent from `staged` are left alone, so a caller passes every layer of the files it loaded,
 * including the ones that declare no assets.
 */
export const syncRasterLayerAssets = async (entityManager: EntityManager, staged: StagedLayerAssets[]): Promise<void> => {
  if (staged.length === 0) {
    return;
  }
  // A raw DELETE resolves to [rows, rowCount].
  const [, removed]: [unknown[], number] = await entityManager.query(
    `DELETE FROM raster_layer_assets a
     USING jsonb_to_recordset($1::jsonb) AS s(raster_layer_id uuid, file_ids uuid[])
     WHERE a.raster_layer_id = s.raster_layer_id AND NOT (a.file_id = ANY(s.file_ids))`,
    [JSON.stringify(staged.map(({ rasterLayerId, fileIds }) => ({ raster_layer_id: rasterLayerId, file_ids: fileIds })))],
  );
  if (removed > 0) {
    log.info('Raster layer assets unlinked', { removed });
  }
  await createRasterLayerAssets(entityManager, staged);
};

/**
 * Attaches auxiliary Files to Raster Layers.
 *
 * A Raster Layer Asset is identified by the pair (raster layer, file), so this adds nothing it
 * already added. Unlinking what a mapping stopped declaring is syncRasterLayerAssets' job.
 *
 * The ON CONFLICT target repeats the index predicate because Postgres will not infer a *partial*
 * unique index from a bare column list.
 *
 * Assets are written after every band has been ingested rather than inside the band loop, so a
 * load that fails part-way leaves no assets attached to layers whose siblings never made it.
 */
export const createRasterLayerAssets = async (entityManager: EntityManager, staged: StagedLayerAssets[]): Promise<number> => {
  const pairs = staged.flatMap(({ rasterLayerId, fileIds }) => fileIds.map(fileId => ({ rasterLayerId, fileId })));
  if (pairs.length === 0) {
    return 0;
  }

  const values = pairs.map((_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2}::uuid)`).join(', ');
  const parameters = pairs.flatMap(({ rasterLayerId, fileId }) => [rasterLayerId, fileId]);

  const inserted: unknown[] = await entityManager.query(
    `INSERT INTO raster_layer_assets (raster_layer_id, file_id)
     VALUES ${values}
     ON CONFLICT (raster_layer_id, file_id) WHERE deleted_at IS NULL DO NOTHING
     RETURNING id`,
    parameters,
  );

  log.info('Raster layer assets attached', { declared: pairs.length, created: inserted.length });
  return inserted.length;
};
