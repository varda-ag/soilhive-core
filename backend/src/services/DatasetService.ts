import { valid } from 'geojson-validation';
import { StatusCodes } from 'http-status-codes';
import { hasher } from 'node-object-hash';
import { JsonStorage } from '../entities/JsonStorage';
import { DatasetFilter, FilteredDataset, PostDatasetFilterResponse, StoredDatasetFilter } from '../interfaces/DatasetFilter';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { Dataset } from '../interfaces/Dataset';
import DatasetEntity from '../entities/Dataset';
import SoilDataStorage from '../data-layer/SoilDataStorage';

export default class DatasetService {
  postFilter = async (requestData: RequestData, filter: DatasetFilter): Promise<PostDatasetFilterResponse> => {
    // Validate geometries in the payload
    for (const geometry of filter.geometries) {
      if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) {
        throw new ErrorResponse(
          `Unsupported filtering geometry type: ${geometry.type} (allowed: Polygon, MultiPolygon)`,
          StatusCodes.BAD_REQUEST,
        );
      }
      if (!valid(geometry)) {
        throw new ErrorResponse(`Invalid geometry provided for filtering: ${JSON.stringify(geometry)}`, StatusCodes.BAD_REQUEST);
      }
    }

    const storedFilter = {
      id: hasher().hash(filter),
      name: new Date().toISOString(),
      ...filter,
    };

    await this.saveFilterInDB(requestData, storedFilter);

    const sds = new SoilDataStorage();

    // Create filtering promisees
    const filteringPromises: Promise<FilteredDataset[]>[] = [];
    for (const g of filter.geometries) {
      filteringPromises.push(sds.filter(requestData.entityManager, g, filter.parameters));
    }
    // Wait for all filtering to complete
    const results = (await Promise.all(filteringPromises)).map(res => {
      return { datasets: res };
    });

    // Return the stored filter along with the results
    return {
      ...storedFilter,
      results,
    };
  };

  saveFilterInDB = async (requestData: RequestData, filter: StoredDatasetFilter) => {
    if (!requestData.token) {
      // Only logged in users can save filters
      return;
    }

    const userId = requestData.token.sub;
    const storageId = `filter_${userId}`;
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const row = await repo.findOneBy({ id: storageId });

    if (row) {
      // Adding this filter to the existing user defined ones
      row.data[filter.id] = filter;
      await row.save();
    } else {
      // Creating user filter preferences
      const newRow = new JsonStorage();
      newRow.id = storageId;
      newRow.data = {};
      newRow.data[filter.id] = filter;
      await repo.save(newRow);
    }
  };

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
