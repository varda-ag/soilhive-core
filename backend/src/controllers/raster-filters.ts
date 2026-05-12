import { Request, Response } from 'express';
import RasterFilterService from '../services/RasterFilterService';

const rasterFilterService = new RasterFilterService();

export const getRasterFilters = async (req: Request, res: Response) => {
  const data = await rasterFilterService.getRasterFilters(req.customData);
  const decorated = await RasterFilterService.decorateWithEnable(req.customData, data);
  res.json(decorated);
};

export const getRasterFilter = async (req: Request, res: Response) => {
  const data = await rasterFilterService.getRasterFilter(req.customData, req.params['rasterFilterId']! as string);
  const decorated = await RasterFilterService.decorateWithEnable(req.customData, data);
  res.json(decorated);
};
