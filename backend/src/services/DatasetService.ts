import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { Dataset } from '../interfaces/Dataset';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { BulkLoad, BulkLoadStatus } from '../interfaces/BulkLoad';
import BulkLoadEntity from '../entities/BulkLoad';
import { In } from 'typeorm';
import BulkLoader from '../data-layer/BulkLoader';

export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<Dataset[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    return await repo.find();
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<Dataset> => {
    return await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
  };

  createDataset = async (requestData: RequestData, data: CreateDatasetInput): Promise<Dataset> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);

    const { sub } = requestData.token;
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

  updateDataset = async (requestData: RequestData, slug: string, data: UpdateDatasetInput): Promise<Dataset> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const { sub } = requestData.token;

    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const dataset = (await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug)) as DatasetEntity;

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
    await requestData.entityManager.getRepository(DatasetEntity).softRemove(dataset);
  };

  createBulkLoad = async (requestData: RequestData, datasetSlug: string): Promise<BulkLoad> => {
    const repo = requestData.entityManager.getRepository(BulkLoadEntity);

    // Check if pending/in_progress bulk load exists for the dataset
    const existing = await this.getBulkLoadList(requestData, datasetSlug, [BulkLoadStatus.ONGOING]);
    if (existing.length > 0) {
      throw new ErrorResponse(
        `A bulk load with status '${existing[0]!.status}' already exists for this dataset`,
        StatusCodes.UNPROCESSABLE_ENTITY,
      );
    }

    const { sub } = requestData.token;
    const job = repo.create({
      dataset_id: datasetSlug,
      created_by: String(sub),
      updated_by: String(sub),
    });
    const saved = await repo.save(job);

    // Start the async job
    const service = new BulkLoader();
    service.startBulkLoad(this, saved, requestData.token);

    return await repo.findOneByOrFail({ id: saved.id });
  };

  getBulkLoadList = async (requestData: RequestData, datasetSlug: string, statuses: BulkLoadStatus[] = []): Promise<BulkLoad[]> => {
    const where = { dataset_id: datasetSlug };
    if (Array.isArray(statuses) && statuses.length > 0) {
      Object.assign(where, { status: In(statuses) });
    }
    const repo = requestData.entityManager.getRepository(BulkLoadEntity);
    return await repo.find({ where, order: { created_at: 'ASC' } });
  };

  getBulkLoadById = async (requestData: RequestData, bulkLoadId: string): Promise<BulkLoad> => {
    const repo = requestData.entityManager.getRepository(BulkLoadEntity);
    const data = await repo.findOneBy({ id: bulkLoadId });
    if (!data) {
      throw new ErrorResponse(`Bulk load '${bulkLoadId}' not found`, StatusCodes.NOT_FOUND);
    }
    return data;
  };

  deleteBulkLoadById = async (requestData: RequestData, bulkLoadId: string) => {
    const repo = requestData.entityManager.getRepository(BulkLoadEntity);
    const data = await repo.findOneBy({ id: bulkLoadId });
    if (!data) {
      throw new ErrorResponse(`Bulk load '${bulkLoadId}' not found`, StatusCodes.NOT_FOUND);
    }
    data.status = BulkLoadStatus.CANCELED;
    await data.save();
  };
}
