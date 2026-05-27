import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import FileEntity from '../entities/File';

export default class DatasetFileMappingService {
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
