import { EntityManager } from 'typeorm';
import { log } from '../../utils/logger';

/** One Raster Layer and the Files its Band Mapping declared as assets, already validated. */
export interface StagedLayerAssets {
  rasterLayerId: string;
  fileIds: string[];
}

/**
 * Attaches auxiliary Files to the Raster Layers a Raster Load just created.
 *
 * A Raster Layer Asset is identified by the pair (raster layer, file), and this is insert-only:
 * a re-run of a Raster Load adds nothing it already added, but it also never *unlinks* an asset
 * the Band Mapping has stopped declaring. That asymmetry with the Raster Layer's own fields —
 * which the ingest refreshes from the mapping — is deliberate: unlinking would mean deciding
 * whether an asset removed from a mapping was retracted or merely edited elsewhere.
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
