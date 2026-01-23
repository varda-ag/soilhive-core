import { Request, Response } from 'express';
import DatasetService from '../services/DatasetService';

const datasetService = new DatasetService();

export const getDatasets = async (req: Request, res: Response) => {
  const data = await datasetService.getDatasets(req.customData);
  res.json(data);
};

export const getDataset = async (req: Request, res: Response) => {
  const data = await datasetService.getDataset(req.customData, req.params['datasetSlug']!);
  res.json(data);
};
