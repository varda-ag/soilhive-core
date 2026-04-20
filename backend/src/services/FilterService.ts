import { valid } from 'geojson-validation';
import { StatusCodes } from 'http-status-codes';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import { DataFilter, FilteredDatasetSummary, FilteredDataset, FilteredData } from '../interfaces/DatasetFilter';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import DataFilterEntity from '../entities/DataFilter';

export default class FilterService {
  createFilter = async (requestData: RequestData, filter: DataFilter): Promise<DataFilterEntity> => {
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

    const owner = requestData.token?.sub;
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    const entity = repo.create({ filter, ...(owner ? { owner } : {}) });
    return await repo.save(entity);
  };

  getFilters = async (requestData: RequestData): Promise<DataFilterEntity[]> => {
    const owner = requestData.token?.sub;
    if (!owner) {
      throw new ErrorResponse('Cannot retrieve filters for unauthenticated user', StatusCodes.UNAUTHORIZED);
    }
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    return await repo.findBy({ owner });
  };

  getFilterById = async (requestData: RequestData, filterId: string): Promise<DataFilterEntity> => {
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    const storedFilter = await repo.findOneBy({ id: filterId });
    if (!storedFilter) {
      throw new ErrorResponse(`Filter ${filterId} not found`, StatusCodes.NOT_FOUND);
    }
    return storedFilter;
  };

  getCoverage = async (requestData: RequestData, filterId: string): Promise<FilteredData> => {
    const storedFilter = await this.getFilterById(requestData, filterId);
    const filter = storedFilter!.filter;
    const sds = new SoilDataStorage();
    // Create filtering promisees
    const filteringPromises: Promise<FilteredDatasetSummary[]>[] = [];
    for (const g of filter.geometries) {
      filteringPromises.push(sds.filter(requestData.entityManager, g, filter.parameters));
    }
    // Wait for all filtering to complete
    const datasets = (await Promise.all(filteringPromises)).flat();
    // Add raster coverage
    const rasterCoverage = await sds.getRasterCoverage(requestData.entityManager, filter.geometries, filter.parameters.raster_filters);
    // Deduplicate datasets across geometries
    return { datasets: Array.from(new Map(datasets.map(r => [r.id, r])).values()), raster_filters: rasterCoverage };
  };

  getDatasets = async (requestData: RequestData, filterId: string): Promise<FilteredDataset[]> => {
    const storedFilter = await this.getFilterById(requestData, filterId);
    const filter = storedFilter!.filter;
    const sds = new SoilDataStorage();
    // Create filtering promisees
    const filteringPromises: Promise<FilteredDataset[]>[] = [];
    for (const g of filter.geometries) {
      filteringPromises.push(sds.filterDatasets(requestData.entityManager, g));
    }
    const results = (await Promise.all(filteringPromises)).flat();
    return Array.from(new Map(results.map(r => [r.id, r])).values());

  };
}
