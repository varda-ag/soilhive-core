import { RequestData } from '../interfaces/RequestData';
import { SoilDataSample } from '../interfaces/SoilDataSample';

export default class SoilDataService {
  getSoilData = async (
    _requestData: RequestData,
    _filterId: string,
    _datasets: string,
    _limit: number,
    _cursor?: string,
  ): Promise<SoilDataSample[]> => {
    // TODO: implement this method
    return [];
  };
}
