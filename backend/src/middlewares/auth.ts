import { Request } from 'express';
import EntitlementService from '../services/EntitlementService';

const entitlementService = new EntitlementService();

export const authMiddleware = async (req: Request & { openapi?: any }): Promise<boolean> => {
  const schema = req.openapi?.schema;
  const entitlementsRequired = schema?.['x-entitlements-required'] ?? false;
  if (!entitlementsRequired || !req.customData.token?.email) {
    req.customData.entitlements = {};
    return true;
  }
  const data = await entitlementService.getUserEntitlements(req.customData, req.customData.token?.email);
  req.customData.entitlements = data;
  return true;
};
