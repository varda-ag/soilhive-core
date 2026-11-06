import { EntityManager, In, IsNull, QueryFailedError } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import DatasetEntity from '../entities/Dataset';
import { GISDataType, IngestionStatus } from '../types/data';
import { hasRasterFileToLoad } from './DatasetJobs';
import { ErrorResponse } from '../utils/error';
import { getRawTableName } from '../utils/utils';
import { deleteDatasetLayers, deleteRasterLayers } from './DatasetRows';

// Postgres: unique_violation
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * The open Version of each of the given Datasets, keyed by the Dataset's id. At most one each: the
 * IDX_datasets_version_of_open index refuses a second.
 */
export async function getOpenVersions(entityManager: EntityManager, datasetIds: string[]): Promise<Map<string, DatasetEntity>> {
  if (datasetIds.length === 0) {
    return new Map();
  }
  const versions = await entityManager.getRepository(DatasetEntity).findBy({ version_of: In(datasetIds), deleted_at: IsNull() });
  return new Map(versions.map(v => [v.version_of!, v]));
}

/**
 * Refuses with 409 deleting a Version, which is discarded instead, or a Dataset with an open Version,
 * whose Version would be left pointing at a deleted Dataset.
 */
export async function assertNotVersioned(entityManager: EntityManager, dataset: DatasetEntity): Promise<void> {
  if (dataset.version_of) {
    throw new ErrorResponse(`Dataset '${dataset.name}' is a version of another dataset: discard the version instead`, StatusCodes.CONFLICT);
  }
  const version = (await getOpenVersions(entityManager, [dataset.id])).get(dataset.id);
  if (version) {
    throw new ErrorResponse(
      `Dataset '${dataset.name}' has an open version (${version.slug}): publish or discard it first`,
      StatusCodes.CONFLICT,
    );
  }
}

/**
 * Marks a Version discarded, as a bulk delete marks a Dataset deleted: ARCHIVED and soft-deleted.
 * From then on it's no open Version (getOpenVersions, IDX_datasets_version_of_open and the name's
 * unique index all skip soft-deleted rows), so a new one can be opened, under the same name, while
 * version-discard removes this one's data.
 */
export async function softDeleteVersion(manager: EntityManager, version: DatasetEntity): Promise<void> {
  await manager.query(`UPDATE datasets SET status = $2, deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`, [
    version.id,
    IngestionStatus.ARCHIVED,
  ]);
}

/**
 * Why the Version can't be published into the Dataset now, or null when it can. Checked by the
 * publish route and again by the job, which may run after either has changed.
 *
 * A Version with Files still to load is refused: published, they would sit in a PUBLISHED Dataset,
 * which no load may ingest into. "To load" is what a load would ingest: a vector File not LOADED, a
 * raster File waiting with a band mapped (hasRasterFileToLoad); a raster File with no band mapped is
 * skipped by every load, so it doesn't count.
 */
export async function publishableReason(manager: EntityManager, dataset: DatasetEntity, version: DatasetEntity): Promise<string | null> {
  if (version.version_of !== dataset.id) return 'it is not a version of it';
  if (dataset.status !== IngestionStatus.PUBLISHED) return 'the dataset is not published';
  if (version.status !== IngestionStatus.LOADED) return 'the version has no loaded data';
  const filesToLoad =
    version.gis_datatype === GISDataType.RASTER
      ? await hasRasterFileToLoad(manager, version.id)
      : (
          await manager.query(
            `SELECT 1 FROM dataset_file_mappings dfm
             JOIN files f ON f.id = dfm.file_id
             WHERE dfm.dataset_id = $1 AND dfm.deleted_at IS NULL AND f.deleted_at IS NULL AND f.status <> $2
             LIMIT 1`,
            [version.id, IngestionStatus.LOADED],
          )
        ).length > 0;
  return filesToLoad ? 'the version has files not loaded yet' : null;
}

/**
 * Moves everything loaded into a Version (v2) into the Dataset it is a version of (v1), the same rows
 * loading v2's Files into v1 would have given. Run inside the publish transaction, so readers see v1's
 * old data until it commits, and a failure moves nothing.
 *
 * - A v2 Dataset Layer v1 already has, on (feature, layer, soil property), is a collision: its
 *   observations go to v1's, an identical one (value and procedure, as UQ_observations_… compares
 *   them, NULLs equal) dropped as a load drops it, and it is deleted with what's left. The key
 *   columns are never NULL, so plain equality matches them.
 * - The rest of v2's Dataset Layers, Raster Layers and Dataset File Mappings are re-pointed to v1.
 *   Raster Layer groups are keyed by their layers' ids, not their Dataset (ADR 0046), so they and the
 *   footprint links are untouched.
 *
 * Returns the ids of v2's Files, for deleting their uploads once published.
 */
