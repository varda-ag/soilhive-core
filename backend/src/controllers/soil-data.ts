import { Request, Response } from 'express';
import SoilDataService from '../services/SoilDataService';

const soilDataService = new SoilDataService();

export const getSoilData = async (req: Request, res: Response) => {
  const data = await soilDataService.getSoilData(
    req.customData,
    req.params['filterId']!,
    req.params['datasets']!,
    parseInt(req.params['limit']!),
    req.params['cursor'],
  );
  res.json(data);
};
