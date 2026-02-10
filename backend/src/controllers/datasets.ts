import { Request, Response } from 'express';
import DatasetService from '../services/DatasetService';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import StatusCodes from 'http-status-codes';
import { getNewPath, idToSlug } from '../utils/slugs';

const datasetService = new DatasetService();

export const getDatasets = async (req: Request, res: Response) => {
  const data = await datasetService.getDatasets(req.customData);
  res.json(idToSlug(data));
};

export const getDataset = async (req: Request, res: Response) => {
  const oldId = req.params['datasetId']!;
  const data = await datasetService.getDataset(req.customData, oldId);

  if (data.slug !== oldId) {
    const newPath = getNewPath(req.path, oldId, data.slug);
    res.redirect(StatusCodes.MOVED_PERMANENTLY, newPath);
    return;
  }

  res.json(idToSlug(data));
};

export const createDataset = async (req: Request, res: Response) => {
  const input: CreateDatasetInput = req.body;
  const data = await datasetService.createDataset(req.customData, input);
  res.json(idToSlug(data));
};

export const updateDataset = async (req: Request, res: Response) => {
  const input: UpdateDatasetInput = req.body;
  const data = await datasetService.updateDataset(req.customData, req.params['datasetId']!, input);
  res.json(idToSlug(data));
};

export const deleteDataset = async (req: Request, res: Response) => {
  await datasetService.deleteDataset(req.customData, req.params['datasetId']!);
  res.status(StatusCodes.NO_CONTENT).send();
};

export const postBulkLoad = async (req: Request, res: Response) => {
  const data = await datasetService.createBulkLoad(req.customData, req.params['datasetId']!);
  res.status(StatusCodes.CREATED).json(data);
};

export const getBulkLoad = async (req: Request, res: Response) => {
  const data = await datasetService.getBulkLoad(req.customData, req.params['datasetId']!);
  res.json(data);
};

export const getBulkLoadById = async (req: Request, res: Response) => {
  const data = await datasetService.getBulkLoadById(req.customData, req.params['bulkLoadId']!);
  res.json(data);
};
