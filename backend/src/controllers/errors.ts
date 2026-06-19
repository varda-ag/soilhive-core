import { Request, Response } from 'express';
import ErrorService from '../services/ErrorService';

const errorService = new ErrorService();

export const getDatasetErrors = async (req: Request, res: Response) => {
  const data = await errorService.getDatasetErrors(req.customData);
  res.json(data);
};
