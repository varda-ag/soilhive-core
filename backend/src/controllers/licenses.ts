import { Request, Response } from 'express';
import { idToSlug } from '../utils/slugs';
import LicenseService from '../services/LicenseService';

const licenseService = new LicenseService();

export const getLicenses = async (req: Request, res: Response) => {
  const data = await licenseService.getLicenses(req.customData);
  res.json(idToSlug(data));
};

export const getLicense = async (req: Request, res: Response) => {
  const data = await licenseService.getLicense(req.customData, req.params['licenseId']!);
  res.json(idToSlug(data));
};
