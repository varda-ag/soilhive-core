import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import VectorDataLoad from '../data-layer/VectorDataLoad';
import DataMappingService from '../services/DataMappingService';
import DatasetService from '../services/DatasetService';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getNewPath, idToSlug } from '../utils/slugs';
import DatasetFileMappingService from '../services/DatasetFileMappingService';

const vectorDataLoad = new VectorDataLoad();
const dataMappingService = new DataMappingService();
const datasetService = new DatasetService();
const datasetFileMappingService = new DatasetFileMappingService();

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
  res.status(StatusCodes.CREATED).json(idToSlug(data));
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

export const postSoilData = async (req: Request, res: Response) => {
  const datasetFileMappingId = req.params['datasetFileMappingId'] as string;
  const datasetFileMapping = await datasetFileMappingService.getDatasetFileMapping(req.customData, datasetFileMappingId);
  const dataMappingConfig = await dataMappingService.parseDataMapping(req.customData, datasetFileMapping.data_mapping_id as string);
  const dataset = await datasetService.getDataset(req.customData, req.params['datasetId'] as string);
  for (const record of req.body) {
    await vectorDataLoad.rawRecordToDataModel(req.customData.entityManager, dataMappingConfig, record, dataset.id);
  }
  res.status(201).send();
};

export const getDatasetFiles = async (req: Request, res: Response) => {
  const id = req.params['datasetId']!;
  const datasetFileMappings = await datasetFileMappingService.getMappings(req.customData, id, undefined, ['file']);
  const files = datasetFileMappings.map(m => m.file);
  return res.json(idToSlug(files));
};

export const getDatasetMappings = async (req: Request, res: Response) => {
  const id = req.params['datasetId']!;
  const datasetFileMappings = await datasetFileMappingService.getMappings(req.customData, id, undefined, ['data_mapping']);
  const dataMappings = datasetFileMappings.map(m => m.data_mapping).filter(m => m !== null && m !== undefined);
  return res.json(idToSlug(dataMappings));
};

export const getEpsgCodes = async (req: Request, res: Response) => {
  const epsgCodes = datasetService.getEpsgCodes();
  res.json(epsgCodes);
};

export const getSoilData = async (req: Request, res: Response) => {
  const data = await datasetService.getSoilData(
    req.customData,
    req.params['datasetFileMappingId']!,
    parseInt(req.query['limit'] as string),
    req.query['cursor'] as string,
    req.query['sort'] as string,
  );
  res.json(data);
};
