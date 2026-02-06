import { Request, Response } from 'express';
import SoilPropertyService from '../services/SoilPropertyService';

const soilPropertyService = new SoilPropertyService();

export const getSoilProperties = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperties(req.customData);
  res.json(data);
};

export const getSoilProperty = async (req: Request, res: Response) => {
  const data = await soilPropertyService.getSoilProperty(req.customData, req.params['soilPropertyId']!);
  res.json(data);
};
