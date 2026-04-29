import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import FilterService from '../services/FilterService';

const filterService = new FilterService();

export const postDataFilters = async (req: Request, res: Response) => {
  const data = await filterService.createFilter(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const getDataFilters = async (req: Request, res: Response) => {
  const data = await filterService.getFilters(req.customData);
  res.json(data);
};

export const getDataFilterById = async (req: Request, res: Response) => {
  const data = await filterService.getFilterById(req.customData, req.params['filterId']!);
  res.json(data);
};

export const getDataFilterCoverage = async (req: Request, res: Response) => {
  const data = await filterService.getCoverage(req.customData, req.params['filterId']!, !!req.query['geometryOnly']);
  res.json(data);
};

export const getDataFilterDatasets = async (req: Request, res: Response) => {
  const data = await filterService.getDatasets(req.customData, req.params['filterId']!);
  res.json(data);
};
