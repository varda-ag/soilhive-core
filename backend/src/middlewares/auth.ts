import { Request } from 'express';
import EntitlementService from '../services/EntitlementService';
import { assertPluginTokenAllowed, tokenValidator } from './tokenValidator';
import { getSubject } from '../utils/auth';

const entitlementService = new EntitlementService();

export const authMiddleware = async (req: Request & { openapi?: any }) => {
  // If a token was sent but the route didn't require auth (no bearerAuth security handler ran),
  // validate it anyway so req.customData.token is populated for entitlement checking.
  if (!req.customData.token && req.headers['authorization']?.startsWith('Bearer ')) {
    await tokenValidator(req, []);
  }
  // The validator already refused these; checked again because a route whose security also allows
  // no token drops the security handler's refusal (docs/adr/0065)
  if (req.customData.token?.pluginId) {
    assertPluginTokenAllowed(req);
  }

  const schema = req.openapi?.schema;
  const entitlementsRequired = schema?.['x-entitlements-required'] ?? false;
  if (!entitlementsRequired) {
    req.customData.entitlements = { datasets: {}, configs: {} };
  } else {
    const subject = req.customData.token ? getSubject(req.customData) : undefined;
    const data = await entitlementService.getUserEntitlements(req.customData, subject);
    req.customData.entitlements = data;
  }
};
