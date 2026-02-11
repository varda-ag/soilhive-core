import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';

export default class DatasetFileMappingService {
  private mapResultToResponse = (resultData: any): DatasetFileMappingResponse => {
    const retVal: any = {
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
  ): Promise<DatasetFileMappingResponse> => {
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
      const result = await repo
        .createQueryBuilder()
        .insert()
        .into(DatasetFileMappingEntity)
        .values(values)
        .returning(['id', 'file_id', 'data_mapping_id'])
        .execute();

      return this.mapResultToResponse(result.generatedMaps[0]);
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
  ): Promise<DatasetFileMappingResponse> => {
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
      .returning(['id', 'file_id', 'data_mapping_id'])
      .execute();

    return this.mapResultToResponse(result.raw[0]);
  };

  getDatasetFileMapping = async (requestData: RequestData, id: string): Promise<DatasetFileMappingEntity> => {
    const { entityManager } = requestData;

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    const datasetFileMapping = await repo.findOneBy({ id });

    if (!datasetFileMapping) {
      throw new ErrorResponse(`Dataset File Mapping with ID ${id} not found`, StatusCodes.NOT_FOUND);
    }

    return datasetFileMapping;
  };
}
