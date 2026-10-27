import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import RasterFilterService from '../services/RasterFilterService';

const rasterFilterService = new RasterFilterService();

export const getRasterFilters = async (req: Request, res: Response) => {
  res.json(await rasterFilterService.getRasterFilters(req.customData));
};

export const getRasterFilter = async (req: Request, res: Response) => {
  res.json(await rasterFilterService.getRasterFilter(req.customData, req.params['rasterFilterId']! as string));
};

export const createRasterFilter = async (req: Request, res: Response) => {
  const data = await rasterFilterService.createRasterFilter(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const patchRasterFilter = async (req: Request, res: Response) => {
  const { active, name, description } = req.body;
  const data = await rasterFilterService.patchRasterFilter(req.customData, req.params['rasterFilterId']! as string, {
    active,
    name,
    description,
  });
  res.json(data);
};

export const putRasterFilterMappings = async (req: Request, res: Response) => {
  const data = await rasterFilterService.putMappings(req.customData, req.params['rasterFilterId']! as string, req.body);
  res.json(data);
};

export const deleteRasterFilter = async (req: Request, res: Response) => {
  await rasterFilterService.deleteRasterFilter(req.customData, req.params['rasterFilterId']! as string);
  res.status(StatusCodes.NO_CONTENT).send();
};