export async function moveVersionRows(manager: EntityManager, datasetId: string, versionId: string): Promise<string[]> {
  const fileIds = await mappedFileIds(manager, versionId);

  // Observations have no other column than these and their id
  await manager.query(
    `INSERT INTO observations (dataset_layer_id, value, procedure_id)
     SELECT dl1.id, o.value, o.procedure_id
     FROM dataset_layers dl2
     JOIN observations o ON o.dataset_layer_id = dl2.id
     JOIN dataset_layers dl1
       ON dl1.dataset_id = $1
      AND dl1.feature_id = dl2.feature_id
      AND dl1.layer_id = dl2.layer_id
      AND dl1.soil_property_id = dl2.soil_property_id
     WHERE dl2.dataset_id = $2
     ON CONFLICT ON CONSTRAINT "UQ_observations_dataset_layer_id_value_procedure_id" DO NOTHING`,
    [datasetId, versionId],
  );
  // Their own observations go with them by cascade
  await manager.query(
    `DELETE FROM dataset_layers dl2
     USING dataset_layers dl1
     WHERE dl2.dataset_id = $2
       AND dl1.dataset_id = $1
       AND dl1.feature_id = dl2.feature_id
       AND dl1.layer_id = dl2.layer_id
       AND dl1.soil_property_id = dl2.soil_property_id`,
    [datasetId, versionId],
  );
  await manager.query(`UPDATE dataset_layers SET dataset_id = $1 WHERE dataset_id = $2`, [datasetId, versionId]);
  await manager.query(`UPDATE raster_layers SET dataset_id = $1 WHERE dataset_id = $2`, [datasetId, versionId]);
  await manager.query(`UPDATE dataset_file_mappings SET dataset_id = $1, updated_at = now() WHERE dataset_id = $2`, [datasetId, versionId]);
  return fileIds;
}

/**
 * Puts back a Version whose discard failed, as a failed bulk delete puts its Dataset back: no longer
 * deleted, with the status it had. It then shows again in the admin list with the job's error, and
 * can be discarded again.
 *
 * Not when a Version of the same Dataset has been opened since, or its name taken: restoring it would
 * break IDX_datasets_version_of_open or the name's unique index. It stays discarded then, and the
 * orphan sweep queues its discard again (requeueUnfinishedDiscards). Returns whether it was restored.
 */
export async function restoreDiscardedVersion(manager: EntityManager, version: DatasetEntity, status: IngestionStatus): Promise<boolean> {
  try {
    const [, restored]: [unknown, number] = await manager.query(
      `UPDATE datasets v
       SET status = $2, deleted_at = NULL, updated_at = now()
       WHERE v.id = $1
         AND v.deleted_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM datasets o WHERE o.version_of = v.version_of AND o.deleted_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM datasets n WHERE n.name = v.name AND n.deleted_at IS NULL)`,
      [version.id, status],
    );
    return restored > 0;
  } catch (error) {
    // A Version opened between the check and the update: it keeps its place
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === UNIQUE_VIOLATION_CODE) {
      return false;
    }
    throw error;
  }
}

/** The Files mapped to the Dataset, by id. */
const mappedFileIds = async (manager: EntityManager, datasetId: string): Promise<string[]> =>
  (
    await manager.query(`SELECT DISTINCT file_id FROM dataset_file_mappings WHERE dataset_id = $1 AND file_id IS NOT NULL`, [datasetId])
  ).map((r: { file_id: string }) => r.file_id);

/**
 * Removes everything loaded into a Version, so its Files can be loaded again: its Dataset Layers and
 * their observations, its Raster Layers, and its metadata rollup. Its Files go back to PENDING: a
 * vector File is staged again from its upload (file-to-db), a raster File is loaded again from its
 * source (RasterLoader.resolveSourceFile). Both rely on the uploads, which is why a load into a
 * Version can't delete them (JobService.lockDataset).
 *
 * The features and layers left unreferenced are deleted by the orphan sweep. Run inside the caller's
 * transaction.
 */
export async function resetVersionRows(manager: EntityManager, version: DatasetEntity): Promise<void> {
  await deleteDatasetLayers(manager, version.id);
  await deleteRasterLayers(manager, version.id);

  const fileIds = await mappedFileIds(manager, version.id);
  await manager.query(`UPDATE files SET status = $2, updated_at = now() WHERE id = ANY($1::uuid[]) AND status <> $2`, [
    fileIds,
    IngestionStatus.PENDING,
  ]);
  // A STAGED File's raw table is recreated by its next file-to-db
  for (const fileId of fileIds) {
    await manager.query(`DROP TABLE IF EXISTS "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileId)}"`);
  }

  // The rollup the loads write (UpdateDatasetMetadata); the descriptive metadata copied from v1 stays
  await manager.query(
    `UPDATE datasets
     SET status = $2,
         n_observations = NULL,
         n_raster_layers = NULL,
         spatial_extent = NULL,
         soil_depth = NULL,
         variables_measured = NULL,
         inferred_properties = NULL,
         processing_steps = processing_steps - 'cleaning_steps',
         updated_at = now()
     WHERE id = $1`,
    [version.id, IngestionStatus.PENDING],
  );
}

/**
 * Removes a Version: its data (resetVersionRows), its Dataset File Mappings, its Files (soft-deleted,
 * as removing a File in the soil-data step does), and the Version itself, hard-deleted so its name can
 * be used again.
 *
 * Its slug history stays, so its slug is never reused: a Version opened next gets a suffixed one
 * (`<v1 slug>-v<n>-increment-1`). Anything still keyed by the old slug (a grant, an error, a job, the
 * frontend's ingestion state, a link) then can't attach to the new Version, and the old slug resolves
 * to nothing. Run inside the caller's transaction.
 */
export async function discardVersionRows(manager: EntityManager, version: DatasetEntity): Promise<void> {
  await resetVersionRows(manager, version);
  const fileIds = await mappedFileIds(manager, version.id);
  await manager.query(`DELETE FROM dataset_file_mappings WHERE dataset_id = $1`, [version.id]);
  await manager.query(`UPDATE files SET deleted_at = now() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [fileIds]);
  await manager.query(`DELETE FROM datasets WHERE id = $1`, [version.id]);
}
