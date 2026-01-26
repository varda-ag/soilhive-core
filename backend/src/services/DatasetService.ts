import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { Dataset } from '../interfaces/Dataset';
import DatasetEntity from '../entities/Dataset';

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
}
