import { Capability } from './enums';

export const ACCESS_REQUEST_MAX_DATASETS = 50;

/** What an Access Request may ask for (docs/adr/0082). */
export const ACCESS_REQUEST_CAPABILITIES: readonly Capability[] = [Capability.PREVIEW, Capability.DOWNLOAD];

export type AccessRequestItemStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

/** `pending` while any Dataset in it waits for a decision; `withdrawn` when its requester withdrew all that was left. */
export type AccessRequestStatus = 'pending' | 'finished' | 'withdrawn';

export interface AccessRequestCreateBody {
  datasets: string[];
  capabilities: Capability[];
  message: string;
  requester_name: string;
  /** ISO 3166-1 alpha-2; access-requests.yaml lists the codes. */
  country: string;
  organisation: string;
  /** A bare domain gets `https://`. */
  organisation_website?: string;
}

export interface AccessRequestDecision {
  dataset: string;
  approve: boolean;
  capabilities?: Capability[];
  reason?: string;
}

export interface AccessRequestItemView {
  /** The Dataset's state is shown to admins only: an approval needs it published, private and not archived. */
  dataset: { slug: string; name: string; visibility?: 'public' | 'private'; published?: boolean; archived?: boolean };
  status: AccessRequestItemStatus;
  granted: Capability[] | null;
  reason: string | null;
  decided_at: string | null;
  /** Shown to admins only. */
  decided_by?: string | null;
}

export interface AccessRequestView {
  id: string;
  requested_by: string;
  capabilities: Capability[];
  message: string | null;
  /** Null on requests made before these were asked for, as `message` may be. */
  requester_name: string | null;
  country: string | null;
  organisation: string | null;
  organisation_website: string | null;
  status: AccessRequestStatus;
  created_at: string;
  items: AccessRequestItemView[];
}
