import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';

export default class DatasetFileMappingService {
  static toResponse = (
    resultData: DatasetFileMappingEntity | DatasetFileMappingEntity[],
  ): DatasetFileMappingResponse | DatasetFileMappingResponse[] => {
    if (Array.isArray(resultData)) {
      return resultData.map(d => this.toResponse(d)) as DatasetFileMappingResponse[];
    }

    const retVal: DatasetFileMappingResponse = {
      id: resultData?.['id'],
    };

    if (resultData?.['file_id']) {
      retVal.fileID = resultData?.['file_id'];
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
      values.file_id = payload.fileID;
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
      updateValues.file_id = payload.fileID;
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

    // Find mapping by ID (primary key)
    const mapping = await repo.findOneBy({ id: datasetFileMappingId });

    if (!mapping) {
      throw new ErrorResponse(`DatasetFileMapping with ID '${datasetFileMappingId}' not found`, StatusCodes.NOT_FOUND);
    }

    return mapping;
  };

  getMappings = async (requestData: RequestData, datasetId: string, fileId?: string): Promise<DatasetFileMappingEntity[]> => {
    const { entityManager } = requestData;

    // the id coming in as parameter is the slug that allow us to load the dataset iwth it's actual uuid
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetId);

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    const whereConditions: any = {
      dataset_id: dataset.id,
    };

    if (fileId !== undefined) {
      whereConditions.file_id = fileId;
    }

    // Find all mappings for the dataset, optionally filtered by fileId
    const datasetFileMappings = await repo.find({
      where: whereConditions,
    });

    if (datasetFileMappings.length === 0) {
      const fileIdMsg = fileId ? ` and fileId '${fileId}'` : '';
      throw new ErrorResponse(`No DatasetFileMappings found for dataset '${datasetId}'${fileIdMsg}`, StatusCodes.NOT_FOUND);
    }

    return datasetFileMappings;
  };
}
