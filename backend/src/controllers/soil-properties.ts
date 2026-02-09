import { Request, Response } from 'express';
import SoilPropertyService from '../services/SoilPropertyService';

const soilPropertyService = new SoilPropertyService();

export const getSoilProperties = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperties(req.customData);
  const dataWithSlugs = await soilPropertyService.propertiesIdToSlugs(req.customData, data);
  res.json(dataWithSlugs);
};

export const getSoilProperty = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperty(req.customData, req.params['soilPropertyId']!);
  const dataWithSlugs = await soilPropertyService.propertiesIdToSlugs(req.customData, data);
  res.json(dataWithSlugs);
};
