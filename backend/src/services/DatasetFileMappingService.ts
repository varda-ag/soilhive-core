import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { isDeepStrictEqual } from 'util';
import { getEntity } from '../utils/slugs';
import { EntityType, IngestionStatus } from '../types/data';
import DataMappingEntity from '../entities/DataMapping';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import FileEntity from '../entities/File';
import RasterFilterEntity from '../entities/RasterFilter';
import { log } from '../utils/logger';
import { assertNoUnfinishedJob } from '../data-layer/DatasetJobs';

/**
 * Orders two mappings of the same File by when they were last touched, falling back to their ids.
 *
 * The id comparison is lexicographic on purpose: a uuidv7 carries its timestamp in the leading bits,
 * so string order is generation order — which makes it a tiebreak that still means "later" rather
 * than an arbitrary but stable one. `updated_at` is NOT NULL in the database and equals `created_at`
 * on insert; the null branch only exists because the entity types it as nullable.
 */
const isMoreRecent = (candidate: DatasetFileMappingEntity, current: DatasetFileMappingEntity): boolean => {
  const candidateTime = candidate.updated_at?.getTime() ?? 0;
  const currentTime = current.updated_at?.getTime() ?? 0;
  return candidateTime === currentTime ? candidate.id > current.id : candidateTime > currentTime;
};

export default class DatasetFileMappingService {
  /**
   * Reduces a Dataset's mappings to the Current one per File: the most recently touched, with the
   * rest treated as superseded history (see ADR 0020).
   *
   * `dataset_file_mappings` is unique on (data_mapping_id, file_id, dataset_id), so one File can
   * carry several mappings, and the loaders need one answer to "which mapping governs this load".
   * Ordering is by `updated_at` rather than creation, because re-declaring a mapping happens as a
   * PATCH that repoints an existing row — under creation order that write could not change what a
   * load ingests. `id` breaks ties: both timestamp defaults are `now()`, which is transaction-wide,
   * so rows inserted together share an `updated_at` while `uuidv7()` is generated per row.
   *
   * Must be given the mappings of a *single* Dataset: the same File is mapped independently per
   * Dataset, and comparing timestamps across them would pick a mapping belonging to another load.
   * Mappings with no `file_id` belong to no File and are dropped.
   */
  static currentMappingsByFile = (mappings: DatasetFileMappingEntity[]): Map<string, DatasetFileMappingEntity> => {
    const currentByFile = new Map<string, DatasetFileMappingEntity>();
    let considered = 0;

    for (const mapping of mappings) {
      if (!mapping.file_id) continue;
      considered++;
      const current = currentByFile.get(mapping.file_id);
      if (!current || isMoreRecent(mapping, current)) {
        currentByFile.set(mapping.file_id, mapping);
      }
    }

    // The admin UI re-declares a mapping by repointing the existing row, so it never leaves more
    // than one behind — reaching this means the mappings were created through the API directly, and
    // that a load is about to ignore declarations someone wrote. Worth a line before it does.
    if (considered > currentByFile.size) {
      log.info('Superseded dataset file mappings ignored', {
        files: currentByFile.size,
        superseded: considered - currentByFile.size,
      });
    }

    return currentByFile;
  };

  static toResponse = async (
    requestData: RequestData,
    resultData: DatasetFileMappingEntity | DatasetFileMappingEntity[],
  ): Promise<DatasetFileMappingResponse | DatasetFileMappingResponse[]> => {
    if (Array.isArray(resultData)) {
      return Promise.all(resultData.map(d => this.toResponse(requestData, d))) as Promise<DatasetFileMappingResponse[]>;
    }

    const retVal: DatasetFileMappingResponse = {
      id: resultData?.['id'],
    };

    if (resultData?.['file_id']) {
      if (resultData.file?.slug) {
        // after creation, or get (with file relation)
        retVal.fileID = resultData.file.slug;
      } else {
        const fileRepo = requestData.entityManager.getRepository(FileEntity);
        const fileEntity = await fileRepo.findOne({ where: { id: resultData['file_id'] } });
        retVal.fileID = fileEntity!.slug; // idToSlug not used here, since only handles the entity's own ID, not nested foreign keys
      }
    }

    if (resultData?.['data_mapping_id']) {
      retVal.mappingId = resultData?.['data_mapping_id'];
    }

    return retVal;
  };

