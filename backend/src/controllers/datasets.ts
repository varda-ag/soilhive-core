import { Request, Response } from 'express';
import DatasetService from '../services/DatasetService';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';

const datasetService = new DatasetService();

export const getDatasets = async (req: Request, res: Response) => {
  const data = await datasetService.getDatasets(req.customData);
  res.json(data);
};

export const getDataset = async (req: Request, res: Response) => {
  const slug = req.params['datasetSlug']!;
  const data = await datasetService.getDataset(req.customData, slug);
  if (data.slug !== slug) {
    res.redirect(301, `/datasets/${data.slug}`);
    return;
  }
  res.json(data);
};

export const createDataset = async (req: Request, res: Response) => {
  const input: CreateDatasetInput = req.body;
  const data = await datasetService.createDataset(req.customData, input);
  res.json(data);
};

export const updateDataset = async (req: Request, res: Response) => {
  const input: UpdateDatasetInput = req.body;
  const data = await datasetService.updateDataset(req.customData, req.params['datasetSlug']!, input);
  res.json(data);
};

export const deleteDataset = async (req: Request, res: Response) => {
  await datasetService.deleteDataset(req.customData, req.params['datasetSlug']!);
  res.status(204).send();
};
