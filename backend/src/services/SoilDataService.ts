import { RequestData } from '../interfaces/RequestData';
import { SoilDataSample } from '../interfaces/SoilDataSample';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import FilterService from './FilterService';

export default class SoilDataService {
  private soilDataStorage = new SoilDataStorage();
  private filterService = new FilterService();

  getSoilData = async (
    requestData: RequestData,
    filterId: string,
    datasets: string,
    limit: number,
    cursor?: string,
  ): Promise<SoilDataSample[]> => {
    const storedFilter = await this.filterService.getFilterById(requestData, filterId);
    const dataFilter = storedFilter.filter;

    const datasetSlugs = datasets.split(',');

    return await this.soilDataStorage.getSoilData(requestData.entityManager, dataFilter, datasetSlugs, limit, cursor);
  };
}
