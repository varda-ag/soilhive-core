import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { Dataset } from '../interfaces/Dataset';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput } from '../types/DatasetInput';

export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<Dataset[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    return await repo.find();
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<Dataset> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const dataset = await repo.findOneBy({ slug });
    if (!dataset) {
      throw new ErrorResponse(`Dataset ${slug} not found`, StatusCodes.NOT_FOUND);
    }
    return dataset;
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
      await repo.save(dataset);
      await dataset.reload();
      return dataset;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`Dataset with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };
}
