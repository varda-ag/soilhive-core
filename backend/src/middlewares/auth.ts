import { Request } from 'express';
import EntitlementService from '../services/EntitlementService';
import { tokenValidator } from './tokenValidator';

const entitlementService = new EntitlementService();

export const authMiddleware = async (req: Request & { openapi?: any }) => {
  // If a token was sent but the route didn't require auth (no bearerAuth security handler ran),
  // validate it anyway so req.customData.token is populated for entitlement checking.
  if (!req.customData.token && req.headers['authorization']?.startsWith('Bearer ')) {
    await tokenValidator(req, []);
  }

  const schema = req.openapi?.schema;
  const entitlementsRequired = schema?.['x-entitlements-required'] ?? false;
  if (!entitlementsRequired) {
    req.customData.entitlements = {};
  } else {
    const data = await entitlementService.getUserEntitlements(req.customData, req.customData.token?.email);
    req.customData.entitlements = data;
  }
};
