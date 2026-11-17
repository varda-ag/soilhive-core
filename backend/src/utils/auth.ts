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
 * The Ingestion Statuses of the Datasets a filter's coverage and dataset list include for the caller:
 * PUBLISHED, and LOADED too for a Privileged caller, so an admin can review a loaded Dataset, a
 * Dataset Version included, on the map and in the explorer before it's published. A PENDING or STAGED
 * Dataset may hold a partial first load, so it's left out. Bound as a query parameter, so the query
 * cache keeps the two callers' results apart.
 */
export const listedDatasetStatuses = (token: Token | undefined): IngestionStatus[] => {
  return isPrivilegedCaller(token) ? [IngestionStatus.PUBLISHED, IngestionStatus.LOADED] : [IngestionStatus.PUBLISHED];
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

/** Whether the token is a **Machine caller**'s; a caller of unknown kind is a person. */
export const isMachineCaller = (token?: Token): boolean => token?.gty === CLIENT_CREDENTIALS_GRANT;

/**
 * A person's access token `email`, exactly as sent. Undefined for a Machine caller, and when the
 * claim is absent or blank: taken as it is, every person whose token carries a blank one would
 * share the Subject `''`, and each other's grants.
 */
const personEmail = (token?: Token): string | undefined => {
  const email = token?.email;
  return !isMachineCaller(token) && typeof email === 'string' && email.trim() ? email : undefined;
};

/**
 * Resolves the caller's Subject: Entitlements and every `created_by` will take this value:
 * - A **Machine caller** (`gty` equals client-credentials grant) is its `client_id`.
 * - Everyone else is their `email`, else `sub`. A blank `email` counts as none (see personEmail).
 *   Any other email is kept exactly as sent, so no existing Subject changes.
 * Note the ordering: `requireSub` runs first, so a token carrying `client_id` but no `sub` is
 * still a 401 rather than resolving to the client.
 */
export const getSubject = (requestData: RequestData): string => {
  const sub = requireSub(requestData);
  if (isMachineCaller(requestData.token)) {
    return requestData.token!.client_id ?? sub;
  }
  return personEmail(requestData.token) ?? sub;
};

/**
 * The caller's Subject, which must be their email: a person whose access token carries one. A 403
 * with `email_required` for a Machine caller, and for a person whose token has no `email`, whose
 * Subject is then their `sub`. For the flows that grant to the caller and must not grant to a
 * `sub` (docs/adr/0081). `action` completes the message, e.g. "redeem an Invite".
 */
export const requireEmailSubject = (requestData: RequestData, action: string): string => {
  requireSub(requestData);
  const email = personEmail(requestData.token);
  if (!email) {
    throw new ErrorResponse(
      `Only a person signed in with an email address can ${action}. Your sign-in does not share an email address with this service.`,
      StatusCodes.FORBIDDEN,
      { email_required: true },
    );
  }
  return email;
};

/**
 * The Subject the caller acts under, or undefined when the request carries no token. Unlike
 * getSubject, an anonymous caller is not a 401: it is covered by EVERYONE's grants.
 */
export const subjectOf = (requestData: RequestData): string | undefined => (requestData.token ? getSubject(requestData) : undefined);
