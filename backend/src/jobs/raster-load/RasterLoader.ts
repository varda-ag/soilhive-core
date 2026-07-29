import { Job } from 'pg-boss';
import { EntityManager, In } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileEntity from '../../entities/File';
import { RasterLoadJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import { Token } from '../../interfaces/Token';
import { ResolvedBandMapping } from '../../interfaces/RasterMapping';
import { RasterFileMetadata } from '../../interfaces/File';
import DataMappingService from '../../services/DataMappingService';
import DatasetFileMappingService from '../../services/DatasetFileMappingService';
import DatasetService from '../../services/DatasetService';
import { IngestionStatus } from '../../types/data';
import { getEntityManager } from '../../utils/data-source';
import { JobError } from '../../errors/JobError';
import ErrorService from '../../services/ErrorService';
import { checkFileFormat, ingestRaster } from '../../services/RasterIngestService';
import { updateRasterDatasetMetadata } from './UpdateDatasetMetadata';
import EntitlementService from '../../services/EntitlementService';
import { progressReporter } from '../../services/PgBoss';
import { getSubject } from '../../utils/auth';
import { EVERYONE } from '../../constants/constants';

// Band ingestion owns <floor>..LOAD_PROGRESS_CEILING; the remainder covers dataset metadata.
const LOAD_PROGRESS_CEILING = 90;
// Normalizing files (reproject / rescale / COG) reads and rewrites every pixel, so when any file
// needs it, it gets the first 0..CONVERSION_PROGRESS_CEILING and band ingestion starts there
// instead of at 0. When nothing needs converting, bands own the whole range as before.
const CONVERSION_PROGRESS_CEILING = 40;

interface StagedBand {
  file: FileEntity;
  bandMapping: ResolvedBandMapping;
}

export async function processRasterLoad(job: Job<RasterLoadJob>): Promise<void> {
  const { id: jobId, data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const entitlementService = new EntitlementService();
  // created_by lives on the job's data, not on the pg-boss job wrapper.
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, data.created_by ?? EVERYONE);
  const token = { sub: data.created_by } as Token; // Only sub is required
  const requestData = { entityManager, token, entitlements };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const reportProgress = progressReporter(jobId);
  try {
    await reportProgress(0, `Raster load started for dataset '${dataset.name}'`);

    dataset.status = IngestionStatus.ONGOING;
    await dataset.save();

    const mappingService = new DatasetFileMappingService();
    const datasetFileMappings = await mappingService.getMappings(requestData, dataset.slug);

    // Process all pending files associated with this mapping
    const files = await getPendingFilesWithMapping(entityManager, datasetFileMappings);

    // Resolve every band mapping and validate it against the file before writing anything, so the
    // progress denominator spans the whole job and a bad mapping aborts before a partial load.
    await reportProgress(0, `Reading band mappings for ${files.length} file(s)...`);
    const stagedBands = await prepareStagedBands(requestData, files, datasetFileMappings);

    // Normalize each file once, before any band is ingested: conversion is per file, so doing it
    // inside the band loop would redo the same work for every band of a multiband raster — and for
    // a unit conversion it would redo it wrongly, since a second pass rescales already-scaled
    // pixels. The loader is therefore the only place a file is normalized; ingestRaster reads
    // whatever files.file_path points at by then.
    const anyConverted = await normalizeFiles(stagedBands, reportProgress);
    const bandFloor = anyConverted ? CONVERSION_PROGRESS_CEILING : 0;

    for (const [index, staged] of stagedBands.entries()) {
      const { file, bandMapping } = staged;
      const loading = `Ingesting band ${bandMapping.band} of '${file.name}' (${index + 1} of ${stagedBands.length})...`;
      await reportProgress(bandPercentage(index, stagedBands.length, bandFloor), loading);

      let lastPercentage = -1;
      await ingestRaster({
        fileId: file.id,
        band: bandMapping.band,
        datasetId: dataset.id,
        soilPropertySlug: bandMapping.soilPropertySlug,
        minDepth: bandMapping.minDepth,
        maxDepth: bandMapping.maxDepth,
        referencePeriodStart: bandMapping.referencePeriodStart,
        referencePeriodStop: bandMapping.referencePeriodStop,
        procedureSlug: bandMapping.procedureSlug,
        // A single band's footprint pass runs for minutes, so report inside it rather than
        // letting the job sit silent between bands.
        onFootprintProgress: async (tilesProcessed, totalTiles) => {
          const percentage = bandPercentage(index + tilesProcessed / totalTiles, stagedBands.length, bandFloor);
          // Only write when the rendered percentage actually moves — tiles are far more
          // frequent than the client poll interval, so per-tile writes are invisible.
          if (percentage !== lastPercentage) {
            lastPercentage = percentage;
            await reportProgress(percentage, loading);
          }
        },
      });
    }

    // A file is loaded once every band its mapping names has been ingested. Unlike a bulk load,
    // the source file is never deleted and no raw table exists to drop: after a raster load the
    // file *is* the layer's data and must survive.
    //
    // Written as a targeted UPDATE rather than file.save(): these entities were loaded before
    // normalization repointed files.file_path, and save() diffs the whole entity against the row
    // it reloads — so it would write the pre-conversion path back over the converted one.
    const ingestedFileIds = [...new Set(stagedBands.map(staged => staged.file.id))];
    if (ingestedFileIds.length > 0) {
      await entityManager.getRepository(FileEntity).update({ id: In(ingestedFileIds) }, { status: IngestionStatus.LOADED });
    }

    // Calculate new dataset metadata and update status. getSubject resolves to the job's sub
    // today (the token carries only that) but upgrades automatically if jobs ever carry an email;
    // it throws when there is no sub at all, so a job without an owner records none.
    await reportProgress(LOAD_PROGRESS_CEILING, 'Computing dataset metadata...');
    const updatedBy = data.created_by ? getSubject(requestData) : null;
    await updateRasterDatasetMetadata(entityManager, dataset.id, IngestionStatus.LOADED, updatedBy);

    // The job is still active here, so this last write lands; once the processor
    // returns, updateJobState's `state = 'active'` guard makes it a no-op.
    await reportProgress(100, 'Raster load complete');
  } catch (error: any) {
    // Targeted for the same reason as the file status above: updateRasterDatasetMetadata may
    // already have rewritten this row, and saving the entity loaded at the top of the job would
    // restore its stale metadata along with the status.
    await entityManager.getRepository(DatasetEntity).update({ id: dataset.id }, { status: IngestionStatus.PENDING });
    throw error;
  }
}

const getPendingFilesWithMapping = async (entityManager: EntityManager, mappings: DatasetFileMappingEntity[]): Promise<FileEntity[]> => {
  const repo = entityManager.getRepository(FileEntity);
  const files = await repo.find({ where: { status: IngestionStatus.PENDING, id: In(mappings.map(m => m.file_id)) } });
  return files;
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
  stagedBands: StagedBand[],
  reportProgress: (percentage: number, description: string) => Promise<void>,
): Promise<boolean> => {
  const bandsByFile = new Map<string, { file: FileEntity; bandMappings: ResolvedBandMapping[] }>();
  for (const { file, bandMapping } of stagedBands) {
    const entry = bandsByFile.get(file.id) ?? { file, bandMappings: [] };
    entry.bandMappings.push(bandMapping);
    bandsByFile.set(file.id, entry);
  }

  const candidates = [...bandsByFile.values()];
  let anyConverted = false;

  for (const [index, { file, bandMappings }] of candidates.entries()) {
    const { converted } = await checkFileFormat({
      fileId: file.id,
      bands: bandMappings.map(bandMapping => ({
        band: bandMapping.band,
        soilPropertySlug: bandMapping.soilPropertySlug,
        standardUnit: bandMapping.standardUnit,
        originalUnit: bandMapping.originalUnit,
        conversionFormula: bandMapping.conversionFormula,
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
 * Resolves each file's Band Mapping and checks every band against the bands the file actually has.
 *
 * Band counts come from the metadata probed at upload, so an invalid band is rejected without
 * opening the raster. Bands a mapping does not name are skipped, which is how uncertainty and
 * count bands are excluded from ingestion.
 */
const prepareStagedBands = async (
  requestData: RequestData,
  files: FileEntity[],
  mappings: DatasetFileMappingEntity[],
): Promise<StagedBand[]> => {
  const service = new DataMappingService();
  const stagedBands: StagedBand[] = [];

  for (const file of files) {
    const datasetFileMapping = mappings.find(m => m.file_id === file.id);
    if (!datasetFileMapping || !datasetFileMapping.data_mapping_id) {
      throw new JobError('RL_MISSING_BAND_MAPPING');
    }

    const bandMappings = await service.parseRasterDataMapping(requestData, datasetFileMapping.data_mapping_id);
    if (bandMappings.length === 0) {
      throw new JobError('RL_MISSING_BAND_MAPPING');
    }

    const rasterMetadata: RasterFileMetadata | null = file.metadata?.is_raster ? file.metadata : null;
    const availableBands = new Set((rasterMetadata?.raster_bands ?? []).map(band => band.band_number));
    const bandCount = rasterMetadata?.band_count ?? 0;

    for (const bandMapping of bandMappings) {
      const { band } = bandMapping;
      if (!Number.isInteger(band) || band < 1 || (bandCount > 0 && !availableBands.has(band))) {
        throw new JobError('RL_INVALID_BAND', { file_name: file.name, band: String(band), band_count: String(bandCount) });
      }
      stagedBands.push({ file, bandMapping });
    }
  }

  return stagedBands;
};
