import { RequestData } from '../interfaces/RequestData';
import { DatasetFileMappingRequest, DatasetFileMappingResponse } from '../interfaces/DatasetFileMapping';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import DatasetEntity from '../entities/Dataset';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class DatasetFileMappingService {
  upsertMapping = async (
    requestData: RequestData,
    datasetSlug: string,
    payload: DatasetFileMappingRequest,
    existingMappingId?: string, // Used for PATCH logic if specific ID provided
  ): Promise<DatasetFileMappingResponse> => {
    const { entityManager } = requestData;

    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, datasetSlug);

    const repo = entityManager.getRepository(DatasetFileMappingEntity);

    const values: any = {
      dataset_id: dataset.id,
    };

    const updateColumns: string[] = ['updated_at'];

    if (payload.fileID !== undefined) {
      values.file_id = payload.fileID;
      updateColumns.push('file_id');
    }

    if (payload.mappingId !== undefined) {
      values.data_mapping_id = payload.mappingId;
      updateColumns.push('data_mapping_id');
    }

    if (existingMappingId) {
      values.id = existingMappingId;
    }

    // 2. Perform Upsert
    // We target the unique constraint: data_mapping_id, file_id, dataset_id
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(DatasetFileMappingEntity)
      .values(values)
      .orUpdate(
        updateColumns,
        ['id'], // If ID is provided, conflict on ID
      )
      .returning('id')
      .execute();

    const generatedId = result.generatedMaps[0]?.['id'];

    return { id: generatedId };
  };
}
