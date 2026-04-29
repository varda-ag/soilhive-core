import { Request, Response } from 'express';
import EntitlementService from '../services/EntitlementService';

const entitlementService = new EntitlementService();

export const getDatasetEntitlements = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']!;
  const data = await entitlementService.getEntityEntitlements(req.customData, slug);
  res.json(data);
};

export const setDatasetEntitlement = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']!;
  const data = await entitlementService.setEntityEntitlements(req.customData, slug, req.body);
  res.json(data);
};

export const getUserEntitlements = async (req: Request, res: Response) => {
  const data = await entitlementService.getUserEntitlements(req.customData, req.customData.token?.email);
  res.json(data);
};
