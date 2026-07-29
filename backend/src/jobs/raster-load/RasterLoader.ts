import { Job } from 'pg-boss';
import { EntityManager, In } from 'typeorm';
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
import { ingestRaster } from '../../services/RasterIngestService';
import { updateRasterDatasetMetadata } from './UpdateDatasetMetadata';
import EntitlementService from '../../services/EntitlementService';
import { progressReporter } from '../../services/PgBoss';
import { getSubject } from '../../utils/auth';
import { EVERYONE } from '../../constants/constants';

// Band ingestion owns 0..LOAD_PROGRESS_CEILING; the remainder covers dataset metadata.
const LOAD_PROGRESS_CEILING = 90;

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

    // Process all staged files associated with this mapping
    const files = await getStagedFilesWithMapping(entityManager, datasetFileMappings);

    // Resolve every band mapping and validate it against the file before writing anything, so the
    // progress denominator spans the whole job and a bad mapping aborts before a partial load.
    await reportProgress(0, `Reading band mappings for ${files.length} file(s)...`);
    const stagedBands = await prepareStagedBands(requestData, files, datasetFileMappings);

    for (const [index, staged] of stagedBands.entries()) {
      const { file, bandMapping } = staged;
      const loading = `Ingesting band ${bandMapping.band} of '${file.name}' (${index + 1} of ${stagedBands.length})...`;
      await reportProgress(bandPercentage(index, stagedBands.length), loading);

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
        standardUnit: bandMapping.standardUnit,
        originalUnit: bandMapping.originalUnit,
        conversionFormula: bandMapping.conversionFormula,
        // A single band's footprint pass runs for minutes, so report inside it rather than
        // letting the job sit silent between bands.
        onFootprintProgress: async (tilesProcessed, totalTiles) => {
          const percentage = bandPercentage(index + tilesProcessed / totalTiles, stagedBands.length);
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
    const ingestedFileIds = new Set(stagedBands.map(staged => staged.file.id));
    for (const file of files.filter(f => ingestedFileIds.has(f.id))) {
      file.status = IngestionStatus.LOADED;
      await file.save();
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
    dataset.status = IngestionStatus.PENDING;
    await dataset.save();
    throw error;
  }
}

const getStagedFilesWithMapping = async (entityManager: EntityManager, mappings: DatasetFileMappingEntity[]): Promise<FileEntity[]> => {
  const repo = entityManager.getRepository(FileEntity);
  const files = await repo.find({ where: { status: IngestionStatus.STAGED, id: In(mappings.map(m => m.file_id)) } });
  return files;
};

const bandPercentage = (bandsProcessed: number, totalBands: number): number =>
  totalBands > 0 ? Math.round((LOAD_PROGRESS_CEILING * bandsProcessed) / totalBands) : 0;

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
