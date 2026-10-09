import { Job } from 'pg-boss';
import { StatusCodes } from 'http-status-codes';
import { EntityManager, In } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileEntity from '../../entities/File';
import { RasterLoadJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import { Token } from '../../interfaces/Token';
import { ResolvedBandMapping } from '../../interfaces/RasterMapping';
import { LoadedRasterBand, RasterFileMetadata } from '../../interfaces/File';
import DataMappingService from '../../services/DataMappingService';
import DatasetFileMappingService from '../../services/DatasetFileMappingService';
import DatasetService from '../../services/DatasetService';
import { EntityType, IngestionStatus } from '../../types/data';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import { ErrorResponse } from '../../utils/error';
import { log } from '../../utils/logger';
import { JobError } from '../../errors/JobError';
import ErrorService from '../../services/ErrorService';
import { checkFileFormat, ingestRaster } from '../../services/RasterIngestService';
import FileService from '../../services/FileService';
import { updateRasterDatasetMetadata } from './UpdateDatasetMetadata';
import { StagedLayerAssets, syncRasterLayerAssets } from './LoadLayerAssets';
import { hideDatasetForLoad, statusAfterFailedLoad, statusAfterLoad } from '../LoadStatus';
import EntitlementService from '../../services/EntitlementService';
import { progressReporter } from '../../services/PgBoss';
import { getSubject } from '../../utils/auth';
import { EVERYONE } from '../../constants/constants';
import type { IngestRasterOptions } from '../../services/RasterIngestService';

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

type LoadMode = 'ingest' | 'update';

/** How one pending file's current band mapping is applied — see planMode. */
interface FilePlan {
  file: FileEntity;
  /** Every band the current mapping names, validated. Empty when the mapping declares none. */
  bands: StagedBand[];
  mode: LoadMode;
  /** Rebuild the COG's overviews even if the file is already one; only meaningful when ingesting. */
  forceCog: boolean;
  /** Bands with a layer that the mapping no longer names. */
  removedBands: number[];
}

export async function processRasterLoad(job: Job<RasterLoadJob>): Promise<void> {
  const { id: jobId, data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const entitlementService = new EntitlementService();
  // created_by lives on the job's data, not on the pg-boss job wrapper.
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, data.created_by ?? EVERYONE);
  // getDataset hides Datasets that are not PUBLISHED from a non-privileged caller, and this job runs on one by definition
  const token = { sub: data.created_by, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin } as Token;
  const requestData = { entityManager, token, entitlements };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const reportProgress = progressReporter(jobId);
  const previousStatus = dataset.status;
  // Every file this run has started writing to, so the catch can undo exactly those (see below).
  const touchedFileIds = new Set<string>();
  try {
    await reportProgress(0, `Raster load started for dataset '${dataset.name}'`);

    await hideDatasetForLoad(entityManager, dataset);

    const mappingService = new DatasetFileMappingService();
    const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

    // Only the files waiting for a load — see getPendingFiles.
    const files = await getPendingFiles(entityManager, datasetFileMappings);

    // Resolve every band mapping and validate it against the file before writing anything, so the
    // progress denominator spans the whole job and a bad mapping aborts before a partial load.
    await reportProgress(0, `Reading band mappings for ${files.length} file(s)...`);
    const plans = await prepareFilePlans(requestData, files, datasetFileMappings);
    const ingestPlans = plans.filter(plan => plan.mode === 'ingest' && plan.bands.length > 0);

    // A file being ingested starts again from its source: normalization is derived from the mapping
    // rather than from the pixels, so it cannot be applied on top of a previous run's output.
    for (const plan of ingestPlans) {
      touchedFileIds.add(plan.file.id);
      await resetToSourceFile(entityManager, plan.file);
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

    // A file whose edit changed nothing about its pixels keeps its layers and footprints: only the
    // metadata the mapping declares is rewritten, which takes milliseconds rather than a re-ingest.
    for (const plan of plans.filter(plan => plan.mode === 'update')) {
      touchedFileIds.add(plan.file.id);
      for (const staged of plan.bands) {
        const rasterLayerId = await updateRasterLayer(entityManager, layerFields(dataset.id, staged));
        if (!rasterLayerId) {
          // The plan only picks update when every band has a layer, so this is the property lookup.
          throw new Error(`Soil property '${staged.bandMapping.soilPropertySlug}' not found — cannot update raster layer`);
        }
        stagedAssets.push({ rasterLayerId, fileIds: staged.assetFileIds });
      }
    }

    // The Band Mapping is authoritative for which bands are layers, so a band it stopped naming
    // loses its layer. Footprint links, assets and group memberships go with it by cascade.
    for (const plan of plans.filter(plan => plan.removedBands.length > 0)) {
      touchedFileIds.add(plan.file.id);
      await entityManager.query(`DELETE FROM raster_layers WHERE file_id = $1 AND band = ANY($2::int[]) AND deleted_at IS NULL`, [
        plan.file.id,
        plan.removedBands,
      ]);
    }

    // Deliberately after every band rather than inside the loop, and with no progress step of its
    // own: asset rows from file_ids that were already checked take milliseconds, so they belong
    // inside the band range rather than owning a slice of it. Done last so a load that fails
    // part-way leaves no assets attached to layers whose siblings never made it.
    await syncRasterLayerAssets(entityManager, stagedAssets);

    // A file is loaded once every band its mapping names is a layer, and it records what decided
    // how its pixels were written so the next edit can tell a metadata change from one that needs
    // the file normalized again. Unlike a bulk load, the source file is never deleted and no raw
    // table exists to drop: after a raster load the file *is* the layer's data and must survive.
    //
    // Written as targeted UPDATEs rather than file.save(): these entities were loaded before
    // normalization repointed files.file_path, and save() diffs the whole entity against the row
    // it reloads — so it would write the pre-conversion path back over the converted one.
    for (const plan of plans) {
      if (plan.bands.length > 0) {
        await entityManager.query(
          `UPDATE files SET status = $2, metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('loaded_bands', $3::jsonb), updated_at = now() WHERE id = $1`,
          [plan.file.id, IngestionStatus.LOADED, JSON.stringify(loadedBands(plan.bands))],
        );
      } else {
        // A mapping that declares no bands leaves the file with nothing loaded, as if never mapped.
        await entityManager.query(`UPDATE files SET metadata = metadata - 'loaded_bands', updated_at = now() WHERE id = $1`, [
          plan.file.id,
        ]);
      }
    }

    // Calculate new dataset metadata and update status. getSubject resolves to the job's sub
    // today (the token carries only that) but upgrades automatically if jobs ever carry an email;
    // it throws when there is no sub at all, so a job without an owner records none.
    await reportProgress(LOAD_PROGRESS_CEILING, 'Computing dataset metadata...');
    const updatedBy = data.created_by ? getSubject(requestData) : null;
    await updateRasterDatasetMetadata(entityManager, dataset.id, statusAfterLoad(previousStatus), updatedBy);

    // The job is still active here, so this last write lands; once the processor
    // returns, updateJobState's `state = 'active'` guard makes it a no-op.
    await reportProgress(100, 'Raster load complete');
  } catch (error: any) {
    // A file this run started writing to may be half-normalized, half-ingested or half-updated, and
    // the dataset is about to be shown again — so its layers are removed rather than published in
    // that state. Clearing loaded_bands with them makes the retry ingest the file from scratch.
    // Files the run never reached keep their layers, and stay PENDING with their edit still to apply.
    const touched = [...touchedFileIds];
    if (touched.length > 0) {
      await entityManager.query(`DELETE FROM raster_layers WHERE file_id = ANY($1::uuid[]) AND dataset_id = $2`, [touched, dataset.id]);
      await entityManager.query(
        `UPDATE files SET status = $2, metadata = metadata - 'loaded_bands', updated_at = now() WHERE id = ANY($1::uuid[])`,
        [touched, IngestionStatus.PENDING],
      );
      // The layers just removed were counted in the dataset's rollup, which has to follow them.
      // Best-effort: the rollup may be what failed, and its error must not mask the original one.
      await updateRasterDatasetMetadata(entityManager, dataset.id, statusAfterFailedLoad(previousStatus), null).catch(rollupError =>
        log.warn('Failed to roll up dataset metadata after a failed raster load', {
          dataset_id: dataset.id,
          error: rollupError?.message,
        }),
      );
    }
    // Targeted for the same reason as the file status above: updateRasterDatasetMetadata may
    // already have rewritten this row, and saving the entity loaded at the top of the job would
    // restore its stale metadata along with the status.
    await entityManager.getRepository(DatasetEntity).update({ id: dataset.id }, { status: statusAfterFailedLoad(previousStatus) });
    throw error;
  }
}

/**
 * The Files of the Dataset waiting for a Raster Load: never loaded, edited since their last load
 * (DatasetFileMappingService.updateMapping puts a file back to PENDING when its band mapping's
 * content changes), or left PENDING by a load that failed.
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

/** What ingestRaster and updateRasterLayer both take from a band mapping. */
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

const toLoadedBand = (bandMapping: ResolvedBandMapping): LoadedRasterBand => ({
  standardUnit: bandMapping.standardUnit,
  originalUnit: bandMapping.originalUnit,
  conversionFormula: bandMapping.conversionFormula,
  isCategorical: bandMapping.isCategorical,
});

const loadedBands = (bands: StagedBand[]): Record<string, LoadedRasterBand> =>
  Object.fromEntries(bands.map(({ bandMapping }) => [String(bandMapping.band), toLoadedBand(bandMapping)]));

/**
 * Decides how a pending file's current mapping gets applied, against what its last load recorded.
 *
 *   - ingest: the file is normalized again from its source and every band ingested. Needed when the
 *     file has never been loaded, when a band has no layer yet, or when anything that decides how the
 *     pixels are written changed: the unit conversion, or a band flipping between categorical and
 *     continuous, which also forces the COG to be rebuilt so its overviews are resampled to match.
 *   - update: only layer metadata changed, so the layers are rewritten in place.
 *
 * A new band forces a full ingest rather than one of just that band: its conversion factor has to be
 * applied in the same pass as its siblings', since normalization rewrites the whole file.
 */
const planMode = (file: FileEntity, bands: StagedBand[], existingBands: Set<number>): Pick<FilePlan, 'mode' | 'forceCog'> => {
  const previous = (file.metadata as RasterFileMetadata | null)?.loaded_bands;
  if (!previous) {
    return { mode: 'ingest', forceCog: false };
  }
  let mode: LoadMode = 'update';
  let forceCog = false;
  for (const { bandMapping } of bands) {
    const before = previous[String(bandMapping.band)];
    const now = toLoadedBand(bandMapping);
    if (!before || !existingBands.has(bandMapping.band)) {
      mode = 'ingest';
      continue;
    }
    if (before.isCategorical !== now.isCategorical) {
      mode = 'ingest';
      forceCog = true;
    }
    if (
      before.standardUnit !== now.standardUnit ||
      before.originalUnit !== now.originalUnit ||
      before.conversionFormula !== now.conversionFormula
    ) {
      mode = 'ingest';
    }
  }
  return { mode, forceCog };
};

/**
 * Points the file back at the upload as it was before any normalization, and forgets the scaling a
 * previous normalization applied, so the one about to run starts from the original pixels.
 *
 * Files normalized before source_file_path was recorded fall back to the deterministic name the
 * converted output was given (`<source>.tif` → `<source>_cog.tif`). A file whose pixels were scaled
 * and whose source cannot be found is refused: ingesting it would apply the conversion again.
 */
const resetToSourceFile = async (entityManager: EntityManager, file: FileEntity): Promise<void> => {
  const [row] = await entityManager.query(`SELECT file_path, metadata FROM files WHERE id = $1`, [file.id]);
  const filePath: string = row.file_path;
  const metadata = row.metadata as RasterFileMetadata | null;

  let sourcePath: string | null = metadata?.source_file_path ?? null;
  if (!sourcePath && filePath.endsWith('_cog.tif')) {
    const candidate = filePath.replace(/_cog\.tif$/, '.tif');
    if (await FileService.getStorageEngine().fileExists(candidate)) {
      sourcePath = candidate;
    }
  }
  if (!sourcePath) {
    if (metadata?.unit_conversion_applied) {
      throw new JobError('RL_SOURCE_FILE_NOT_FOUND', { file_name: file.name });
    }
    // Never scaled: the file as it stands is a valid starting point, converted for layout at most.
    return;
  }

  await entityManager.query(
    `UPDATE files SET file_path = $2, metadata = COALESCE(metadata, '{}'::jsonb) - 'unit_conversion_applied', updated_at = now() WHERE id = $1`,
    [file.id, sourcePath],
  );
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

  for (const [index, { file, bands, forceCog }] of candidates.entries()) {
    const { converted } = await checkFileFormat({
      fileId: file.id,
      forceCog,
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
 * along with the auxiliary Files its additional resources reference, then plans how each file's
 * mapping gets applied (see planMode).
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
      // Distinct from RL_MAPPING_NOT_CONFIGURED: a mapping exists but is an empty object,
      // which is an accepted scenario to allow a file with one or more previously mapped
      // bands to be unmapped — so nothing is ingested from it and any layers it had are removed.
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

  // Which bands already have a layer: what an update can rewrite and what a removal has to delete.
  const existingBands = new Map<string, Set<number>>(files.map(file => [file.id, new Set<number>()]));
  if (files.length > 0) {
    const rows: { file_id: string; band: number }[] = await requestData.entityManager.query(
      `SELECT file_id, band FROM raster_layers WHERE file_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [files.map(file => file.id)],
    );
    for (const row of rows) {
      existingBands.get(row.file_id)?.add(Number(row.band));
    }
  }

  return files.map(file => {
    const bands = bandsByFile.get(file.id)!;
    const existing = existingBands.get(file.id)!;
    const mapped = new Set(bands.map(({ bandMapping }) => bandMapping.band));
    return {
      file,
      bands,
      ...planMode(file, bands, existing),
      removedBands: [...existing].filter(band => !mapped.has(band)),
    };
  });
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

/**
 * Applies a band mapping's metadata to the layer an earlier ingest of the same (file, band) created,
 * without reading the file: the fields set here are the ones the ingest upsert takes from the mapping
 * rather than from the pixels. Returns the layer id, or null when the band has no layer.
 *
 * Only valid when nothing that decides how the pixels were written has changed (see LoadedRasterBand):
 * otherwise the file has to be normalized and ingested again.
 */
async function updateRasterLayer(em: EntityManager, opts: Omit<IngestRasterOptions, 'onFootprintProgress'>): Promise<string | null> {
  // A raw UPDATE resolves to [rows, rowCount] rather than to the rows alone.
  const [rows]: [{ id: string }[], number] = await em.query(
    `WITH
     sp AS (
       SELECT id FROM soil_properties WHERE slug = $3 AND deleted_at IS NULL
     ),
     proc AS (
       SELECT id FROM procedures WHERE slug = $4 AND deleted_at IS NULL
     )
     UPDATE raster_layers SET
       updated_at = now(),
       dataset_id = $5::uuid,
       soil_property_id = (SELECT id FROM sp),
       procedure_id = (SELECT id FROM proc),
       min_depth = $6::int,
       max_depth = $7::int,
       reference_period_start = $8,
       reference_period_stop = $9,
       is_categorical = $10::boolean,
       -- Wrapped as in ingestRaster (docs/adr/0019).
       description = CASE WHEN $11::text IS NULL THEN NULL ELSE jsonb_build_object('description', $11::text) END
     WHERE file_id = $1::uuid AND band = $2::int AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM sp)
     RETURNING id`,
    [
      opts.fileId,
      opts.band,
      opts.soilPropertySlug,
      opts.procedureSlug ?? null,
      opts.datasetId,
      opts.minDepth,
      opts.maxDepth,
      opts.referencePeriodStart ?? null,
      opts.referencePeriodStop ?? null,
      opts.isCategorical,
      opts.description ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}
