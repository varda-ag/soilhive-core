import { Request, Response } from 'express';
import ConfigService from '../services/ConfigService';

export const getConfig = (req: Request, res: Response): void => {
  const config = ConfigService.getPublicStorageConfig();
  res.json(config);
};
