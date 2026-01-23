import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import FilterService from '../services/FilterService';
import SoilDataService from '../services/SoilDataService';

const filterService = new FilterService();
const soilDataService = new SoilDataService();

export const postDataFilters = async (req: Request, res: Response) => {
  const data = await filterService.createFilter(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const getDataFilters = async (_: Request, __: Response) => {
  throw new Error('Not implemented');
};

export const getDataFilterById = async (_: Request, __: Response) => {
  throw new Error('Not implemented');
};

export const getDataFilterCoverage = async (req: Request, res: Response) => {
  const data = await filterService.getCoverage(req.customData, req.params['filterId']!);
  res.json(data);
};

export const getSoilData = async (req: Request, res: Response) => {
  const data = await soilDataService.getSoilData(
    req.customData,
    req.params['filterId']!,
    req.params['datasets']!,
    parseInt(req.params['limit']!),
    req.params['cursor'],
  );
  res.json(data);
};
