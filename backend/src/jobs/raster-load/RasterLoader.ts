import { Job } from 'pg-boss';
import { StatusCodes } from 'http-status-codes';
import { EntityManager, In } from 'typeorm';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileEntity from '../../entities/File';
import { RasterLoadJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import { ResolvedBandMapping } from '../../interfaces/RasterMapping';
import { RasterFileMetadata } from '../../interfaces/File';
import DataMappingService from '../../services/DataMappingService';
import DatasetFileMappingService from '../../services/DatasetFileMappingService';
import DatasetService from '../../services/DatasetService';
import { EntityType, IngestionStatus } from '../../types/data';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import { ErrorResponse, getErrorMessage } from '../../utils/error';
import { log } from '../../utils/logger';
import { JobError } from '../../errors/JobError';
import ErrorService from '../../services/ErrorService';
import { checkFileFormat, ingestRaster } from '../../services/RasterIngestService';
import FileService from '../../services/FileService';
import { updateRasterDatasetMetadata } from './UpdateDatasetMetadata';
import { StagedLayerAssets, syncRasterLayerAssets } from './LoadLayerAssets';
import { statusAfterLoad } from '../LoadStatus';
import { hasRasterFileToLoad } from '../../data-layer/DatasetJobs';
import { jobRequestData } from '../jobRequestData';
import { progressReporter } from '../../services/PgBoss';
import { getSubject } from '../../utils/auth';
import { rasterWgs84Envelope } from '../../utils/raster';
import type { Envelope } from '../../utils/GdalCLI';

// Band ingestion owns <floor>..LOAD_PROGRESS_CEILING; the remainder covers dataset metadata.
const LOAD_PROGRESS_CEILING = 90;
// Normalizing files (reproject / rescale / COG) reads and rewrites every pixel, so when any file
// needs it, it gets the first 0..CONVERSION_PROGRESS_CEILING and band ingestion starts there
// instead of at 0. When nothing needs converting, bands own the whole range as before.
const CONVERSION_PROGRESS_CEILING = 40;

// Either year, a year and month, or a full date
const REFERENCE_PERIOD_FORMAT = /^\d{4}(-\d{2}(-\d{2})?)?$/;

// 50 m below the surface, well past any soil survey.
// Kept in sync with MAX_DEPTH_CM in frontend/src/hooks/useRasterMappingStep.ts.
const MAX_DEPTH_CM = 5000;

interface StagedBand {
  file: FileEntity;
  bandMapping: ResolvedBandMapping;
  /**
   * The ids of the Files this band's additional resources named, resolved from their slugs during
   * preparation. Empty until then, and empty for a band that declares no resources.
   */
  assetFileIds: string[];
}

/** How one pending file's current band mapping is ingested. */
interface FilePlan {
  file: FileEntity;
  /** Every band the current mapping names, validated. Empty when the mapping declares none. */
  bands: StagedBand[];
  /** What an ingest starts from (see resolveSourceFile); null to start from the file as it stands. */
  sourcePath: string | null;
}

export async function processRasterLoad(job: Job<RasterLoadJob>): Promise<void> {
  const { id: jobId, data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const requestData = await jobRequestData(entityManager, data);
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const reportProgress = progressReporter(jobId);
  const previousStatus = dataset.status;
  // Every file this run has started writing to, so the catch can undo exactly those (see below).
  const touchedFileIds = new Set<string>();
  try {
    await reportProgress(0, `Raster load started for dataset '${dataset.name}'`);

    const mappingService = new DatasetFileMappingService();
    const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

    // A PUBLISHED Dataset only takes a load that removes layers, so it ingests nothing: the pending
    // files left are ones a load skips, which mustn't fail the removal. One with a file to ingest is
    // refused when the job is created (JobService.assertLoadable); this catches one queued before that check.
    if (previousStatus === IngestionStatus.PUBLISHED && (await hasRasterFileToLoad(entityManager, dataset.id))) {
      throw new JobError('RL_DATASET_PUBLISHED', { dataset_name: dataset.name });
    }
    // Only the files waiting for a load — see getPendingFiles.
    const files = previousStatus === IngestionStatus.PUBLISHED ? [] : await getPendingFiles(entityManager, datasetFileMappings);
    await reportProgress(0, 'Removing the layers of removed files...');
    const removedLayers = await removeUnmappedLayers(entityManager, dataset.id);

    // Resolve every band mapping and validate it against the file before writing anything, so the
    // progress denominator spans the whole job and a bad mapping aborts before a partial load.
    await reportProgress(0, `Reading band mappings for ${files.length} file(s)...`);
    const plans = await prepareFilePlans(requestData, files, datasetFileMappings);
    // A mapping that declares no bands loads nothing: the file is skipped and stays PENDING.
    const ingestPlans = plans.filter(plan => plan.bands.length > 0);

    // A retry of a failed load starts again from the file's source: normalization is derived from
    // the mapping rather than from the pixels, so it cannot be applied on top of a previous run's output.
    for (const plan of ingestPlans) {
      touchedFileIds.add(plan.file.id);
      if (plan.sourcePath) {
        await resetToSourceFile(entityManager, plan.file.id, plan.sourcePath);
      }
    }

    // Normalize each file once, before any band is ingested: conversion is per file, so doing it
    // inside the band loop would redo the same work for every band of a multiband raster — and for
    // a unit conversion it would redo it wrongly, since a second pass rescales already-scaled
    // pixels. The loader is therefore the only place a file is normalized; ingestRaster reads
    // whatever files.file_path points at by then.
    const anyConverted = await normalizeFiles(ingestPlans, reportProgress);
    const bandFloor = anyConverted ? CONVERSION_PROGRESS_CEILING : 0;

    const ingestBands = ingestPlans.flatMap(plan => plan.bands);
    // Every current band's layer, so its assets can be synced once every band has succeeded.
    const stagedAssets: StagedLayerAssets[] = [];

    for (const [index, staged] of ingestBands.entries()) {
      const { file, bandMapping } = staged;
      const loading = `Ingesting band ${bandMapping.band} of '${file.name}' (${index + 1} of ${ingestBands.length})...`;
      await reportProgress(bandPercentage(index, ingestBands.length, bandFloor), loading);

      let lastPercentage = -1;
      const rasterLayerId = await ingestRaster({
        ...layerFields(dataset.id, staged),
        // A single band's footprint pass runs for minutes, so report inside it rather than
        // letting the job sit silent between bands.
        onFootprintProgress: async (tilesProcessed, totalTiles) => {
          const percentage = bandPercentage(index + tilesProcessed / totalTiles, ingestBands.length, bandFloor);
          // Only write when the rendered percentage actually moves — tiles are far more
          // frequent than the client poll interval, so per-tile writes are invisible.
          if (percentage !== lastPercentage) {
            lastPercentage = percentage;
            await reportProgress(percentage, loading);
          }
        },
      });
      // Already resolved from slugs to ids in prepareFilePlans.
      stagedAssets.push({ rasterLayerId, fileIds: staged.assetFileIds });
    }

    // Deliberately after every band rather than inside the loop, and with no progress step of its
    // own: asset rows from file_ids that were already checked take milliseconds, so they belong
    // inside the band range rather than owning a slice of it. Done last so a load that fails
    // part-way leaves no assets attached to layers whose siblings never made it.
    await syncRasterLayerAssets(entityManager, stagedAssets);

    // A file is loaded once every band its mapping names is a layer. Unlike a bulk load, no raw
    // table exists to drop: after a raster load the file *is* the layer's data and must survive
    // (see deleteSourceFiles for the upload). A loaded file's mapping is read-only from here on:
    // correcting it means removing the file and uploading it again.
    //
    // A targeted UPDATE rather than file.save(): these entities were loaded before normalization
    // repointed files.file_path, and save() diffs the whole entity against the row it reloads — so
    // it would write the pre-conversion path back over the converted one.
    const loadedFileIds = ingestPlans.map(plan => plan.file.id);
    if (loadedFileIds.length > 0) {
      await entityManager.query(`UPDATE files SET status = $2, updated_at = now() WHERE id = ANY($1::uuid[])`, [
        loadedFileIds,
        IngestionStatus.LOADED,
      ]);
    }

    // Calculate new dataset metadata and update status. getSubject resolves to the job's sub
    // today (the token carries only that) but upgrades automatically if jobs ever carry an email;
    // it throws when there is no sub at all, so a job without an owner records none.
    await reportProgress(LOAD_PROGRESS_CEILING, 'Computing dataset metadata...');
    await recordWideFileBboxes(entityManager, dataset.id, new Set(ingestPlans.map(plan => plan.file.id)));
    const updatedBy = data.created_by ? getSubject(requestData) : null;
    await updateRasterDatasetMetadata(entityManager, dataset.id, statusAfterLoad(previousStatus), updatedBy);
    // Removing layers from a PUBLISHED Dataset changes the data its readers get
    if (previousStatus === IngestionStatus.PUBLISHED && removedLayers > 0) {
      await entityManager.query(`UPDATE datasets SET data_updated_at = now() WHERE id = $1`, [dataset.id]);
    }

    // Last, once nothing can fail the load any more: a failed run is retried from the source, so
    // deleting it any earlier could leave the retry with nothing to normalize.
    if (data.delete_source_files) {
      await deleteSourceFiles(entityManager, loadedFileIds);
    }

    // The job is still active here, so this last write lands; once the processor
    // returns, updateJobState's `state = 'active'` guard makes it a no-op.
    await reportProgress(100, 'Raster load complete');
  } catch (error: any) {
    // A file this run started writing to may be half-normalized or half-ingested, so its layers are
    // removed rather than kept in that state, and the retry ingests the file from scratch. Files the
    // run never reached stay PENDING. The Dataset keeps its status.
    const touched = [...touchedFileIds];
    if (touched.length > 0) {
      await entityManager.query(`DELETE FROM raster_layers WHERE file_id = ANY($1::uuid[]) AND dataset_id = $2`, [touched, dataset.id]);
      await entityManager.query(`UPDATE files SET status = $2, updated_at = now() WHERE id = ANY($1::uuid[])`, [
        touched,
        IngestionStatus.PENDING,
      ]);
      // The layers just removed were counted in the dataset's rollup, which has to follow them.
      // Best-effort: the rollup may be what failed, and its error must not mask the original one.
      await updateRasterDatasetMetadata(entityManager, dataset.id, previousStatus, null).catch(rollupError =>
        log.warn('Failed to roll up dataset metadata after a failed raster load', {
          dataset_id: dataset.id,
          error: rollupError?.message,
        }),
      );
    }
    throw error;
  }
}

/**
 * The Files of the Dataset waiting for a Raster Load: never loaded, or left PENDING by a load that
 * failed. A loaded File's mapping can't be changed (DatasetFileMappingService.updateMapping), so it
 * never comes back here.
 *
 * A LOADED file is skipped, so adding files to a Dataset costs only what loading those files costs.
 * Re-running is still safe: a load that fails puts every file it touched back to PENDING, and every
 * write it makes is idempotent per (file, band).
 */
const getPendingFiles = async (entityManager: EntityManager, mappings: DatasetFileMappingEntity[]): Promise<FileEntity[]> => {
  // A mapping with no file_id belongs to no File — currentMappingsByFile drops those too.
  const fileIds = [...new Set(mappings.map(mapping => mapping.file_id).filter((id): id is string => !!id))];
  if (fileIds.length === 0) {
    return [];
  }
  return await entityManager.getRepository(FileEntity).find({ where: { id: In(fileIds), status: IngestionStatus.PENDING } });
};

/**
 * Removes the Raster Layers of Files taken out of the Dataset: unmapped from it, or deleted. This is
 * how a loaded raster File is removed; the endpoints only drop the mapping and soft-delete the File,
 * since deleting the layers and rolling the Dataset up can outlast a request. Footprint links, assets
 * and group memberships go by cascade, and the orphan-footprint trigger removes footprints no other
 * layer uses. The rollup after the load accounts for them. Returns how many layers it deleted.
 */
const removeUnmappedLayers = async (entityManager: EntityManager, datasetId: string): Promise<number> => {
  const [, deleted]: [unknown, number] = await entityManager.query(
    `DELETE FROM raster_layers rl
     WHERE rl.dataset_id = $1
       AND (
         NOT EXISTS (SELECT 1 FROM dataset_file_mappings dfm WHERE dfm.dataset_id = rl.dataset_id AND dfm.file_id = rl.file_id AND dfm.deleted_at IS NULL)
         OR EXISTS (SELECT 1 FROM files f WHERE f.id = rl.file_id AND f.deleted_at IS NOT NULL)
       )`,
    [datasetId],
  );
  return deleted;
};

/**
 * Records bbox_wgs84 for the Dataset's Files whose Raster Layers are stored wider than 180° of
 * longitude: crossing the antimeridian, global, or merely wide. Maps read it instead of the stored
 * extent (DatasetService.decorateWithBbox). Covers every such File, loaded in this run or not, so
 * loading a Dataset again fills in Files loaded before bbox_wgs84 existed. A File is measured once,
 * and again only when this run ingested it. A failure is logged rather than failing the load.
 *
 * Older loads stored a crossing raster's layers as its corners' min/max, which runs the wrong way
 * round the globe; those are reset to the band of longitude a load stores now, so the prefilters
 * reach every longitude the raster covers.
 */
const recordWideFileBboxes = async (entityManager: EntityManager, datasetId: string, ingestedFileIds: Set<string>): Promise<void> => {
  const files: { id: string; file_path: string; bbox_wgs84: Envelope | null }[] = await entityManager.query(
    `SELECT DISTINCT f.id, f.file_path, f.metadata->'bbox_wgs84' AS bbox_wgs84
     FROM raster_layers rl
     JOIN files f ON f.id = rl.file_id
     WHERE rl.dataset_id = $1 AND rl.deleted_at IS NULL AND ST_XMax(rl.bbox) - ST_XMin(rl.bbox) > 180`,
    [datasetId],
  );
  for (const file of files) {
    try {
      let bbox = file.bbox_wgs84;
      if (!bbox || ingestedFileIds.has(file.id)) {
        bbox = await rasterWgs84Envelope(file.file_path);
        await entityManager.query(
          `UPDATE files SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('bbox_wgs84', $2::jsonb), updated_at = now() WHERE id = $1`,
          [file.id, JSON.stringify(bbox)],
        );
      }
      const [west, south, east, north] = bbox;
      if (west > east) {
        await entityManager.query(
          `UPDATE raster_layers SET bbox = ST_MakeEnvelope(-180, $2, 180, $3, 4326), updated_at = now()
           WHERE file_id = $1 AND deleted_at IS NULL AND NOT (ST_XMin(bbox) = -180 AND ST_XMax(bbox) = 180)`,
          [file.id, south, north],
        );
      }
    } catch (error) {
      log.warn('Could not record the bounding box of a raster stored wider than 180° of longitude', {
        file_id: file.id,
        error: getErrorMessage(error),
      });
    }
  }
};

/** What ingestRaster takes from a band mapping. */
const layerFields = (datasetId: string, { file, bandMapping }: StagedBand) => ({
  fileId: file.id,
  band: bandMapping.band,
  datasetId,
  soilPropertySlug: bandMapping.soilPropertySlug,
  minDepth: bandMapping.minDepth,
  maxDepth: bandMapping.maxDepth,
  isCategorical: bandMapping.isCategorical,
  referencePeriodStart: bandMapping.referencePeriodStart,
  referencePeriodStop: bandMapping.referencePeriodStop,
  procedureSlug: bandMapping.procedureSlug,
  description: bandMapping.layerDescription,
});

/**
 * Where an ingest of the file starts from: the upload as it was before any normalization, so the one
 * about to run applies to the original pixels rather than to a previous run's output — which matters
 * when retrying a load that failed after normalizing. Null when the file as it stands is that
 * starting point.
 *
 * Read-only, and called while the plans are prepared, so a file that cannot be normalized again fails
 * the load before anything is written. Refusing it any later would cost the file its layers, since
 * the catch in processRasterLoad removes the layers of every file the run has touched.
 *
 * A recorded source is checked to still exist: repointing the file at a missing one would leave it
 * unreadable. A file whose pixels were scaled and whose source cannot be found is refused, because
 * ingesting it would apply the conversion again.
 */
const resolveSourceFile = async (file: FileEntity): Promise<string | null> => {
  const metadata = file.metadata as RasterFileMetadata | undefined;
  const candidates = metadata?.source_file_path ? [metadata.source_file_path] : legacySourceCandidates(file.file_path);
  const storage = FileService.getStorageEngine();
  for (const candidate of candidates) {
    if (await storage.fileExists(candidate)) {
      return candidate;
    }
  }
  if (metadata?.unit_conversion_applied) {
    throw new JobError('RL_SOURCE_FILE_NOT_FOUND', { file_name: file.name });
  }
  // Never scaled: the file as it stands is a valid starting point, converted for layout at most.
  return null;
};

/**
 * The uploads a file normalized before source_file_path was recorded may have been converted from.
 * convertRasterFile names its output by replacing a trailing `.tif` of any case with `_cog.tif`, and
 * by appending `_cog.tif` to any other name, so `<base>_cog.tif` came from `<base>.tif`, `<base>.TIF`
 * or `<base>` itself (`x.tiff` → `x.tiff_cog.tif`).
 */
const legacySourceCandidates = (filePath: string): string[] => {
  if (!filePath.endsWith('_cog.tif')) {
    return [];
  }
  const base = filePath.slice(0, -'_cog.tif'.length);
  return [`${base}.tif`, `${base}.TIF`, base];
};

/**
 * Points the file back at its source (see resolveSourceFile) and forgets the scaling a previous
 * normalization applied, so the one about to run starts from the original pixels.
 */
const resetToSourceFile = async (entityManager: EntityManager, fileId: string, sourcePath: string): Promise<void> => {
  await entityManager.query(
    `UPDATE files SET file_path = $2, metadata = COALESCE(metadata, '{}'::jsonb) - 'unit_conversion_applied', updated_at = now() WHERE id = $1`,
    [fileId, sourcePath],
  );
};

/**
 * Deletes the original upload of every loaded file that normalization replaced with a converted
 * copy. A file that needed no conversion still reads from its upload, so it is left alone.
 *
 * Read from the row rather than the plan's entity, which predates normalization repointing
 * file_path. source_file_path is kept as a record of where the file came from.
 *
 * Best-effort, as in a bulk load: the layers are already in, and a leftover source file is not
 * worth failing the load over. Also run by version-publish, for the raster Files of a Version, whose
 * loads keep their uploads.
 */
export const deleteSourceFiles = async (entityManager: EntityManager, fileIds: string[]): Promise<void> => {
  if (fileIds.length === 0) {
    return;
  }
  const rows: { id: string; file_path: string; source_file_path: string | null }[] = await entityManager.query(
    `SELECT id, file_path, metadata->>'source_file_path' AS source_file_path FROM files WHERE id = ANY($1::uuid[])`,
    [fileIds],
  );
  const storage = FileService.getStorageEngine();
  for (const { id, file_path, source_file_path } of rows) {
    if (!source_file_path || source_file_path === file_path) {
      continue;
    }
    try {
      if (await storage.fileExists(source_file_path)) {
        await storage.deleteFile(source_file_path);
      }
    } catch (error: any) {
      log.warn('Failed to delete source file after raster load', { file_id: id, error: error?.message });
    }
  }
};

const assertReferencePeriod = (fileName: string, band: number, field: string, value: string | null): void => {
  // Rejects an invalid reference period, naming the band that declared it
  if (value !== null && !REFERENCE_PERIOD_FORMAT.test(String(value))) {
    throw new JobError('RL_INVALID_REFERENCE_PERIOD', { file_name: fileName, band: String(band), field, value: String(value) });
  }
};

const assertDepths = (fileName: string, band: number, minDepth: number | null, maxDepth: number | null): void => {
  const fields = [
    ['min depth', minDepth],
    ['max depth', maxDepth],
  ] as const;
  for (const [field, value] of fields) {
    if (value === null) continue;
    if (!Number.isInteger(value) || value < 0 || value > MAX_DEPTH_CM) {
      throw new JobError('RL_INVALID_DEPTH', {
        file_name: fileName,
        band: String(band),
        field,
        value: String(value),
        limit: String(MAX_DEPTH_CM),
      });
    }
  }
  if (minDepth !== null && maxDepth !== null && minDepth >= maxDepth) {
    throw new JobError('RL_INVALID_DEPTH_RANGE', {
      file_name: fileName,
      band: String(band),
      min_depth: String(minDepth),
      max_depth: String(maxDepth),
    });
  }
};

const bandPercentage = (bandsProcessed: number, totalBands: number, floor: number): number =>
  totalBands > 0 ? floor + Math.round(((LOAD_PROGRESS_CEILING - floor) * bandsProcessed) / totalBands) : floor;

/**
 * Normalizes every distinct file whose format deviates from what a raster layer requires, and
 * reports it across 0..CONVERSION_PROGRESS_CEILING. Returns whether anything was converted, which
 * decides where band progress starts.
 *
 * All of a file's mapped bands are passed together because scaling is applied to the file as a
 * whole: converting one band at a time would rewrite the file once per band, and a factor list
 * shorter than the band count gets broadcast over every band.
 */
const normalizeFiles = async (
  candidates: FilePlan[],
  reportProgress: (percentage: number, description: string) => Promise<void>,
): Promise<boolean> => {
  let anyConverted = false;

  for (const [index, { file, bands }] of candidates.entries()) {
    const { converted } = await checkFileFormat({
      fileId: file.id,
      bands: bands.map(({ bandMapping }) => ({
        band: bandMapping.band,
        soilPropertySlug: bandMapping.soilPropertySlug,
        standardUnit: bandMapping.standardUnit,
        originalUnit: bandMapping.originalUnit,
        conversionFormula: bandMapping.conversionFormula,
        isCategorical: bandMapping.isCategorical,
      })),
      onProgress: async (percentage, description) => {
        // Each file owns an equal slice of the conversion window.
        const span = CONVERSION_PROGRESS_CEILING / candidates.length;
        await reportProgress(Math.round(index * span + (percentage / 100) * span), description);
      },
    });
    anyConverted = anyConverted || converted;
  }

  return anyConverted;
};

/**
 * Resolves each file's Band Mapping and checks every band against the bands the file actually has,
 * along with the auxiliary Files its additional resources reference, then works out what each file
 * to be ingested starts from (see resolveSourceFile).
 *
 * Band counts come from the metadata probed at upload, so an invalid band is rejected without
 * opening the raster. Bands a mapping does not name are skipped, which is how uncertainty and
 * count bands are excluded from ingestion.
 */
const prepareFilePlans = async (
  requestData: RequestData,
  files: FileEntity[],
  mappings: DatasetFileMappingEntity[],
): Promise<FilePlan[]> => {
  const service = new DataMappingService();
  const bandsByFile = new Map<string, StagedBand[]>();
  const currentMappings = DatasetFileMappingService.currentMappingsByFile(mappings);

  for (const file of files) {
    const stagedBands: StagedBand[] = [];
    bandsByFile.set(file.id, stagedBands);
    // Cannot miss: the file list was built from these mappings' file_ids. Kept as a guard so a
    // future change to how files are selected fails loudly rather than loading an unmapped file.
    const datasetFileMapping = currentMappings.get(file.id);
    if (!datasetFileMapping || !datasetFileMapping.data_mapping_id) {
      // The normal state of a file between the upload step and the mapping step: the upload step
      // creates the mapping as a placeholder carrying only the file, with no data mapping yet.
      throw new JobError('RL_MAPPING_NOT_CONFIGURED', { file_name: file.name });
    }

    const bandMappings = await service.parseRasterDataMapping(requestData, datasetFileMapping.data_mapping_id);
    if (bandMappings.length === 0) {
      // Distinct from RL_MAPPING_NOT_CONFIGURED: a mapping exists but is an empty object, which
      // is accepted — nothing is ingested from the file, and it stays PENDING.
      log.warn('Skipping file with an empty data mapping', { file_id: file.id, file_name: file.name });
      continue;
    }

    const rasterMetadata: RasterFileMetadata | null = file.metadata?.is_raster ? file.metadata : null;
    const availableBands = new Set((rasterMetadata?.raster_bands ?? []).map(band => band.band_number));
    const bandCount = rasterMetadata?.band_count ?? 0;

    for (const bandMapping of bandMappings) {
      const { band } = bandMapping;
      if (!Number.isInteger(band) || band < 1 || (bandCount > 0 && !availableBands.has(band))) {
        throw new JobError('RL_INVALID_BAND', { file_name: file.name, band: String(band), band_count: String(bandCount) });
      }
      assertReferencePeriod(file.name, band, 'reference period start', bandMapping.referencePeriodStart);
      assertReferencePeriod(file.name, band, 'reference period stop', bandMapping.referencePeriodStop);
      assertDepths(file.name, band, bandMapping.minDepth, bandMapping.maxDepth);
      stagedBands.push({ file, bandMapping, assetFileIds: [] });
    }
  }

  await resolveAdditionalResources(requestData, [...bandsByFile.values()].flat());

  // One file at a time, so a refusal from resolveSourceFile always names the same file.
  const plans: FilePlan[] = [];
  for (const file of files) {
    const bands = bandsByFile.get(file.id)!;
    plans.push({ file, bands, sourcePath: bands.length > 0 ? await resolveSourceFile(file) : null });
  }
  return plans;
};

/**
 * Resolves every additional resource to the id of the File it names, and rejects the unusable ones
 * before the first ingest writes anything — for the same reason band numbers are checked here: a
 * typo in a mapping should not cost a partial load.
 *
 * A resource names a File by **slug**, as "id" does throughout the API, so resolution goes through
 * getEntity: it consults slug history, which means a File renamed after the mapping was written
 * still resolves, and a soft-deleted one does not resolve at all. A `url` alone is not enough yet —
 * fetching it is a future flow — and an entry naming both is treated as a slug with the url as
 * documentation of where it came from.
 *
 * Nothing else about the File is checked: an asset is as legitimately a GeoTIFF prediction layer as
 * a PDF manual, and "has no metadata" is not a way to tell those apart (see CONTEXT.md, flagged
 * ambiguities).
 */
const resolveAdditionalResources = async (requestData: RequestData, stagedBands: StagedBand[]): Promise<void> => {
  // A mapping can name the same manual on every band of every file, and each of those is the same
  // lookup — so resolve a slug once per load and reuse it.
  const fileIdBySlug = new Map<string, string>();

  for (const staged of stagedBands) {
    const { file, bandMapping } = staged;
    for (const resource of bandMapping.additionalResources) {
      const params = { file_name: file.name, band: String(bandMapping.band) };
      if (!resource.file_id) {
        throw new JobError(resource.url ? 'RL_ASSET_URL_UNSUPPORTED' : 'RL_MISSING_ASSET_REFERENCE', params);
      }

      const slug = resource.file_id;
      if (!fileIdBySlug.has(slug)) {
        fileIdBySlug.set(slug, await resolveAssetFileId(requestData, slug, { ...params, file_id: slug }));
      }
      staged.assetFileIds.push(fileIdBySlug.get(slug)!);
    }
  }
};

/**
 * Translates the not-found a slug lookup raises into the job's own error, leaving every other
 * failure — a dropped connection, a broken query — to surface as itself.
 */
const resolveAssetFileId = async (requestData: RequestData, slug: string, params: Record<string, string>): Promise<string> => {
  try {
    const assetFile = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    return assetFile.id;
  } catch (error: any) {
    if (error instanceof ErrorResponse && error.status === StatusCodes.NOT_FOUND) {
      throw new JobError('RL_ASSET_FILE_NOT_FOUND', params);
    }
    throw error;
  }
};
