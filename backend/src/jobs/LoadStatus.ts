import { EntityManager } from 'typeorm';
import DatasetEntity from '../entities/Dataset';
import { refreshDaiStats } from '../data-layer/DaiStats';
import { IngestionStatus } from '../types/data';
import { bumpCacheEpoch } from '../utils/cache-epoch';

/**
 * Hides the Dataset for the duration of a load by moving it to ONGOING. Status is what every public
 * read filters on, so a PUBLISHED Dataset taking more files disappears from the catalog, queries and
 * the DAI rollup until the load ends, rather than being served half-loaded. The caller keeps the
 * status the Dataset had before this, to hand it back with statusAfterLoad / statusAfterFailedLoad.
 *
 * Hiding a PUBLISHED Dataset is a status change like any other, so it honours the same staleness
 * contract: the DAI rollup is refreshed and the cache epoch bumped here, not when the job ends.
 */
export const hideDatasetForLoad = async (entityManager: EntityManager, dataset: DatasetEntity): Promise<void> => {
  const wasPublished = dataset.status === IngestionStatus.PUBLISHED;
  dataset.status = IngestionStatus.ONGOING;
  await dataset.save();
  if (wasPublished) {
    await refreshDaiStats(entityManager, [dataset.id]);
    await bumpCacheEpoch();
  }
};

/** A PUBLISHED Dataset goes back on show once its new files are in; anything else ends up LOADED. */
export const statusAfterLoad = (previousStatus: IngestionStatus): IngestionStatus =>
  previousStatus === IngestionStatus.PUBLISHED ? IngestionStatus.PUBLISHED : IngestionStatus.LOADED;

/**
 * A failed load gives a PUBLISHED or LOADED Dataset its status back rather than demoting it, since
 * the data it held before the load is still there. Anything else, including an ONGOING left behind
 * by a worker that died mid-load, falls back to PENDING.
 */
export const statusAfterFailedLoad = (previousStatus: IngestionStatus): IngestionStatus =>
  previousStatus === IngestionStatus.PUBLISHED || previousStatus === IngestionStatus.LOADED ? previousStatus : IngestionStatus.PENDING;
