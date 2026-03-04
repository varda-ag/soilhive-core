import RasterFilterEntity from '../entities/RasterFilter';
import { RequestData } from '../interfaces/RequestData';
import { RasterFilterWithEnabled } from '../interfaces/RasterFilter';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';

export default class RasterFilterService {
  getRasterFilters = async (requestData: RequestData): Promise<RasterFilterEntity[]> => {
    const repo = requestData.entityManager.getRepository(RasterFilterEntity);
    return await repo.find();
  };

  getRasterFilter = async (requestData: RequestData, id: string): Promise<RasterFilterEntity> => {
    const repo = requestData.entityManager.getRepository(RasterFilterEntity);
    const entity = await repo.findOneBy({ id });
    if (!entity) {
      throw new ErrorResponse(`Resource '${id}' not found`, StatusCodes.NOT_FOUND);
    }
    return entity;
  };

  getEnabledRasterFilters = async (requestData: RequestData): Promise<RasterFilterWithEnabled[]> => {
    const data = await this.getRasterFilters(requestData);
    const decorated = await RasterFilterService.decorateWithEnable(requestData, data);
    return (decorated as RasterFilterWithEnabled[]).filter(d => d.enabled);
  };

  static decorateWithEnable = async (
    requestData: RequestData,
    input: RasterFilterEntity | RasterFilterEntity[],
  ): Promise<RasterFilterWithEnabled | RasterFilterWithEnabled[]> => {
    if (Array.isArray(input)) {
      const promises = input.map(e => this.decorateWithEnable(requestData, e));
      const results = await Promise.all(promises);
      return results as RasterFilterWithEnabled[];
    }
    const output = { enabled: false, ...input };
    const hasTable = await requestData.entityManager.queryRunner?.hasTable(input.id);
    output.enabled = Boolean(hasTable && input.mappings && Object.keys(input.mappings).length > 0);
    return output;
  };
}
