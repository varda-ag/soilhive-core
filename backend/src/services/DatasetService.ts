import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getEntity } from '../utils/slugs';
import { EntityType, IngestionStatus } from '../types/data';

export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<DatasetEntity[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    return await repo.find();
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<DatasetEntity> => {
    return await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
  };

  createDataset = async (requestData: RequestData, data: CreateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);

    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const dataset = repo.create({
      ...data,
      created_by: String(sub),
      updated_by: String(sub),
    });

    try {
      const saved = await repo.save(dataset);
      const reloaded = await repo.findOneBy({ id: saved.id });
      return reloaded!;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`Dataset with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };

  updateDataset = async (requestData: RequestData, slug: string, data: UpdateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const { sub } = requestData.token ?? {};

    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const dataset: DatasetEntity = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);

    repo.merge(dataset, {
      ...data,
      updated_by: String(sub),
      updated_at: new Date(),
    });

    const saved = await repo.save(dataset);
    const reloaded = await repo.findOneBy({ id: saved.id });
    return reloaded!;
  };

  deleteDataset = async (requestData: RequestData, slug: string): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
    const { sub } = requestData.token ?? {};

    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }
    dataset.status = IngestionStatus.ARCHIVED;
    dataset.updated_by = String(sub);
    await dataset.save();
    await requestData.entityManager.getRepository(DatasetEntity).softRemove(dataset);
  };
}
