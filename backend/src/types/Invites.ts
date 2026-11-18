import { EntitlementScope, type Entitlements } from './Entitlements';
import { Capability } from './enums';

export const INVITE_DEFAULT_DAYS = 7;
export const INVITE_MAX_DAYS = 30;

/** What an Invite may grant, per scope (docs/adr/0082). */
export const INVITE_CAPABILITIES: Record<EntitlementScope, readonly Capability[]> = {
  [EntitlementScope.DATASETS]: [Capability.PREVIEW, Capability.DOWNLOAD],
  [EntitlementScope.CONFIGS]: [Capability.READ, Capability.WRITE],
};

export type InviteStatus = 'pending' | 'used' | 'expired';

export interface InviteCreateBody {
  grants: Entitlements;
  recipient?: string;
  reusable?: boolean;
  expires_in_days?: number;
}

export interface InviteRedemption {
  subject: string;
  redeemed_at: string;
}

export interface InviteView {
  id: string;
  grants: Entitlements;
  recipient: string | null;
  reusable: boolean;
  status: InviteStatus;
  expires_at: string;
  created_by: string;
  created_at: string;
  redemptions: InviteRedemption[];
}

/** Only returned once, on creation: the token is never stored, only its hash. */
export interface InviteCreated extends InviteView {
  token: string;
}
