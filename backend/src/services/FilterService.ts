import { valid } from 'geojson-validation';
import { StatusCodes } from 'http-status-codes';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import { DataFilter, FilteredDatasetSummary, FilteredDataset, FilteredData } from '../interfaces/DatasetFilter';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { mergeMin, mergeMax } from '../utils/utils';
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
    const batches = await Promise.all(filteringPromises);
    // Aggregate summeries across geometries
    const datasets = mergeDatasetSummaries(batches);
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

export const mergeDatasetSummaries = (batches: FilteredDatasetSummary[][]): FilteredDatasetSummary[] => {
  const acc = new Map<string, FilteredDatasetSummary>();
  for (const batch of batches) {
    for (const ds of batch) {
      const existing = acc.get(ds.id);
      if (!existing) {
        acc.set(ds.id, {
          ...ds,
          licenses: [...(ds.licenses ?? [])],
          soil_properties: [...(ds.soil_properties ?? [])],
        });
        continue;
      }
      existing.dataset_layer_count += ds.dataset_layer_count;
      existing.licenses = [...new Set([...(existing.licenses ?? []), ...(ds.licenses ?? [])])];
      existing.soil_properties = [...new Set([...(existing.soil_properties ?? []), ...(ds.soil_properties ?? [])])];
      existing.min_sampling_date = mergeMin(existing.min_sampling_date ?? null, ds.min_sampling_date ?? null);
      existing.max_sampling_date = mergeMax(existing.max_sampling_date ?? null, ds.max_sampling_date ?? null);
      existing.min_depth =
        existing.min_depth === null || ds.min_depth === null ? null : Math.min(existing.min_depth ?? Infinity, ds.min_depth ?? Infinity);
      existing.max_depth =
        existing.max_depth === null || ds.max_depth === null ? null : Math.max(existing.max_depth ?? -Infinity, ds.max_depth ?? -Infinity);
    }
  }
  return Array.from(acc.values());
};
