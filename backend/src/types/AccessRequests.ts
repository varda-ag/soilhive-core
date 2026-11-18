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
  message?: string;
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
  status: AccessRequestStatus;
  created_at: string;
  items: AccessRequestItemView[];
}
