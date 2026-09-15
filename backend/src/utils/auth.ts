import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from './error';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';

/**
 * Whether the caller acts under a privileged token scope — internal-request, data-admin or
 * super-admin (see the **Privileged caller** term in CONTEXT.md).
 *
 * This is the system's single notion of privilege and it grants two distinct powers: the
 * Entitlement bypass (EntitlementService.enforceEntitlements) and the ability to see Datasets
 * that are not PUBLISHED (DatasetService.getDatasets/getDataset). They are collapsed on purpose
 * — a second, subtly different predicate is exactly the drift that ADR 0022 documents — so add
 * new privileged behaviour here rather than re-deriving the booleans at the call site.
 *
 * Background jobs build `Token` by hand, so a processor that forgets to carry the submitter's
 * isDataAdmin/isSuperAdmin through from its job payload silently becomes non-privileged.
 */
export const isPrivilegedCaller = (token?: Token): boolean => {
  return Boolean(token?.isInternalRequest || token?.isDataAdmin || token?.isSuperAdmin);
};

/**
 * Returns the authenticated user's id (the token `sub` claim), throwing a 401 if it is absent.
 *
 * The token validator middleware guarantees `sub` on HTTP routes, but `RequestData.token` is
 * optional (e.g. background jobs construct it directly), so callers that need a user id assert
 * it here rather than relying on the middleware being wired on every path.
 */
export const requireSub = (requestData: RequestData): string => {
  const sub = requestData.token?.sub;
  if (!sub) {
    throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
  }
  return sub;
};

export const getSubject = (requestData: RequestData): string => {
  const sub = requireSub(requestData);
  const email = requestData.token?.email;
  const client_id = requestData.token?.client_id;
  return email ?? client_id ?? sub; // Prefer email, then client_id, then sub as a fallback
};
