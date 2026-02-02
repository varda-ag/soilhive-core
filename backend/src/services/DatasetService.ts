import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { Dataset } from '../interfaces/Dataset';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import SlugHistoryEntity from '../entities/SlugHistory';
import { EntityType } from '../types/data';

export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<Dataset[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    return await repo.find();
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<Dataset> => {
    return await this.findBySlug(requestData, slug);
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

    const dataset = await this.findBySlug(requestData, slug);

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
    const dataset = await this.findBySlug(requestData, slug);
    await requestData.entityManager.getRepository(DatasetEntity).softDelete({ id: dataset.id });
  };

  private findBySlug = async (requestData: RequestData, slug: string): Promise<DatasetEntity> => {
    const datasetRepo = requestData.entityManager.getRepository(DatasetEntity);

    // try slug in dataset first
    let dataset = await datasetRepo.findOne({
      where: { slug },
    });

    if (dataset) {
      return dataset;
    }

    // otherwise search in the slug history
    const slugHistoryRepo = requestData.entityManager.getRepository(SlugHistoryEntity);
    const slugHistory = await slugHistoryRepo.findOne({
      where: {
        slug,
        entity_type: EntityType.DATASET,
      },
    });

    if (!slugHistory) {
      throw new ErrorResponse(`Dataset with slug '${slug}' not found`, StatusCodes.NOT_FOUND);
    }

    // Get the dataset by entity_id from history
    dataset = await datasetRepo.findOne({
      where: { id: slugHistory.entity_id },
    });

    if (!dataset) {
      throw new ErrorResponse(`Dataset with slug '${slug}' not found`, StatusCodes.NOT_FOUND);
    }

    return dataset;
  };
}
