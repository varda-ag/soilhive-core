import { Request, Response } from 'express';
import DataMappingService from '../services/DataMappingService';
import VectorDataLoad from '../data-layer/VectorDataLoad';

const vectorDataLoad = new VectorDataLoad();

export const getDataPreview = async (req: Request, res: Response) => {
  const service = new DataMappingService();
  const dataMappingConfig = await service.parseDataMapping(req.customData, 
    req.query['dataMappingId'] as string, 
    req.query['fileSlug'] as string,
  );
  const data = await vectorDataLoad.getDataPreview(
    req.customData.entityManager,
    dataMappingConfig,
    parseInt(req.query['limit'] as string),
  );
  res.json(data);
};

export const loadRecord = async (req: Request, res: Response) => {
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(req.customData, 
      req.query['dataMappingId'] as string, 
      req.query['fileSlug'] as string,
    );
    await vectorDataLoad.rawRecordToDataModel(req.customData.entityManager, dataMappingConfig, 10002, dataset.id);

    res.json(data);
  };
