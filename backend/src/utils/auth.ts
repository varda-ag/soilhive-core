import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from './error';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import { IngestionStatus } from '../types/data';
import { Capability } from '../types/enums';

/**
 * Whether the caller acts under a privileged token scope — internal-request, data-admin or
 * super-admin (see the **Privileged caller** term in CONTEXT.md).
 *
 * This is the system's single notion of privilege and it grants two distinct powers: the
 * Entitlement bypass (datasetCapabilities, EntitlementService.canConfig) and the ability to see Datasets
 * that are not PUBLISHED (DatasetService.getDatasets, datasetExistsFor). They are collapsed on purpose
 * — a second, subtly different predicate is exactly the drift that ADR 0022 documents — so add
 * new privileged behaviour here rather than re-deriving the booleans at the call site.
 *
 * Job processors get their token from jobRequestData, which carries the submitter's flags.
 */
export const isPrivilegedCaller = (token?: Token): boolean => {
  return Boolean(token?.isInternalRequest || token?.isDataAdmin || token?.isSuperAdmin);
};

/**
 * Whether a Dataset at this Ingestion Status exists for the caller: one that is not PUBLISHED is
 * absent, not forbidden, to all but a Privileged caller (docs/adr/0057).
 */
export const datasetExistsFor = (token: Token | undefined, status: IngestionStatus): boolean => {
  return status === IngestionStatus.PUBLISHED || isPrivilegedCaller(token);
};

/**
 * What the caller may do with a Dataset: preview and download if it is public or the caller is
 * privileged, else what is granted on its current slug.
 */
export const datasetCapabilities = (requestData: RequestData, dataset: { slug: string; visibility: 'public' | 'private' }): Capability[] =>
  dataset.visibility === 'public' || isPrivilegedCaller(requestData.token)
    ? [Capability.PREVIEW, Capability.DOWNLOAD]
    : (requestData.entitlements.datasets?.[dataset.slug] ?? []);

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

/**
 * The grant that marks a Machine caller.
 */
const CLIENT_CREDENTIALS_GRANT = 'client_credentials';

/**
 * Resolves the caller's Subject: Entitlements and every `created_by` will take this value:
 * - A **Machine caller** (`gty` equals client-credentials grant) is its `client_id`.
 * - Everyone else is their `email`, else `sub`.
 * Note the ordering: `requireSub` runs first, so a token carrying `client_id` but no `sub` is
 * still a 401 rather than resolving to the client.
 */
export const getSubject = (requestData: RequestData): string => {
  const sub = requireSub(requestData);
  if (requestData.token?.gty === CLIENT_CREDENTIALS_GRANT) {
    return requestData.token.client_id ?? sub;
  }
  return requestData.token?.email ?? sub;
};