  createMapping = async (
    requestData: RequestData,
    datasetId: string,
    payload: DatasetFileMappingRequest,
  ): Promise<DatasetFileMappingEntity> => {
    const { entityManager } = requestData;

    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetId);

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    const values: any = {
      dataset_id: dataset.id,
    };

    if (payload.fileID !== undefined) {
      const file = await this.getMappableFile(requestData, payload.fileID);
      values.file_id = file.id;
    }

    if (payload.mappingId !== undefined) {
      values.data_mapping_id = payload.mappingId;
    }

    // Insert new mapping
    try {
      const result = await repo.createQueryBuilder().insert().into(DatasetFileMappingEntity).values(values).returning('*').execute();
      const row = result.raw[0] as DatasetFileMappingEntity;
      return repo.create(row);
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(
          `DatasetFileMapping with the same dataset_id ('${datasetId}), file_id (${payload.fileID}) and mappingId (${payload.mappingId})' already exists`,
          StatusCodes.CONFLICT,
        );
      }
      throw error;
    }
  };

  updateMapping = async (
    requestData: RequestData,
    datasetSlug: string,
    mappingId: string,
    payload: DatasetFileMappingRequest,
  ): Promise<DatasetFileMappingEntity> => {
    const { entityManager } = requestData;

    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    const updateValues: any = {
      updated_at: new Date(),
    };

    if (payload.fileID !== undefined) {
      const file = await this.getMappableFile(requestData, payload.fileID);
      updateValues.file_id = file.id;
    }

    if (payload.mappingId !== undefined) {
      updateValues.data_mapping_id = payload.mappingId;
      await this.assertMappingEditable(requestData, dataset.id, mappingId, payload.mappingId);
    }

    // Update existing mapping
    const result = await repo
      .createQueryBuilder()
      .update(DatasetFileMappingEntity)
      .set(updateValues)
      .where('id = :id', { id: mappingId })
      .andWhere('dataset_id = :datasetId', { datasetId: dataset.id })
      .returning('*')
      .execute();

    const row = result.raw[0] as DatasetFileMappingEntity;
    return repo.create(row);
  };

  /**
   * The File a mapping points at. A Raster Filter's source is refused: its installation deletes it
   * (docs/adr/0066).
   */
  private getMappableFile = async (requestData: RequestData, slug: string): Promise<FileEntity> => {
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    const rasterFilter = await requestData.entityManager.getRepository(RasterFilterEntity).findOneBy({ file_id: file.id });
    if (rasterFilter) {
      throw new ErrorResponse(
        `File '${slug}' is the source of raster filter '${rasterFilter.id}', whose installation deletes it`,
        StatusCodes.CONFLICT,
      );
    }
    return file;
  };

  /**
   * Refuses repointing a loaded File at a data mapping with different content: a loaded File keeps
   * the mapping it was loaded with.
   *
   * Compared by content rather than by id: the mapping steps write a fresh data mapping on every
   * save, so a new id alone says nothing about whether anything was edited.
   */
  private assertMappingEditable = async (
    requestData: RequestData,
    datasetId: string,
    datasetFileMappingId: string,
    newDataMappingId: string,
  ): Promise<void> => {
    const { entityManager } = requestData;
    const current = await entityManager
      .getRepository(DatasetFileMappingEntity)
      .findOne({ where: { id: datasetFileMappingId, dataset_id: datasetId }, relations: { file: true } });
    const file = current?.file;
    if (!file || file.status !== IngestionStatus.LOADED || current.data_mapping_id === newDataMappingId) {
      return;
    }

    const dataMappingRepo = entityManager.getRepository(DataMappingEntity);
    const [before, after] = await Promise.all([
      current.data_mapping_id ? dataMappingRepo.findOneBy({ id: current.data_mapping_id }) : null,
      dataMappingRepo.findOneBy({ id: newDataMappingId }),
    ]);
    if (isDeepStrictEqual(before?.data_mapping ?? null, after?.data_mapping ?? null)) {
      return;
    }

    const remedy = file.metadata?.is_raster ? ': to correct it, remove the file and upload it again' : '';
    throw new ErrorResponse(
      `File '${file.slug}' is already loaded, so its mapping can no longer be changed${remedy}`,
      StatusCodes.CONFLICT,
    );
  };

  getDatasetFileMapping = async (requestData: RequestData, datasetFileMappingId: string): Promise<DatasetFileMappingEntity> => {
    const { entityManager } = requestData;

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    // load file relation for the slug
    const mapping = await repo.findOne({ where: { id: datasetFileMappingId }, relations: ['file'] });

    if (!mapping) {
      throw new ErrorResponse(`DatasetFileMapping with ID '${datasetFileMappingId}' not found`, StatusCodes.NOT_FOUND);
    }

    return mapping;
  };

  getMappings = async (
    requestData: RequestData,
    datasetSlug?: string,
    fileSlug?: string,
    relations: string[] = [],
  ): Promise<DatasetFileMappingEntity[]> => {
    const { entityManager } = requestData;

    // Getting the actual dataset ID
    const dataset = datasetSlug ? await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug) : undefined;

    // Find all the mappings for the dataset, optionally filtered by fileId
    const whereConditions: any = dataset ? { dataset_id: dataset.id } : {};
    if (fileSlug !== undefined) {
      const fileEntity = await getEntity(requestData, FileEntity, EntityType.FILE, fileSlug);
      whereConditions.file_id = fileEntity.id;
    }

    const repo = entityManager.getRepository(DatasetFileMappingEntity);
    return await repo.find({ where: whereConditions, relations });
  };

  /**
   * Takes a File out of the Dataset. A loaded raster File's Raster Layers stay until the next Raster
   * Load removes them (see removeUnmappedLayers in RasterLoader): deleting them and rolling the Dataset
   * up can outlast a request.
   */
  deleteDataMappingByFileId = async (requestData: RequestData, datasetSlug: string, fileId: string): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, fileId);
    DatasetFileMappingService.assertRemovable(file);

    const repo = requestData.entityManager.getRepository(DatasetFileMappingEntity);

    await repo.delete({ dataset_id: dataset.id, file_id: file.id });
  };

  /**
   * Checks a File can be deleted, ahead of FileService.deleteFile: a loaded vector File is refused,
   * and so is any File while a Dataset it is mapped to has a load or purge Queued or running, as the
   * mapping route's assertEditable. Raster reads hide a deleted File's layers straight away; the next
   * Raster Load removes them.
   *
   * Kept out of FileService, which can't import the Dataset job lookups without an import cycle.
   */
  static assertFileDeletable = async (requestData: RequestData, fileSlug: string): Promise<void> => {
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, fileSlug);
    DatasetFileMappingService.assertRemovable(file);
    const mappings = await requestData.entityManager
      .getRepository(DatasetFileMappingEntity)
      .find({ where: { file_id: file.id }, relations: { dataset: true } });
    const datasets = [...new Map(mappings.filter(m => m.dataset).map(m => [m.dataset.id, m.dataset])).values()];
    for (const dataset of datasets) {
      await assertNoUnfinishedJob(requestData.entityManager, dataset);
    }
  };

  /**
   * Refuses removing a loaded vector File with 409: its observations don't record their source
   * File, so they could only be removed with the whole Dataset's data.
   */
  static assertRemovable = (file: FileEntity): void => {
    if (file.status === IngestionStatus.LOADED && !file.metadata?.is_raster) {
      throw new ErrorResponse(
        `File '${file.slug}' is already loaded and can't be removed: its observations don't record which file they came from`,
        StatusCodes.CONFLICT,
      );
    }
  };
}
