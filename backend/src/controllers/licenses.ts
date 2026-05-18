import { Request, Response } from 'express';
import { idToSlug } from '../utils/slugs';
import LicenseService from '../services/LicenseService';
import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';
import { CreateLicenseInput } from '../types/LicenseInput';

const licenseService = new LicenseService();

export const getLicenses = async (req: Request, res: Response) => {
  const data = await licenseService.getLicenses(req.customData);
  res.json(idToSlug(data));
};

export const getLicense = async (req: Request, res: Response) => {
  const data = await licenseService.getLicense(req.customData, req.params['licenseId']! as string);
  res.json(idToSlug(data));
};

export const createLicense = async (req: Request, res: Response) => {
  const input: CreateLicenseInput = req.body;
  const data = await licenseService.createLicense(req.customData, input);
  res.status(StatusCodes.CREATED).json(idToSlug(data));
};
