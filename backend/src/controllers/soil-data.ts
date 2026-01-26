import { Request, Response } from 'express';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import { DataFilter } from '../interfaces/DatasetFilter';
import FilterService from '../services/FilterService';

const soilDataStorage = new SoilDataStorage();

export const getSoilData = async (req: Request, res: Response) => {
  const filter = await getDataFilter(req);
  const data = await soilDataStorage.getSoilData(
    req.customData.entityManager,
    filter,
    req.query['datasets'] as string[],
    parseInt(req.query['limit'] as string),
    req.query['cursor'] as string,
    req.query['sort'] as string,
  );
  res.json(data);
};

const getDataFilter = async (req: Request): Promise<DataFilter> => {
  if (!req.query['filterId']) {
    return { geometries: [], parameters: {} };
  }
  const filterId = req.query['filterId'] as string;
  const filterService = new FilterService();
  const storedFilter = await filterService.getFilterById(req.customData, filterId);
  return storedFilter!.filter;
};
