import { Request, Response } from 'express';
import EntitlementService from '../services/EntitlementService';
import { EntitlementScope } from '../types/Entitlements';

const entitlementService = new EntitlementService();

export const getDatasetEntitlements = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']! as string;
  const data = await entitlementService.getEntityEntitlements(req.customData, EntitlementScope.DATASETS, slug);
  res.json(data);
};

export const setDatasetEntitlement = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']! as string;
  const data = await entitlementService.setEntityEntitlements(req.customData, EntitlementScope.DATASETS, slug, req.body);
  res.json(data);
};

export const getUserEntitlements = async (req: Request, res: Response) => {
  // Required and enum-validated by the OpenAPI spec — invalid or missing values never reach here.
  const scope = req.query['scope'] as EntitlementScope;
  const data = await entitlementService.getUserEntitlements(req.customData, req.customData.token?.email);
  res.json(data[scope] ?? {});
};
