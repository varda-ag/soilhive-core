import { Request } from 'express';
import EntitlementService from '../services/EntitlementService';
import { assertPluginTokenAllowed, tokenValidator } from './tokenValidator';
import { subjectOf } from '../utils/auth';

const entitlementService = new EntitlementService();

export const authMiddleware = async (req: Request & { openapi?: any }) => {
  // If a token was sent but the route didn't require auth (no bearerAuth security handler ran),
  // validate it anyway so req.customData.token is populated for entitlement checking.
  // A runner route's bearer is a runner assertion, never a core token (docs/adr/0078).
  const runnerRoute = req.openapi?.schema?.security?.some((s: object) => 'runnerAuth' in s);
  if (!req.customData.token && !runnerRoute && req.headers['authorization']?.startsWith('Bearer ')) {
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
    const data = await entitlementService.getUserEntitlements(req.customData, subjectOf(req.customData));
    req.customData.entitlements = data;
  }
};
