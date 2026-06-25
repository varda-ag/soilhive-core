import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { parseBboxString } from '../utils/geometry';
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
  const data = await filterService.getDataFilterEntityById(req.customData, req.params['filterId']! as string);
  res.json(data);
};

export const getDataFilterCoverage = async (req: Request, res: Response) => {
  const data = await filterService.getCoverage(req.customData, req.params['filterId']! as string, !!req.query['geometryOnly']);
  res.json(data);
};

export const getDataFilterDatasets = async (req: Request, res: Response) => {
  const data = await filterService.getDatasets(req.customData, req.params['filterId']! as string);
  res.json(data);
};

export const getDai = async (req: Request, res: Response): Promise<void> => {
  const filterId = req.params['filterId']! as string;
  const { bbox: bboxString, resolution } = req.query;
  const bbox = parseBboxString(bboxString! as string);
  const dai = await filterService.getDai(req.customData, bbox, Number(resolution!), filterId);
  res.json(dai);
};
