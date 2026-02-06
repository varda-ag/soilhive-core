import { Request, Response } from 'express';
import SoilPropertyService from '../services/SoilPropertyService';
import { idToSlug } from '../utils/slugs';

const soilPropertyService = new SoilPropertyService();

export const getSoilProperties = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperties(req.customData);
  res.json(idToSlug(data));
};

export const getSoilProperty = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperty(req.customData, req.params['soilPropertyId']!);
  res.json(idToSlug(data));
};
