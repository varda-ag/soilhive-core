import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import FileEntity from '../entities/File';
import { log } from '../utils/logger';

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
      const file = await getEntity(requestData, FileEntity, EntityType.FILE, payload.fileID);
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
      const file = await getEntity(requestData, FileEntity, EntityType.FILE, payload.fileID);
      updateValues.file_id = file.id;
    }

    if (payload.mappingId !== undefined) {
      updateValues.data_mapping_id = payload.mappingId;
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

  deleteDataMappingByFileId = async (requestData: RequestData, datasetSlug: string, fileId: string): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, fileId);

    const repo = requestData.entityManager.getRepository(DatasetFileMappingEntity);

    await repo.delete({ dataset_id: dataset.id, file_id: file.id });
  };
}
